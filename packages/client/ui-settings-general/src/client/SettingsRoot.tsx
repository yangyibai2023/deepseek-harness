/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel (figma 501:29947, 1080x700) with the section nav rail. The shell is
 * a pure composition face — every piece of text (trigger label, panel title,
 * close label, sections) arrives from registrants through slots; accessible
 * names resolve to that content (trigger: its own text; dialog:
 * aria-labelledby the title node; close: visually-hidden slot text). Modal
 * open state and the active section id are component-local viewing state;
 * the onboarding coordinator mounts exactly one ordered registrant while the
 * sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
 * to the step, so a mounted-but-deciding step paints nothing here.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconAgentPresetOutline16, IconCloseOutline16, IconDataOutline16,
  IconPersonalizationOutline16, IconSettingsOutline16, IconUserOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ConnectionIndicator,
  type ConnectionIndicatorState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import { IconInfoOutline16, IconPersonVoiceOutline16 } from './settings-nav-icons.tsx'
import {
  checkForUpdate, getUpdateState, installUpdate, subscribeUpdateState,
} from './heightlab-update-store.ts'
import css from './SettingsRoot.module.css'

const RECOVERY_CONFIRMATION_MS = 2_000

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'models') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  // HeightLab：功能对应图标（账户/形象与声音/关于）。
  if (id === 'heightlab-account') return <IconUserOutline16 className={css.navIcon} size={16} />
  if (id === 'heightlab-voice-avatar') return <IconPersonVoiceOutline16 className={css.navIcon} size={16} />
  if (id === 'heightlab-about') return <IconInfoOutline16 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * The modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <nav className={css.nav}>
          <div className={css.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={css.navList}>
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className={clsx(css.navCell, row.id === active && css.active)}
                aria-current={row.id === active ? 'true' : undefined}
                onClick={() => { onSelect(row.id) }}
              >
                {navIcon(row.id)}
                <span className={css.navLabel}>{row.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className={css.content}>
          <div className={css.header}>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
            <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
              <IconCloseOutline16 size={14} />
              <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
            </button>
          </div>
          <div className={css.options}>
            {active !== undefined && renderSlot('settings.section', { close: onClose }, { only: active })}
          </div>
        </div>
      </div>
    </div>
  )
}

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
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.announceList}>
          {loading ? (
            <div className={css.announceEmpty}>加载中…</div>
          ) : items.length === 0 ? (
            <div className={css.announceEmpty}>暂无公告</div>
          ) : (
            items.map((item) => (
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
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props: SettingsRootComponentProps) {
  const { wide, reconnect, useConnectionState, useSections, useOnboardingSteps, useSessions, renderSlot, t } = props
  // ── 上游 0.1.5 增量：连接恢复指示 + 焦点还原 ──
  const [showRecovery, setShowRecovery] = useState(false)
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null)
  const connectionState = useConnectionState(state => state)
  const previousConnectionState = useRef(connectionState)
  useLayoutEffect(() => {
    const previous = previousConnectionState.current
    previousConnectionState.current = connectionState
    if (connectionState !== 'connected') {
      setShowRecovery(false)
      return
    }
    if (previous !== 'disconnected' && previous !== 'connecting') return
    setShowRecovery(true)
    const timeout = window.setTimeout(() => { setShowRecovery(false) }, RECOVERY_CONFIRMATION_MS)
    return () => { window.clearTimeout(timeout) }
  }, [connectionState])
  let connectionIndicator: ConnectionIndicatorState | undefined
  if (connectionState === 'disconnected') {
    connectionIndicator = 'disconnected'
  } else if (connectionState === 'connecting') {
    connectionIndicator = 'connecting'
  } else if (showRecovery) {
    connectionIndicator = 'recovered'
  }

  // HeightLab：账户入口弹出「账户 / 设置」原生菜单（设置齿轮不再单独占位）。
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [open, setOpen] = useState(false)
  // ── 上游 0.1.5 增量：关闭后焦点还原到触发按钮 ──
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) triggerButtonRef.current?.focus()
    wasOpen.current = open
  }, [open])
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const [account, setAccount] = useState<{ name?: string; username?: string; email?: string; avatar?: string } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [notices, setNotices] = useState<AnnouncementItem[]>([])
  const [noticesLoading, setNoticesLoading] = useState(false)
  // HeightLab：更新胶囊与「关于」页共用同一份状态（0.3.8），
  // 任一入口触发下载后两侧进度/文案同步，且不会重复下载。
  const updateState = useSyncExternalStore(subscribeUpdateState, getUpdateState)
  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
  }, [])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])

  const loadAccount = (): void => {
    fetch('/hl/me')
      .then((r) => r.json().catch(() => ({})))
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

  // HeightLab：更新胶囊——默认隐藏；检测到新版本才显示。挂载即检查，
  // 之后每 10 分钟与切回前台时复查；网页预览（无 Tauri 桥）直接跳过。
  useEffect(() => {
    void checkForUpdate()
    const timer = window.setInterval(() => { void checkForUpdate() }, 600_000)
    const onVisibility = (): void => { if (!document.hidden) void checkForUpdate() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const openNotices = useCallback((): void => {
    setNoticeOpen(true)
    setNoticesLoading(true)
    void refreshNotices()
      .then((items) => {
        if (!items) return
        const unread = items.filter((item) => !item.read)
        if (unread.length > 0) {
          for (const item of unread) {
            void fetch(`/hl/announcements/${item.id}/read`, { method: 'POST' }).catch(() => {})
          }
          setNotices(items.map((item) => ({ ...item, read: true })))
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


  // The ledger tick keeps the nav rows fresh: registrants re-register with
  // freshly localized text on locale change, and the trigger/header/close
  // seats re-render through their own outlets' subscriptions.
  const allRows = useSections(s => s)
  // HeightLab：隐藏 dsh-better-sidebar 插件注册的「侧边卡片（Side card）」分区。
  const rows = useMemo(
    () => allRows.filter(row => row.id !== 'better-sidebar'),
    [allRows],
  )

  // HeightLab：支持外部（如智能体回复里的 hl://settings/<section> 链接）
  // 直接打开设置面板并定位到对应分区。
  useEffect(() => {
    const onOpenSection = (event: Event): void => {
      const detail = (event as CustomEvent<{ section?: unknown }>).detail
      const section = typeof detail?.section === 'string' ? detail.section : ''
      if (section !== '' && allRows.some(row => row.id === section)) {
        setActiveId(section)
        setOpen(true)
      }
    }
    window.addEventListener('hl:open-settings-section', onOpenSection)
    return () => window.removeEventListener('hl:open-settings-section', onOpenSection)
  }, [allRows])
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  return (
    <>
      {/* HeightLab overlay (0.3.0): 账户入口，点击弹出「账户 / 设置」。 */}
      <div className={clsx(css.accountRow, !wide && css.accountRowRail)}>
        <Menu
          open={accountMenuOpen}
          onClose={() => setAccountMenuOpen(false)}
          items={[
            { id: 'account', label: '账户', icon: <IconUserOutline16 /> },
            { id: 'settings', label: '设置', icon: <IconSettingsOutline16 /> },
          ] as MenuEntry[]}
          onSelect={(id) => {
            setAccountMenuOpen(false)
            if (id === 'settings') {
              // 点「设置」永远从默认区（通用设置，第一项）打开。
              setOpen(true)
              setActiveId(undefined)
              return
            }
            openSection('heightlab-account')
          }}
          side="top"
          portal
          anchor={(
            <button
              ref={triggerButtonRef}
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
            <ConnectionIndicator
              state={wide ? connectionIndicator : undefined}
              disconnectedLabel={t('connection.error')}
              reconnectLabel={t('connection.retry')}
              connectingLabel={t('connection.connecting')}
              recoveredLabel={t('connection.connected')}
              reconnectActionLabel={t('connection.reconnect')}
              restartActionLabel={t('connection.restart')}
              onReconnect={reconnect}
            />
            {updateState.info !== null && (
              <button
                type="button"
                className={css.updatePill}
                aria-label="更新"
                title={updateState.busy
                  ? (updateState.progress >= 100 ? '正在安装…' : `更新中 ${updateState.progress}%`)
                  : `更新到 v${updateState.info.version ?? ''}\n${updateState.info.body ?? ''}`}
                onClick={() => { void installUpdate() }}
                disabled={updateState.busy}
              >
                {updateState.busy
                  ? (updateState.progress >= 100 ? '安装中…' : `${updateState.progress}%`)
                  : '更新'}
              </button>
            )}
            <button
              type="button"
              className={css.sideAction}
              aria-label="通知"
              onClick={openNotices}
            >
              <BellIcon />
              {notices.some((item) => !item.read) && <span className={css.bellDot} />}
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
      {open && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
        />
      )}
      <AnnouncementCenter
        open={noticeOpen}
        items={notices}
        loading={noticesLoading}
        onClose={() => setNoticeOpen(false)}
      />
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}
