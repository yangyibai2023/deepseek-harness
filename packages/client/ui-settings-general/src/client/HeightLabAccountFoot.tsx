/**
 * HeightLab：侧栏底部账户行（0.4.1 布局，0.2.1 launcher 座位承载）。
 *
 * 账户入口（头像+用户名）点击弹出「账户 / 设置」原生菜单——设置齿轮不再
 * 单独占位（0.3.x 起的产品形态）；右侧为通知铃铛（未读绿点）与连接手机
 * 占位。连接指示与桌面更新指示由 shell 的 triggerRow 原生提供（紧随本行）。
 * 面板打开走 owner 注入的 openSettings；定位分区走 hl:open-settings-section
 * 窗口事件（SettingsRoot 监听）。
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconCloseOutlineRegular, IconSettingsOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SettingsRoot.module.css'

/** Launcher seat props: geometry + shell-owned settings actions. */
export type HeightLabAccountFootProps = PropsRuntime<'settings.launcher'>

interface AnnouncementItem {
  id: number
  title: string
  content: string
  published_at: number | null
  read: boolean
}

function formatAnnouncementTime(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

/**
 * ds-bot 的 surface（`bot` = 团队、`agent` = 个人）存在 localStorage。
 * 插件不在场时按个人模式处理（不显示团队专属入口）。
 */
function readTeamSurface(): boolean {
  try {
    return window.localStorage.getItem('ds-bot:surface') === 'bot'
  } catch {
    return false
  }
}

/** HeightLab：公告通知中心（铃铛绿点 + 原生时间线弹窗）。 */
function AnnouncementCenter({
  open,
  items,
  loading,
  onClose,
}: {
  open: boolean
  items: readonly AnnouncementItem[]
  loading: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={css.announceOverlay} role="presentation">
      <div className={css.announceMask} aria-hidden="true" onClick={onClose} />
      <div className={css.announcePanel} role="dialog" aria-modal="true" aria-labelledby="hl-announcement-title">
        <div className={css.announceHeader}>
          <span className={css.announceTitle} id="hl-announcement-title">公告</span>
          <button type="button" className={css.announceClose} onClick={onClose} aria-label="关闭公告">
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <div className={css.announceList}>
          {loading ? (
            <div className={css.announceEmpty}>加载中…</div>
          ) : items.length === 0 ? (
            <div className={css.announceEmpty}>暂无公告</div>
          ) : (
            items.map(item => (
              <div key={item.id} className={css.announceItem}>
                <div className={css.announceItemHead}>
                  <span className={css.announceItemTitle}>{item.title}</span>
                  {!item.read && <span className={css.announceDot} />}
                </div>
                {item.content && <div className={css.announceContent}>{item.content}</div>}
                <div className={css.announceTime}>{formatAnnouncementTime(item.published_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 用户可见积分的换算口径：¥299 = 5000 积分。
 * 与设置里账户分区（HeightLabAccount.tsx）用的是同一个常数——两处必须一致，
 * 否则同一个用户会在两处看到不同的分数。
 */
const DISPLAY_CREDITS_PER_CNY = 5000 / 299

/** HeightLab：账户余额（/hl/balance 的形状，只取展示需要的字段）。 */
interface BalanceInfo {
  balance: number
  unit?: string | undefined
  creditsPerCny?: number | undefined
}

/**
 * 账户下拉面板（2026-10-20 用户拍板）。
 *
 * 参照 WorkBuddy 的账户弹层，但**只保留必要项**（用户明确「不用多加其他，
 * 点进设置里就全有了」）：
 *   1. 头像 + 用户名
 *   2. 积分余额 + 「充值」
 *   3. 设置（进设置页）
 *   4. 退出登录
 *
 * 为什么不用 primitives 的 Menu：它只接受一维 label/icon 条目，放不下
 * 头像行与余额块。这里自绘一个 popover，但沿用站点既有的层级与视觉 token
 * （--dsw-alias-*），所以看起来仍是原生的一部分。
 */
function AccountMenu({
  open,
  account,
  balance,
  balanceLoading,
  onClose,
  onOpenSettings,
  onRecharge,
  onSignOut,
  signingOut,
}: {
  open: boolean
  account: { name?: string; username?: string; email?: string; avatar?: string } | null
  balance: BalanceInfo | null
  balanceLoading: boolean
  onClose: () => void
  onOpenSettings: () => void
  onRecharge: () => void
  onSignOut: () => void
  signingOut: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      // 点在面板内或触发按钮上都不关闭（按钮自己管开关）。
      if (target?.closest('[data-hl-account-menu]') !== null) return
      if (target?.closest('[data-hl-account-trigger]') !== null) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose])

  /* ── 定位：贴在侧栏内，不许超出（2026-10-20 用户实测「溢出了」）──────────
   * 起因：面板原先 `position: absolute` 挂在触发按钮的包层里（包层只有按钮
   * 那么宽），而 `width: 268` 又没算 padding/border → 实际 281px。侧栏内容
   * 右边缘只到 274，于是右侧溢出 21px，压到主区上。
   *
   * 现在改成 `position: fixed` + 打开时实测侧栏矩形：
   *   · 宽度 = min(268, 侧栏可用宽 - 12)，**只缩面板、不动侧栏**
   *   · 水平居中于侧栏（而不是按钮）
   *   · 底边贴触发按钮上沿 8px
   * 折叠成图标轨（宽 < 150）时不居中，改为左贴 8px 并给一个可读宽度。
   * resize 时重量一次；侧栏展开/折叠会触发 resize，因此能跟上。 */
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const measure = (): void => {
      const trigger = document.querySelector('[data-hl-account-trigger]')
      if (trigger === null) return
      const tb = trigger.getBoundingClientRect()
      /* 向上找「侧栏级」的祖先：宽度明显大于按钮、又不是整页。 */
      let el: HTMLElement | null = trigger.parentElement
      let anchor = tb
      while (el !== null && el !== document.body) {
        const box = el.getBoundingClientRect()
        if (box.width >= 150 && box.width <= 460) { anchor = box; break }
        el = el.parentElement
      }
      const rail = anchor.width < 150
      /* 两种形态的约束不同：
       *   · 展开态（侧栏 268–280）：面板必须**收在侧栏内**——用户反馈的
       *     「溢出」就是这一态。宽度取侧栏宽减 12，水平居中于侧栏。
       *   · 折叠态（图标轨 56）：轨道装不下面板，弹层浮在主区上是正常的，
       *     但必须夹在视口内，且左边不越过轨道。 */
      const width = rail
        ? Math.min(268, window.innerWidth - 24)
        : Math.min(268, Math.max(200, anchor.width - 12))
      const left = rail
        ? Math.round(Math.min(Math.max(8, anchor.left + 4), window.innerWidth - width - 8))
        : Math.round(anchor.left + Math.max(6, (anchor.width - width) / 2))
      setPos({ left, bottom: Math.round(window.innerHeight - tb.top + 8), width })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure) }
  }, [open])

  if (!open) return null

  const displayName = account?.username || account?.name || account?.email || '账户'
  const initial = displayName.charAt(0).toUpperCase() || 'H'
  /* ⚠️ /hl/balance 的 `balance` 是**内部 token 计数**（实测 113,621,497），
   * 不是给用户看的积分。设置页里的换算口径是：
   *   cny = balance / creditsPerCny；displayCredits = cny × DISPLAY_CREDITS_PER_CNY
   * 这里沿用同一口径，否则面板会显示一个七位数的天文数字（实测踩到）。
   * 2026-10-19 上线审计 P1-10：换算率缺失时**不再回退原始值**——那会把
   * 内部单位当人民币，放大 7 万倍且让低余额提醒永不触发。改为显示「—」。 */
  const credits = ((): number | null => {
    if (balance === null) return null
    const perCny = balance.creditsPerCny
    if (typeof perCny !== 'number' || !(perCny > 0)) return null
    const cny = balance.balance / perCny
    return Math.round(cny * DISPLAY_CREDITS_PER_CNY * 100) / 100
  })()

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    height: 36,
    padding: '0 10px',
    border: 0,
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
  }
  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
  }
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.style.background = 'transparent'
  }

  return (
    <div
      data-hl-account-menu=""
      role="dialog"
      aria-label="账户"
      style={{
        /* fixed + 打开时实测（见组件顶部 useLayoutEffect）：贴着侧栏内沿，
         * 不越界也不改侧栏宽度。box-sizing 必须 border-box，否则
         * width 不含 padding/border，实测会多出 13px 又溢出。 */
        position: 'fixed',
        boxSizing: 'border-box',
        ...(pos === null
          ? { visibility: 'hidden' as const, left: 8, bottom: 8, width: 260 }
          : { left: pos.left, bottom: pos.bottom, width: pos.width }),
        zIndex: 1200,
        padding: 6,
        borderRadius: 14,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-specific-input-major)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
      }}
    >
      {/* ① 用户名 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
        {account?.avatar
          ? (
            <img
              src={account.avatar}
              alt=""
              style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          )
          : (
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--dsw-alias-bg-layer-3)',
                color: 'var(--dsw-alias-label-secondary)',
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
          )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--dsw-alias-label-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </div>
          {account?.email && account.email !== displayName
            ? (
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--dsw-alias-label-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {account.email}
              </div>
            )
            : null}
        </div>
      </div>

      {/* ② 积分余额 + 充值 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          margin: '0 4px 6px',
          padding: '9px 10px',
          borderRadius: 10,
          background: 'var(--dsw-alias-bg-layer-2)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>积分余额</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: '22px',
              color: 'var(--dsw-alias-label-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {balanceLoading || credits === null ? '—' : credits.toLocaleString('zh-CN')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { onClose(); onRecharge() }}
          style={{
            flexShrink: 0,
            height: 28,
            padding: '0 12px',
            border: 0,
            borderRadius: 8,
            background: 'var(--dsw-alias-label-primary)',
            color: 'var(--dsw-specific-input-major)',
            fontFamily: 'inherit',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          充值
        </button>
      </div>

      <div style={{ height: 1, margin: '2px 6px 4px', background: 'var(--dsw-alias-border-l2)' }} />

      {/* ③ 设置 */}
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onClick={() => { onClose(); onOpenSettings() }}
      >
        <IconSettingsOutlineMedium size={16} />
        <span>设置</span>
      </button>

      {/* ④ 退出登录 */}
      <button
        type="button"
        style={{ ...itemStyle, color: 'var(--dsw-alias-label-secondary)' }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        disabled={signingOut}
        onClick={onSignOut}
      >
        <svg viewBox="0 0 16 16" width={16} height={16} fill="none" aria-hidden>
          <path d="M6.2 2.6H3.4a1.2 1.2 0 0 0-1.2 1.2v8.4a1.2 1.2 0 0 0 1.2 1.2h2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M10.2 5.2 13 8l-2.8 2.8M13 8H6.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{signingOut ? '正在退出…' : '退出登录'}</span>
      </button>
    </div>
  )
}

export function HeightLabAccountFoot({ wide, openSettings }: HeightLabAccountFootProps) {
  // HeightLab：账户入口弹出「账户 / 设置」原生菜单（设置齿轮不再单独占位）。
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [account, setAccount] = useState<{ name?: string; username?: string; email?: string; avatar?: string } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [notices, setNotices] = useState<AnnouncementItem[]>([])
  const [noticesLoading, setNoticesLoading] = useState(false)
  // 用户 2026-10-19 拍板：「更多能力」图标只在团队模式出现——个人模式下方的
  // 能力入口用不到（能力/插件都在设置与侧栏面板里）。这里跟随 ds-bot 的
  // surface（它自己切换或我们的「个人|团队」切换都会写这个键）。
  const [teamSurface, setTeamSurface] = useState(readTeamSurface)
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readTeamSurface()
      setTeamSurface(current => current === next ? current : next)
    }, 600)
    return () => { window.clearInterval(id) }
  }, [])

  const loadAccount = (): void => {
    fetch('/hl/me')
      .then(r => r.json().catch(() => ({})))
      .then((data: { name?: string; username?: string; email?: string; avatar?: string }) => {
        const next: { name?: string; username?: string; email?: string; avatar?: string } = {}
        if (typeof data.name === 'string' && data.name.trim() !== '') next.name = data.name.trim()
        if (typeof data.username === 'string' && data.username.trim() !== '') next.username = data.username.trim()
        if (typeof data.email === 'string' && data.email.trim() !== '') next.email = data.email.trim()
        if (typeof data.avatar === 'string' && data.avatar.trim() !== '') next.avatar = data.avatar.trim()
        setAccount(next)
      })
      .catch(() => { /* 保持默认「账户」 */ })
  }

  // 侧边栏账户入口显示当前登录用户（头像 + 用户名，无用户名显示邮箱）。
  useEffect(() => {
    loadAccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAccount 为组件内稳定读取函数
  }, [])

  // HeightLab：账户页保存资料后，左侧栏账户名立即同步（无需重启）。
  useEffect(() => {
    const refreshAccountName = (): void => {
      loadAccount()
    }
    window.addEventListener('hl:profile-updated', refreshAccountName)
    return () => { window.removeEventListener('hl:profile-updated', refreshAccountName) }
  }, [])

  // 公告：进入页面即拉取，随后每 60 秒轮询一次；切回前台也刷新。
  const refreshNotices = useCallback(async (): Promise<AnnouncementItem[] | null> => {
    try {
      const res = await fetch('/hl/announcements')
      const data = await res.json().catch(() => ({})) as { ok?: boolean; items?: AnnouncementItem[] }
      if (data.ok === true && Array.isArray(data.items)) {
        setNotices(data.items)
        return data.items
      }
    } catch {
      // 公告服务不可用时保持现状，不打扰用户。
    }
    return null
  }, [])

  useEffect(() => {
    void refreshNotices()
    const timer = window.setInterval(() => { void refreshNotices() }, 60_000)
    const onVisibility = (): void => {
      if (!document.hidden) void refreshNotices()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshNotices])

  const openNotices = useCallback((): void => {
    setNoticeOpen(true)
    setNoticesLoading(true)
    void refreshNotices()
      .then((items) => {
        if (!items) return
        const unread = items.filter(item => !item.read)
        if (unread.length > 0) {
          for (const item of unread) {
            void fetch(`/hl/announcements/${item.id}/read`, { method: 'POST' }).catch(() => {})
          }
          setNotices(items.map(item => ({ ...item, read: true })))
        }
      })
      .finally(() => { setNoticesLoading(false) })
  }, [refreshNotices])

  const accountLabel = account?.username || account?.email || account?.name || '账户'
  const accountBadgeChar = ((): string => {
    if (account?.username) return account.username.charAt(0).toUpperCase()
    const email = account?.email || account?.name || ''
    const digits = email.match(/\d+/)
    return (digits ? digits[0] : email).charAt(0).toUpperCase() || 'H'
  })()

  /* ── 账户面板数据（2026-10-20）：余额 + 退出登录 ──────────────────────────
   * 余额只在面板打开时拉（避免侧栏常驻轮询），退出后刷新账户与余额。
   * 401（未登录/过期）不报错，面板显示「—」，避免登录前一片红。 */
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const refreshBalance = useCallback((): void => {
    setBalanceLoading(true)
    fetch('/hl/balance', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({})) as { ok?: boolean; balance?: number; unit?: string; creditsPerCny?: number }
        if (r.ok && data.ok === true && typeof data.balance === 'number') {
          setBalance({ balance: data.balance, unit: data.unit, creditsPerCny: data.creditsPerCny })
        } else {
          setBalance(null)
        }
      })
      .catch(() => { setBalance(null) })
      .finally(() => { setBalanceLoading(false) })
  }, [])

  useEffect(() => {
    if (!accountMenuOpen) return
    refreshBalance()
  }, [accountMenuOpen, refreshBalance])

  const signOut = useCallback((): void => {
    if (signingOut) return
    setSigningOut(true)
    fetch('/hl/signout', { method: 'POST' })
      .catch(() => null)
      .finally(() => {
        /* 与服务端 /hl/signout 的真退出语义一致：清本地标记后整页重载，
         * 让壳回到登录页（只清 React state 会让 WS/会话仍带旧身份）。 */
        try {
          window.localStorage.removeItem('heightlab-account-token')
        } catch { /* 忽略 */ }
        window.location.reload()
      })
  }, [signingOut])

  // HeightLab：通知（铃铛）/ 连接手机（手机设备）占位图标，16px 与齿轮一致。
  const BellIcon = (): ReactNode => (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.8A5.4 5.4 0 0 1 13.4 7.2v2.6l1.4 2.5H1.2l1.4-2.5V7.2A5.4 5.4 0 0 1 8 1.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.8 13a2.2 2.2 0 0 0 4.4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
  const PhoneIcon = (): ReactNode => (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.4" y="1.4" width="9.2" height="13.2" rx="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 11.9h2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
  // HeightLab（2026-10-19 用户拍板）：ds-bot 底部「Connect plugins」收进这排
  // 图标里，改名「更多能力」，只留图标、无底色，位置在通知左侧，间距与
  // 通知/连接手机一致（由 `.accountActions` 的 gap 统一控制）。
  // 点击打开插件面板：layout 服务不在本组件注入面里，用窗口事件交给
  // SidebarRoot 的监听转给 ctx.layout.selectPanel('plugins')。
  // 图标几何按「与铃铛/手机同视觉尺寸」重画：原插头图形只占 viewBox 的
  // 6.8×11.6（宽 42%），看起来明显比铃铛小；现在铺到 9.2 宽，与手机图标一致。
  const PlugIcon = (): ReactNode => (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.6 1.7v3.3M10.4 1.7v3.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3.4 5h9.2v2.9a4.6 4.6 0 0 1-9.2 0V5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 11.8v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )

  return (
    <>
      {/* HeightLab overlay (0.3.0): 账户入口，点击弹出「账户 / 设置」。 */}
      <div className={clsx(css.accountRow, !wide && css.accountRowRail)}>
        {/* 账户面板（自绘，见 AccountMenu）：用户名 / 积分+充值 / 设置 / 退出登录。
            不用 primitives 的 Menu——它只支持一维 label 条目，放不下头像与余额块。
            包一层 relative 容器给面板定位（面板自己 absolute bottom:100%）。 */}
        <div style={{ position: 'relative' }}>
          <AccountMenu
            open={accountMenuOpen}
            account={account}
            balance={balance}
            balanceLoading={balanceLoading}
            onClose={() => { setAccountMenuOpen(false) }}
            onOpenSettings={() => { openSettings() }}
            onRecharge={() => {
              // 充值入口复用设置里的账户分区（它已有完整充值流程与支付回流）。
              window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
            }}
            onSignOut={signOut}
            signingOut={signingOut}
          />
          <button
            type="button"
            data-hl-account-trigger=""
            className={clsx(css.trigger, wide && css.accountWide, !wide && css.rail)}
            aria-haspopup="dialog"
            aria-expanded={accountMenuOpen}
            aria-label={accountLabel}
            onClick={() => { setAccountMenuOpen(value => !value) }}
          >
            {account?.avatar
              ? (
                <span
                  style={{
                    // HeightLab：固定容器与设置按钮同尺寸；2026-08-17
                    // 展开 22→24（+10%），折叠 25（用户确认折叠合适）。
                    width: wide ? 24 : 25,
                    height: wide ? 24 : 25,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={account.avatar}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </span>
              )
              : (
                <span
                  style={{
                    width: wide ? 24 : 25,
                    height: wide ? 24 : 25,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'var(--dsw-alias-bg-layer-3)',
                    color: 'var(--dsw-alias-label-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {accountBadgeChar}
                </span>
              )}
            {wide && <span className={css.triggerLabel}>{accountLabel}</span>}
          </button>
        </div>
        {wide && (
          <div className={css.accountActions}>
            {/* HeightLab（2026-10-19）：更多能力（原 ds-bot 的 Connect plugins），
                在通知左侧，同尺寸同间距的纯图标按钮。
                用户当日晚间补充：**只在团队模式显示**——个人模式不需要这个入口。 */}
            {teamSurface && (
              <Tooltip label="更多能力" side="top" delayMs={300}>
                <button
                  type="button"
                  className={css.sideAction}
                  aria-label="更多能力"
                  onClick={() => { window.dispatchEvent(new CustomEvent('hl:open-panel', { detail: { panel: 'plugins' } })) }}
                >
                  <PlugIcon />
                </button>
              </Tooltip>
            )}
            <button
              type="button"
              className={css.sideAction}
              aria-label="通知"
              onClick={openNotices}
            >
              <BellIcon />
              {notices.some(item => !item.read) && <span className={css.bellDot} />}
            </button>
            <button
              type="button"
              className={css.sideAction}
              aria-label="连接手机"
              onClick={() => { window.alert('连接移动端功能待上线') }}
            >
              <PhoneIcon />
            </button>
          </div>
        )}
      </div>
      <AnnouncementCenter
        open={noticeOpen}
        items={notices}
        loading={noticesLoading}
        onClose={() => { setNoticeOpen(false) }}
      />
    </>
  )
}
