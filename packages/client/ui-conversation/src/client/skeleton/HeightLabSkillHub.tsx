/**
 * HeightLab 2026-10-14：技能中心（左侧「技能」一级入口的落地页）。
 * 三栏：① 官方技能市场（内置精选，SKILL_BODIES 注册表）
 *      ② 我的技能（$DSH_HOME/skills 用户沉淀，host /hl/skills CRUD）
 *      ③ 创建（表单直建 / 去聊天沉淀）。
 * 官方「使用」与我的「使用」都经 hl:fill-draft 注入加载指令；
 * 创建走聊天 = 关闭技能中心回到会话，附沉淀引导草稿。
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { SKILL_BODIES } from './HeightLabSkillBodies.ts'
import { skillArtwork, skillArtStyle } from './HeightLabSkillArtwork.tsx'
import css from './HeightLabSkillHub.module.css'

type UserSkill = { name: string; description: string; updatedAt: number }
type Tab = 'market' | 'official' | 'square' | 'mine' | 'create'

/** 在线市场的一条结果（与 /hl/skills/market 返回一致）。 */
interface MarketSkill {
  slug: string
  namespace?: string
  name: string
  description: string
  installs?: number
  downloads?: number
  version?: string
  category?: string
  homepage?: string
}

function loadUserSkills(): Promise<UserSkill[]> {
  return fetch('/hl/skills', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => (Array.isArray(d?.skills) ? d.skills : []))
    .catch(() => [])
}

