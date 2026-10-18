/**
 * HeightLab 2026-08-29（企业版 M3）：左侧边栏「个人 | 团队」模式切换。
 *
 * 交互（用户 2026-08-29 拍板，2026-10-18 改版）：
 * - 所有登录用户可见切换项（云端组织能力降级时隐藏）。
 * - 已属于组织的用户点击「团队」直接进入企业模式。
 * - 不属于组织的用户点击「团队」弹出邀请码输入，加入成功后切企业模式；
 *   失败留在个人版，可随时切回。
 * - **2026-10-18 用户拍板**：本切换同时驱动 ds-bot 的 surface——「团队」= ds-bot
 *   模式，「个人」= 经典 Agent 模式（我们原本的页面）。两者绑成同一个入口，
 *   状态以 ds-bot 的实际 surface 为准（它自己的切换按钮改了也会同步回来）。
 *
 * 数据边界：组织归属权威在云端 Logto Organizations，经
 * GET /hl/org-context 与 POST /hl/org-join 访问；本组件只消费结果。
 * 选择持久化 localStorage（hl.mode / hl.mode.orgId）并广播
 * `hl:mode-changed`，品牌槽位插件与模板/专家数据层据此合并企业定制。
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import css from './SidebarRoot.module.css'

export interface HlOrgEntry {
  id: string
  name: string
}

export type HlMode = 'personal' | 'enterprise'

const LS_MODE = 'hl.mode'
const LS_ORG = 'hl.mode.orgId'

export function readHlMode(): { mode: HlMode; orgId: string } {
  try {
    const mode = window.localStorage.getItem(LS_MODE)
    const orgId = window.localStorage.getItem(LS_ORG) ?? ''
    return { mode: mode === 'enterprise' ? 'enterprise' : 'personal', orgId }
  } catch {
    return { mode: 'personal', orgId: '' }
  }
}

/* ── ds-bot surface 桥接（2026-10-18）───────────────────────────────────────
 * ds-bot 把「经典 Agent 模式 / 它的模式」存在 localStorage `ds-bot:surface`
 * （值 `agent` / `bot`），只在插件初始化时读一次；它没有对外暴露切换 API，
 * 但两种模式各有一个官方按钮：
 *   · 经典模式里：侧栏底部 `button.bt-return[aria-label="DS Bot"]` → 进它的模式
 *   · 它的模式里：账号按钮 `button.bt-account` → 菜单「切换经典 Agent 模式」
 * 因此优先点官方按钮（瞬时、无刷新）；找不到按钮（插件未装 / 文案变了）时
 * 回退到「写 storage + reload」——这条只依赖存储键，升级后依然成立。
 */
const DSBOT_SURFACE_KEY = 'ds-bot:surface'

export type DsBotSurface = 'agent' | 'bot'

/** ds-bot 是否在场（它的 hub 在两种模式下都注册，可作为插件已加载的信号）。 */
function dsBotPresent(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { dshBot?: unknown }).dshBot !== undefined
}

/** 读 ds-bot 当前 surface；插件不在场返回 undefined。 */
export function readDsBotSurface(): DsBotSurface | undefined {
  if (!dsBotPresent()) return undefined
  try {
    const raw = window.localStorage.getItem(DSBOT_SURFACE_KEY)
    // 未写过时 ds-bot 自己的 readMode() 默认 'bot'。
    return raw === 'agent' ? 'agent' : 'bot'
  } catch {
    return 'bot'
  }
}

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  window.requestAnimationFrame(() => { resolve() })
})

/** 等一小段时间（菜单展开有过渡动画，单帧不够）。 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

/**
 * 切换 ds-bot surface。
 * @param target - `bot` 进它的模式，`agent` 回经典 Agent 模式。
 * @returns 是否发起了一次切换（插件不在场时为 false）。
 */
export async function switchDsBotSurface(target: DsBotSurface): Promise<boolean> {
  if (!dsBotPresent()) return false
  if (readDsBotSurface() === target) return false

  if (target === 'bot') {
    const button = document.querySelector<HTMLButtonElement>('button.bt-return')
    if (button !== null) {
      button.click()
      return true
    }
  } else {
    const account = document.querySelector<HTMLButtonElement>('button.bt-account')
    if (account !== null) {
      account.click()
      // 菜单在同一次点击后同步渲染；下一帧再找不到说明结构变了。
      await nextFrame()
      const item = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
        .find(el => /切换经典|Switch to classic/i.test(el.textContent))
      if (item !== undefined) {
        item.click()
        return true
      }
      account.click() // 关掉没点中的菜单，保持界面干净
    }
  }

  // 回退：写存储后重载，ds-bot 初始化时会读到新值。
  try {
    window.localStorage.setItem(DSBOT_SURFACE_KEY, target)
  } catch { /* 隐私模式等：只能依赖上面的按钮路径 */ }
  window.location.reload()
  return true
}

