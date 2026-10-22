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
import css from './HeightLabSkillHub.module.css'

type UserSkill = { name: string; description: string; updatedAt: number }
type Tab = 'market' | 'official' | 'mine' | 'create'

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

  const useSkillPrompt = (name: string): string =>
    `请加载技能「${name}」（技能目录下 ${name}/SKILL.md，可用 skill 工具读取），严格按其流程执行我的任务：\n`

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
          ['mine', `我的技能（${mine?.length ?? 0}）`],
          ['create', '创建技能'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={css.skillHubTabButton}
            data-active={tab === id}
            onClick={() => setTab(id)}
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
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{skill.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 6 }}>
                    {skill.category ?? '技能'}{skill.installs !== undefined && skill.installs > 0 ? ` · ${skill.installs.toLocaleString('en-US')} 次安装` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
        {tab === 'official' && (
          <div className={css.skillHubColumns}>
            {official.map(skill => (
              <div key={skill.id} className={css.skillHubCard}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{skill.title}</div>
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {skill.body.split('\n').find(l => l.trim() && !l.startsWith('#') && l.trim() !== '---') ?? ''}
                </div>
                <button
                  type="button"
                  className={css.skillHubAction}
                  onClick={() => useInChat(useSkillPrompt(skill.name))}
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
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{skill.name}</div>
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