export function HeightLabSkillHub({ onClose, embedded }: { onClose: () => void; embedded?: boolean }): ReactNode {
  const [tab, setTab] = useState<Tab>('official')
  /* N7b（0.5.7 技能广场）：社区共享——浏览他人发布 / 发布我的 / 一键安装。 */
  interface SquareRow {
    id: number
    owner_name: string
    name: string
    description: string
    installs: number
    mine: boolean
  }
  const [square, setSquare] = useState<SquareRow[] | null>(null)
  const [squareBusy, setSquareBusy] = useState(false)
  const [mine, setMine] = useState<UserSkill[] | null>(null)
  const [form, setForm] = useState({ name: '', description: '', steps: '' })
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /* 在线市场（2026-10-22）：原来「官方技能市场」栏只是 13 个编译期硬编码，
   * 用户无法从这里装新技能。现在接 /hl/skills/market（skillhub.cn 同源），
   * 与 Agent 侧 capability_search 搜到的是同一批。 */
  const [marketQuery, setMarketQuery] = useState('')
  const [market, setMarket] = useState<MarketSkill[] | null>(null)
  const [marketBusy, setMarketBusy] = useState(false)

  const refreshMine = useCallback((): void => {
    loadUserSkills().then(list => setMine(list))
  }, [])
  useEffect(() => { refreshMine() }, [refreshMine])

  /* HeightLab（2026-10-22）：让外部能直接落到「我的技能」页。
   *
   * 场景：模型刚沉淀完一个技能，回复里要告诉用户「已存到 插件·技能 → 我的技能」，
   * 并给一个可点链接直达。只给文字，用户还得自己找三层入口。
   *
   * 这里必须处理**两种时序**，否则链接会「打开技能中心但停在官方精选」：
   *   ① 本组件已挂载 → 直接监听 hl:open-skill 生效；
   *   ② 本组件尚未挂载（页面刚开、或当前不在技能页）→ 事件先于挂载到达，
   *      监听器还没注册，事件丢掉。调用方同时写入 `window.__hlPendingSkillTab`，
   *      我们在挂载时消费一次。
   *
   * `refreshMine` 必须重跑：新写的 SKILL.md 是刚落盘的，组件缓存的列表还是旧的。
   * 消费后立刻清标记（与 ConversationRoot 消费 __hlPendingHub 同一条纪律：
   * 不清就会在下次挂载时被再消费一次，表现为「关掉后又被弹回去」）。 */
  useEffect(() => {
    const applyTab = (tab?: Tab, refresh?: boolean): void => {
      setTab(tab ?? 'mine')
      if (refresh !== false) refreshMine()
    }
    const onOpenSkill = (event: Event): void => {
      const detail = (event as CustomEvent<{ tab?: Tab; refresh?: boolean }>).detail
      applyTab(detail?.tab, detail?.refresh)
    }
    window.addEventListener('hl:open-skill', onOpenSkill)
    const pending = (window as unknown as { __hlPendingSkillTab?: Tab | null }).__hlPendingSkillTab
    if (pending !== undefined && pending !== null) {
      ;(window as unknown as { __hlPendingSkillTab?: Tab | null }).__hlPendingSkillTab = null
      applyTab(pending, true)
    }
    return () => { window.removeEventListener('hl:open-skill', onOpenSkill) }
  }, [refreshMine])

  /* 2026-11-09（用户实测「这些技能是不是真的能点击使用」）：官方精选的
   * SKILL.md 本体在 `~/.heightlab/yunj-skills/<name>/`（随包模板播种），
   * **不在** DSH 技能发现根（$DSH_HOME/skills、~/.agents/skills）——旧
   * prompt 只说「技能目录下 <name>/SKILL.md，可用 skill 工具读取」，Agent
   * 在发现根里找不到该技能，点了等于空转。现直接给绝对路径（fs 读取），
   * 并说明「不要等 skill 工具」。 */
  const useOfficialPrompt = (name: string): string =>
    `请先读取技能文件 ~/.heightlab/yunj-skills/${name}/SKILL.md（用 fs 工具直接读取，不要依赖 skill 工具枚举），严格按其流程执行我的任务：\n`

  /* 「我的技能」由 host 落到 $DSH_HOME/skills（DSH 发现根内），skill 工具
   * 可按名加载——保持原语义。 */
  const useSkillPrompt = (name: string): string =>
    `请加载技能「${name}」（可用 skill 工具按名加载，或直接读 ~/.heightlab/dsh-home/skills/${name}/SKILL.md），严格按其流程执行我的任务：\n`

  const useInChat = (prompt: string): void => {
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    window.dispatchEvent(new CustomEvent('hl:fill-draft', { detail: { text: prompt } }))
  }

  const createUserSkill = (): void => {
    if (creating) return
    setCreating(true)
    setNotice(null)
    fetch('/hl/skills/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(r => r.json())
      .then((d) => {
        setCreating(false)
        if (d?.ok) {
          setNotice(`技能「${d.name}」已创建，可直接使用或发送消息调用`)
          setForm({ name: '', description: '', steps: '' })
          refreshMine()
        } else {
          setNotice(`创建失败：${d?.error ?? '未知错误'}`)
        }
      })
      .catch(() => { setCreating(false); setNotice('创建失败，请稍后重试') })
  }

  const deleteUserSkill = (name: string): void => {
    fetch('/hl/skills/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(r => r.json())
      .then((d) => { if (d?.ok) refreshMine() })
      .catch(() => { /* 下次刷新可见 */ })
  }

  const searchMarket = useCallback((query: string) => {
    const q = query.trim()
    if (q === '') { setMarket([]); return }
    setMarketBusy(true)
    fetch(`/hl/skills/market?q=${encodeURIComponent(q)}&limit=40`)
      .then(r => r.json())
      .then((d) => {
        if (d?.ok) setMarket(d.results as MarketSkill[])
        else setNotice(d?.error === 'MARKET_UNAVAILABLE' ? '技能市场暂时连不上，稍后再试' : null)
      })
      .catch(() => { setNotice('技能市场暂时连不上，稍后再试') })
      .finally(() => { setMarketBusy(false) })
  }, [])

  /* 从市场装一个技能：走与 Agent 完全相同的审批链路。
   * 页面上点「安装」= 用户已经明确同意，所以这里直接带 confirm。
   * 真正的写盘仍由 capability_install 完成（同一个 store，路径围栏一致）。 */
  const installFromMarket = useCallback((skill: MarketSkill) => {
    setNotice(`正在安装 ${skill.name}…`)
    fetch('/hl/skills/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: skill.slug, namespace: skill.namespace, name: skill.name, version: skill.version }),
    })
      .then(r => r.json())
      .then((d) => {
        setNotice(d?.ok ? `已安装 ${skill.name}，可直接使用` : `安装失败：${d?.error ?? '未知原因'}`)
        if (d?.ok) refreshMine()
      })
      .catch(() => { setNotice('安装失败：宿主不可达') })
  }, [])

  /* 广场 API 走云端（/api/market/square，鉴权用户）；安装落盘走宿主 /hl/skills/import。 */
  const cloudApi = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.'))
    ? `${window.location.protocol}//${window.location.hostname}`
    : 'https://heightlabai.com'
  const refreshSquare = useCallback((): void => {
    setSquareBusy(true)
    fetch(`${cloudApi}/api/market/square`, { headers: { 'content-type': 'application/json' } })
      .then(r => r.json())
      .then((d) => { setSquare(Array.isArray(d?.skills) ? d.skills : []); setSquareBusy(false) })
      .catch(() => { setSquare([]); setSquareBusy(false) })
  }, [cloudApi])
  const installSquare = useCallback((row: { id: number; name: string }): void => {
    setSquareBusy(true)
    fetch(`${cloudApi}/api/market/square/${row.id}/install`, { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(r => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error ?? 'failed')
        return fetch('/hl/skills/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: d.name ?? row.name, content: d.content }),
        })
      })
      .then(r => r.json())
      .then((d) => {
        setSquareBusy(false)
        setNotice(d?.ok ? `已安装「${row.name}」到我的技能` : `安装失败：${d?.error ?? '未知原因'}`)
        if (d?.ok) refreshMine()
      })
      .catch(() => { setSquareBusy(false); setNotice('安装失败（需登录账号）') })
  }, [cloudApi])
  const unpublishSquare = useCallback((row: { id: number; name: string }): void => {
    setSquareBusy(true)
    fetch(`${cloudApi}/api/market/square/${row.id}`, { method: 'DELETE' })
      .then(() => { setSquareBusy(false); setNotice(`已下架「${row.name}」`); refreshSquare() })
      .catch(() => { setSquareBusy(false) })
  }, [cloudApi, refreshSquare])
  const publishMine = useCallback((name: string): void => {
    fetch(`/hl/skills/content?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then((d) => {
        if (!d?.ok || typeof d.content !== 'string') throw new Error(d?.error ?? 'no content')
        return fetch(`${cloudApi}/api/market/square`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, content: d.content, description: d.description ?? '' }),
        })
      })
      .then(r => r.json())
      .then((d) => {
        setNotice(d?.ok ? `「${name}」已发布到广场` : `发布失败：${d?.error ?? '未知原因'}`)
        if (d?.ok) { refreshSquare() }
      })
      .catch((err) => { setNotice(`发布失败：${err instanceof Error ? err.message : '需登录账号'}`) })
  }, [cloudApi, refreshSquare])

  const official = Object.entries(SKILL_BODIES).map(([id, s]) => ({
    id,
    name: s.dir,
    title: s.title,
    body: s.body,
  }))

  return (
    <div className={clsx(css.skillHubRoot, embedded && css.skillHubRootEmbedded)} data-hl-skill-hub="1">
      <div className={css.skillHubHeader}>
        <div className={css.skillHubTitle}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>技能中心</span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
            把可复用的流程沉淀为技能；官方市场持续更新
          </span>
        </div>
        {!embedded && <button type="button" className={css.skillHubClose} aria-label="关闭" onClick={onClose}>×</button>}
      </div>
      <div className={css.skillHubTabs}>
        {([
          ['market', '技能市场'],
          ['official', `官方精选（${official.length}）`],
          ['square', '技能广场'],
          ['mine', `我的技能（${mine?.length ?? 0}）`],
          ['create', '创建技能'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={css.skillHubTabButton}
            data-active={tab === id}
            onClick={() => { setTab(id); if (id === 'square' && square === null) refreshSquare() }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={css.skillHubBody}>
        {tab === 'market' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={marketQuery}
                onChange={event => setMarketQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') searchMarket(marketQuery) }}
                placeholder="搜索在线技能（如 pdf、表格、爬虫）"
                style={{ flex: 1, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-specific-input-major)', color: 'inherit', fontSize: 13 }}
              />
              <button type="button" className={css.skillHubAction} disabled={marketBusy} onClick={() => searchMarket(marketQuery)}>
                {marketBusy ? '搜索中…' : '搜索'}
              </button>
            </div>
            {market !== null && market.length === 0 && !marketBusy && (
              <div style={{ fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)' }}>
                输入关键词后回车搜索。技能来自 skillhub.cn，与对话里让 AI 自己搜的是同一批。
              </div>
            )}
            <div className={css.skillHubColumns}>
              {(market ?? []).map(skill => (
                <div key={skill.slug} className={css.skillHubCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={skillArtStyle}>{skillArtwork(skill.name, skill.description)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, lineHeight: '20px' }}>{skill.name}</span>
                      <span style={{ display: 'block', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' }}>
                        {skill.category ?? '技能'}{skill.installs !== undefined && skill.installs > 0 ? ` · ${skill.installs.toLocaleString('en-US')} 次安装` : ''}
                      </span>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {skill.description || '（无描述）'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={css.skillHubAction} onClick={() => installFromMarket(skill)}>
                      安装
                    </button>
                    <button type="button" className={css.skillHubAction} onClick={() => useInChat(`请用 capability_search 查一下 ${skill.name} 这个技能，然后告诉我它能做什么`)}>
                      问问 AI
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'square' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
                社区共享的技能，一键装进「我的技能」；发布需登录账号
              </span>
              <button type="button" className={css.skillHubAction} disabled={squareBusy} onClick={refreshSquare}>刷新</button>
            </div>
            {(square ?? []).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)', padding: '24px 0', textAlign: 'center' }}>
                {squareBusy ? '加载中…' : '广场还没有技能——到「我的技能」把你的沉淀发布出来'}
              </div>
            )}
            {(square ?? []).map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l3)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {row.name}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontWeight: 400 }}>
                      {row.owner_name} · {row.installs} 次安装{row.mine ? ' · 我发布的' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || '（无描述）'}
                  </div>
                </div>
                {row.mine
                  ? <button type="button" className={css.skillHubAction} disabled={squareBusy} onClick={() => unpublishSquare(row)}>下架</button>
                  : <button type="button" className={css.skillHubAction} disabled={squareBusy} onClick={() => installSquare(row)}>安装</button>}
              </div>
            ))}
          </div>
        )}
        {tab === 'official' && (
          <div className={css.skillHubColumns}>
            {official.map(skill => (
              /* 2026-11-09（用户拍板「UI 必须和场景创作/资产空间统一」）：
               * 彩色渐变图标头行（44px 描边框）+ 名称/描述统一行距（4/6/10），
               * 与 hub 页模块卡同一套语言。 */
              <div key={skill.id} className={css.skillHubCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={skillArtStyle}>{skillArtwork(skill.name, skill.title)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: '20px', minWidth: 0 }}>
                    {skill.title}
                  </span>
                </div>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {skill.body.split('\n').find(l => l.trim() && !l.startsWith('#') && l.trim() !== '---') ?? ''}
                </div>
                <button
                  type="button"
                  className={css.skillHubAction}
                  onClick={() => useInChat(useOfficialPrompt(skill.name))}
                >
                  使用此技能
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === 'mine' && (
          <div className={css.skillHubColumns}>
            {(mine ?? []).map(skill => (
              <div key={skill.name} className={css.skillHubCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={skillArtStyle}>{skillArtwork(skill.name, skill.description)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: '20px', minWidth: 0 }}>{skill.name}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {skill.description || '（无描述）'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={css.skillHubAction}
                    onClick={() => useInChat(useSkillPrompt(skill.name))}
                  >
                    使用
                  </button>
                  {/* N7b（0.5.7 技能广场）：一键把我的沉淀发布给其他用户。 */}
                  <button
                    type="button"
                    className={css.skillHubAction}
                    onClick={() => { if (window.confirm(`把技能「${skill.name}」发布到广场？其他登录用户可浏览与安装。`)) publishMine(skill.name) }}
                  >
                    发布
                  </button>
                  <button
                    type="button"
                    className={css.skillHubAction}
                    data-danger="1"
                    onClick={() => { if (window.confirm(`删除技能「${skill.name}」？`)) deleteUserSkill(skill.name) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {mine?.length === 0 && (
              <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
                还没有沉淀的技能——去「创建技能」，或在对话完成后把流程沉淀下来。
              </div>
            )}
          </div>
        )}
        {tab === 'create' && (
          <div className={css.skillHubCreate}>
            <label className={css.skillHubField}>
              <span>技能名称（英文/数字/中划线）</span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="my-weekly-report"
              />
            </label>
            <label className={css.skillHubField}>
              <span>一句话描述（何时该用它）</span>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="当我需要整理周报数据时使用"
              />
            </label>
            <label className={css.skillHubField}>
              <span>执行步骤（每行一步）</span>
              <textarea
                value={form.steps}
                onChange={e => setForm(f => ({ ...f, steps: e.target.value }))}
                rows={6}
                placeholder={'1. 收集本周会话要点\n2. 按项目分组输出\n3. 生成下周计划'}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className={css.skillHubAction} onClick={createUserSkill} disabled={creating}>
                {creating ? '创建中…' : '创建技能'}
              </button>
              <button
                type="button"
                className={css.skillHubSecondary}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('hl:close-hub'))
                  const guide = form.name || form.description
                    ? `我想把下面这个流程沉淀成可复用的技能（名字：${form.name || '待定'}；用途：${form.description || '待补充'}）：\n${form.steps}\n\n请帮我整理成标准技能文件。`
                    : '我想把刚才对话里的流程沉淀成可复用的技能，请帮我整理成标准技能文件（名称/触发时机/执行步骤）。'
                  window.dispatchEvent(new CustomEvent('hl:fill-draft', { detail: { text: guide } }))
                }}
              >
                去聊天创建
              </button>
              {notice && <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{notice}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