/**
 * 打开 DS Bot 设置（用户 2026-10-18：「在我们原来的用户名上方，加一个单独的
 * DSH BOT 设置」）。它没有对外暴露 openSettings，但鲸鱼账号按钮
 * （`button.bt-account`）会弹菜单，「Bot 设置」直达设置页——那里已经包含
 * 外观/主题/强调色/头像动效、Bots、群聊、Connectors、能力、定时任务、用量、
 * Secrets、反馈、关于等全部个性化项。我们只借用同一个入口，保证行为与它原生
 * 一致，且它以后新增设置分区也自动可见。
 * @returns 是否成功打开设置面板。
 */
export async function openDsBotSettings(): Promise<boolean> {
  if (!dsBotPresent()) return false
  // 经典模式下先切到它的模式——设置面板只存在于那个 surface。
  if (readDsBotSurface() !== 'bot') {
    const switched = await switchDsBotSurface('bot')
    if (!switched) return false
    // surface 切换后菜单按钮要等一帧才挂上。
    for (let i = 0; i < 40; i += 1) {
      await nextFrame()
      if (document.querySelector('button.bt-account') !== null) break
    }
  }
  const account = document.querySelector<HTMLButtonElement>('button.bt-account')
  if (account === null) return false
  account.click()
  // 菜单是 `button.bt-account` 后插入的 `.bt-account-menu`，里面是普通 button。
  // 文案随语言变化（英文 "Bot settings" / 中文「Bot 设置」），两种都收。
  for (let i = 0; i < 20; i += 1) {
    await wait(80)
    const menu = document.querySelector('.bt-account-menu')
    const scope = menu ?? document
    const item = [...scope.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
      .find(el => /bot\s*(设置|settings)/i.test(el.textContent))
    if (item !== undefined) {
      item.click()
      return true
    }
  }
  account.click() // 没找到就收起菜单，不留浮层
  return false
}

export function HlModeSwitcher() {
  const [orgs, setOrgs] = useState<HlOrgEntry[]>([])
  const [sel, setSel] = useState(readHlMode)
  // ds-bot 在场时以它的实际 surface 为准：它自己的切换按钮改了也要同步回来，
  // 否则两个入口会各说各话（轮询成本只是一次 localStorage 读）。
  const [surface, setSurface] = useState<DsBotSurface | undefined>(readDsBotSurface)
  const [loaded, setLoaded] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readDsBotSurface()
      setSurface(current => current === next ? current : next)
    }, 600)
    // 用户在侧栏点了团队工作区里的会话 → 自动切到团队页（保留团队工作区可见，
    // 让用户能手动回看团队对话；个人页的默认工作目录仍由隔离 effect 守住）。
    const onRequestTeam = (): void => { void switchDsBotSurface('bot') }
    window.addEventListener('hl:request-team-surface', onRequestTeam)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('hl:request-team-surface', onRequestTeam)
    }
  }, [])

  const refreshOrgs = async (): Promise<HlOrgEntry[]> => {
    try {
      const res = await fetch('/hl/org-context', { signal: AbortSignal.timeout(8000) })
      const data = await (res.ok ? res.json() : Promise.resolve(null)) as {
        organizations?: HlOrgEntry[]
        degraded?: boolean
      } | null
      const next = Array.isArray(data?.organizations)
        ? data.organizations.filter(o => o.id !== '')
        : []
      setOrgs(next)
      setDegraded(data?.degraded === true)
      setLoaded(true)
      return next
    } catch {
      setLoaded(true)
      return []
    }
  }

  useEffect(() => {
    let alive = true
    void refreshOrgs().then(() => { if (!alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  if (!loaded || degraded) return null

  const effectiveOrgId = orgs.some(o => o.id === sel.orgId) ? sel.orgId : (orgs[0]?.id ?? '')
  const enterpriseName = orgs.find(o => o.id === effectiveOrgId)?.name ?? ''

  const enter = (nextMode: HlMode, orgId: string) => {
    setSel({ mode: nextMode, orgId })
    try {
      window.localStorage.setItem(LS_MODE, nextMode)
      window.localStorage.setItem(LS_ORG, orgId)
    } catch { /* 隐私模式等：仅内存态 */ }
    window.dispatchEvent(new CustomEvent('hl:mode-changed', { detail: { mode: nextMode, orgId } }))
  }

  const choose = async (mode: HlMode) => {
    // 先驱动 ds-bot：点它的官方按钮，切完 surface 轮询会把高亮同步过去。
    void switchDsBotSurface(mode === 'enterprise' ? 'bot' : 'agent')
    if (mode === 'personal') {
      // 邀码面板打开时：直接关闭并切回个人（不再要求先点「取消」）。
      setJoinOpen(false)
      setJoinError('')
      enter('personal', '')
      return
    }
    const next = await refreshOrgs()
    if (next.length === 0) {
      setJoinOpen(true)
      setJoinError('')
      return
    }
    const target = next.some(o => o.id === sel.orgId) ? sel.orgId : (next[0]?.id ?? '')
    enter('enterprise', target)
  }

  const join = async () => {
    if (code.trim() === '') {
      setJoinError('请输入企业邀请码')
      return
    }
    setJoining(true)
    setJoinError('')
    try {
      const res = await fetch('/hl/org-join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json().catch(() => null) as {
        ok?: boolean
        org?: HlOrgEntry
        message?: string
      } | null
      if (!res.ok || data === null || data.ok !== true || !data.org?.id) {
        // 加入服务可能已成功但响应未送达：以组织归属权威重新拉取为准。
        const next = await refreshOrgs()
        if (next.length > 0) {
          const org = next[0]
          if (!org) {
            setJoinError('企业加入后组织归属暂不可读，请稍后重试。')
            return
          }
          enter('enterprise', org.id)
          setJoinOpen(false)
          setCode('')
          return
        }
        setJoinError(data?.message ?? '企业加入失败，请检查邀请码后重试。')
        return
      }
      const org = data.org
      setOrgs((prev) => {
        const next = prev.filter(o => o.id !== org.id)
        return [org, ...next]
      })
      setSel({ mode: 'enterprise', orgId: org.id })
      enter('enterprise', org.id)
      setJoinOpen(false)
      setCode('')
    } catch {
      setJoinError('企业加入服务暂时不可用，请稍后重试。')
    } finally {
      setJoining(false)
    }
  }

  // 高亮以 ds-bot 的实际 surface 为准（插件不在场时退回组织模式）。
  const personalActive = surface === undefined ? sel.mode === 'personal' : surface === 'agent'
  const teamActive = surface === undefined ? sel.mode === 'enterprise' : surface === 'bot'

  return (
    <div>
      <div className={css.hlModeRow} role="group" aria-label="模式切换">
        <button
          type="button"
          className={clsx(css.hlModeSeg, personalActive && css.hlModeSegActive)}
          aria-pressed={personalActive}
          title="个人模式"
          onClick={() => { void choose('personal') }}
        >
          个人
        </button>
        <button
          type="button"
          className={clsx(css.hlModeSeg, teamActive && css.hlModeSegActive)}
          aria-pressed={teamActive}
          title={enterpriseName === '' ? 'OPC 团队模式' : enterpriseName}
          onClick={() => { void choose('enterprise') }}
        >
          OPC 团队
        </button>
      </div>
      {joinOpen && (
        <form
          className={css.hlJoinPanel}
          onSubmit={(e) => { e.preventDefault(); void join() }}
        >
          <label className={css.hlJoinLabel} htmlFor="hl-org-join-code">企业邀请码</label>
          <input
            id="hl-org-join-code"
            className={css.hlJoinInput}
            value={code}
            onChange={(e) => { setCode(e.target.value); setJoinError('') }}
            placeholder="输入邀请码"
            autoFocus
          />
          {joinError !== '' && <div className={css.hlJoinError}>{joinError}</div>}
          <div className={css.hlJoinActions}>
            {orgs.length > 0 && (
              <button
                type="button"
                className={css.hlJoinCancel}
                onClick={() => { setJoinOpen(false); setJoinError('') }}
              >
                取消
              </button>
            )}
            <button type="submit" className={css.hlJoinSubmit} disabled={joining}>
              {joining ? '加入中…' : '加入'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
