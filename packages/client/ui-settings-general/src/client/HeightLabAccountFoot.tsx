/**
 * HeightLab：侧栏底部账户行（0.4.1 布局，0.2.1 launcher 座位承载）。
 *
 * 账户入口（头像+用户名）点击弹出「账户 / 设置」原生菜单——设置齿轮不再
 * 单独占位（0.3.x 起的产品形态）；右侧为通知铃铛（未读绿点）与连接手机
 * 占位。连接指示与桌面更新指示由 shell 的 triggerRow 原生提供（紧随本行）。
 * 面板打开走 owner 注入的 openSettings；定位分区走 hl:open-settings-section
 * 窗口事件（SettingsRoot 监听）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconCloseOutlineRegular, IconSettingsOutlineMedium, IconUserOutlineMedium, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
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
    return () => document.removeEventListener('keydown', onKeyDown)
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
 * Render the account row into the launcher seat.
 * @param props - launcher slot props (contract/slots.ts).
 * @returns the account row element tree.
 */
export function HeightLabAccountFoot({ wide, openSettings }: HeightLabAccountFootProps) {
  // HeightLab：账户入口弹出「账户 / 设置」原生菜单（设置齿轮不再单独占位）。
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [account, setAccount] = useState<{ name?: string; username?: string; email?: string; avatar?: string } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [notices, setNotices] = useState<AnnouncementItem[]>([])
  const [noticesLoading, setNoticesLoading] = useState(false)

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
    return () => window.removeEventListener('hl:profile-updated', refreshAccountName)
  }, [])

  // 公告：进入页面即拉取，随后每 60 秒轮询一次；切回前台也刷新。
  const refreshNotices = useCallback(async (): Promise<AnnouncementItem[] | null> => {
    try {
      const res = await fetch('/hl/announcements')
      const data = await res.json().catch(() => ({})) as { ok?: boolean; items?: AnnouncementItem[] }
      if (data?.ok === true && Array.isArray(data.items)) {
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
      .finally(() => setNoticesLoading(false))
  }, [refreshNotices])

  const accountLabel = account?.username || account?.email || account?.name || '账户'
  const accountBadgeChar = ((): string => {
    if (account?.username) return account.username.charAt(0).toUpperCase()
    const email = account?.email || account?.name || ''
    const digits = email.match(/\d+/)
    return (digits ? digits[0] : email).charAt(0).toUpperCase() || 'H'
  })()

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
  const PlugIcon = (): ReactNode => (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6.4 2.2v2.6M9.6 2.2v2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.6 4.8h6.8v2.6a3.4 3.4 0 0 1-6.8 0V4.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 10.8v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )

  return (
    <>
      {/* HeightLab overlay (0.3.0): 账户入口，点击弹出「账户 / 设置」。 */}
      <div className={clsx(css.accountRow, !wide && css.accountRowRail)}>
        <Menu
          open={accountMenuOpen}
          onClose={() => setAccountMenuOpen(false)}
          items={[
            { id: 'account', label: '账户', icon: <IconUserOutlineMedium /> },
            { id: 'settings', label: '设置', icon: <IconSettingsOutlineMedium /> },
          ] as MenuEntry[]}
          onSelect={(id) => {
            setAccountMenuOpen(false)
            if (id === 'settings') {
              // 点「设置」永远从默认区（通用设置，第一项）打开。
              openSettings()
              return
            }
            window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
          }}
          side="top"
          portal
          anchor={(
            <button
              type="button"
              className={clsx(css.trigger, wide && css.accountWide, !wide && css.rail)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={accountLabel}
              onClick={() => setAccountMenuOpen(value => !value)}
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
          )}
        />
        {wide && (
          <div className={css.accountActions}>
            {/* HeightLab（2026-10-19）：更多能力（原 ds-bot 的 Connect plugins），
                在通知左侧，同尺寸同间距的纯图标按钮。 */}
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
        onClose={() => setNoticeOpen(false)}
      />
    </>
  )
}
