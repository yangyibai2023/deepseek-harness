/** Sidebar account launcher and locally authoritative sign-out action. */
import { useEffect, useRef, useState } from 'react'
import {
  Toast, Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import { LogoutIcon } from './LogoutIcon.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import { AccountNoticeCard } from './AccountNotice.tsx'
import css from './AccountMenu.module.css'
import { PlanUpgrade } from './PlanUpgrade.tsx'
import { TierBadge } from './TierBadge.tsx'

/** 积分总览（/hl/credits 桥代理，2026-11-01 套餐与积分统一）。 */
interface CreditsOverview {
  tierLabel?: string
  canBuyBooster?: boolean
  totalUnits?: number
  plan?: { name?: string } | null
}

/* 2026-11-03（0.5.4 FIX-2）：原 BOOSTER_LOCK_HINT 随「体验版隐藏加油包」一起移除
 * （体验版现在完全看不见按钮，不再需要「成为会员后才能购买」的置灰提示）。 */

/** 数字千分位（余额展示口径与套餐与积分页一致）。 */
function formatUnits(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN')
}

/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<'settings.launcher'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({
  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen,
  useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount, bonusNoticeShown, bonusNoticeDismissed,
  contactUs, showLogin, start, cancel, t,
}: AccountMenuProps) {
  const anchor = useRef<HTMLDivElement>(null)
  // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
  // re-renders, section switches and tab switches inside one open must not read again.
  const settingsWasOpen = useRef(false)
  useEffect(() => {
    if (settingsOpen && !settingsWasOpen.current) void refreshAccount()
    settingsWasOpen.current = settingsOpen
  }, [refreshAccount, settingsOpen])
  const account = useAccount(state => state)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  const signedIn = account.view?.status === 'credential-stored'
  const [signInNotice, setSignInNotice] = useState(0)
  useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1) }), [subscribeModelSignInRequired])
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true) }), [subscribeSessionExpired])
  const profile = account.details?.profile
  const label = profile === undefined ? null : profile.status === 'ready'
    ? profile.value.name ?? profile.value.contact ?? t('signedIn') : t('signedIn')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [signOutImpact, setSignOutImpact] = useState<boolean | 'unknown'>()
  const requestSignOut = async () => {
    setBusy(true)
    try { setSignOutImpact(await hasRunningAccountTasks()); setOpen(false) }
    catch (_error) { setSignOutImpact('unknown'); setOpen(false) }
    finally { setBusy(false) }
  }
  // The plugin's start publishes `loginFailed` before it rejects, so the dialog owns the report.
  const beginSignIn = (): void => { setOpen(false); void start().catch(() => undefined) }
  const [planOpen, setPlanOpen] = useState(false)
  // 积分总览（弹框展示 + 加油包灰置判定）。
  const [credits, setCredits] = useState<CreditsOverview | null>(null)
  useEffect(() => {
    if (!open || !signedIn) return
    let cancelled = false
    void fetch('/hl/credits').then(res => res.ok ? res.json() : null).then((data) => {
      if (!cancelled && data !== null) setCredits(data as CreditsOverview)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [open, signedIn])
  const tierLabel = credits?.tierLabel ?? '体验版'
  const canBuyBooster = credits?.canBuyBooster === true

  /** 富卡片弹框（signed-in）：对标 WorkBuddy——头像+名 / 套餐+积分 / 双按钮 / 菜单组。 */
  const richPanel = signedIn
    ? (
      <div
        role="menu"
        aria-label={t('menu')}
        style={{
          width: 272, borderRadius: 16, overflow: 'hidden',
          background: 'var(--dsw-alias-surface-primary, #fff)',
          color: 'var(--dsw-alias-label-primary, #111)',
          border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <AccountAvatar url={profile?.status === 'ready' ? profile.value.avatarUrl : null} />
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ margin: '0 12px', padding: '12px 14px', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.03))', display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))' }}>套餐</div>
            <div style={{ marginTop: 4 }}><TierBadge tierLabel={tierLabel} /></div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))' }}>积分余额</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>{formatUnits(credits?.totalUnits)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 4px' }}>
          <button
            type="button"
            onClick={() => { setOpen(false); setPlanOpen(true) }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--dsw-alias-button-primary-fill, #111)',
              color: 'var(--dsw-alias-label-primary-foreground, #fff)', fontSize: 13, fontWeight: 600,
            }}
          >升级套餐</button>
          // 2026-11-03（0.5.4 FIX-2，用户裁决）：只有付费会员（轻量/标准/旗舰）
          // 才看得见加油包，体验版完全隐藏——不是置灰、不是提示，而是不渲染。
          // 判据来自服务端 /hl/credits 的 canBuyBooster（tier !== 'free'）。
          {canBuyBooster && (
            <button
              type="button"
              onClick={() => { setOpen(false); openSettings() }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 500,
                border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary, #111)',
                cursor: 'pointer',
              }}
            >购买加油包</button>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))', margin: '8px 0 2px' }} />
        {([
          { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={15} /> },
          { id: 'contact', label: t('contactUs'), icon: <IconPaperPlaneOutlineMedium size={15} /> },
          { id: 'signout', label: t('signOut'), icon: <LogoutIcon />, disabled: busy },
        ] as ReadonlyArray<{ id: string; label: string; icon: React.ReactNode; disabled?: boolean }>).map(item => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              if (item.id === 'settings') { trigger.current?.focus(); openSettings() }
              else if (item.id === 'contact') contactUs()
              else void requestSignOut()
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px',
              border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
              color: 'var(--dsw-alias-label-primary, #111)', fontSize: 13,
            }}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.id === 'settings' && settingsShortcut !== undefined
              ? <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{settingsShortcut.keys.join('')}</span>
              : null}
          </button>
        ))}
      </div>
    )
    : null

  return <div ref={anchor} className={css.root}>
    {planOpen && <PlanUpgrade close={() => { setPlanOpen(false) }} />}
    {signInNotice > 0 && <Toast key={signInNotice} text={t('modelSignInRequired')} onDone={() => { setSignInNotice(0) }} />}
    {expiryNotice && <Toast text={t('sessionExpired')} onDone={() => { setExpiryNotice(false) }} />}
    {signedIn && account.notice && <AccountNoticeCard key={account.notice.orderId} notice={account.notice}
      anchor={anchor} title={t('bonusNoticeTitle')} closeLabel={t('close')}
      onShown={bonusNoticeShown} onDismiss={bonusNoticeDismissed} />}
    {/* 未登录沿用原生 Menu；已登录走富卡片弹框（对标 WorkBuddy 信息结构）。 */}
    {!signedIn && <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={css.signedOutMenu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={!signedIn} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <IconEllipsisOutlineMedium size={14} />
        {<span className={css.label}>{t('more')}</span>}
      </button>}
      items={[
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'contact', label: t('contactUs'), icon: <IconPaperPlaneOutlineMedium size={16} /> },
        { id: 'signin', label: t('signIn'), icon: <IconUserOutlineMedium size={16} /> },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
        else if (id === 'contact') { setOpen(false); contactUs() }
        else beginSignIn()
      }} />}
    {signedIn && (
      <div className={css.anchor} style={{ position: 'relative' }}>
        <button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={false} aria-haspopup="menu" aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: wide ? '6px 8px' : '6px' }}>
          <span className={css.avatar}><AccountAvatar url={profile?.status === 'ready' ? profile.value.avatarUrl : null} /></span>
          {/* 本块在 {signedIn && (...)} 内，signedIn 恒真，直接用 label */}
          <span className={css.label}>{label}</span>
        </button>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => { setOpen(false) }} />
            <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 9999 }}>{richPanel}</div>
          </>
        )}
      </div>
    )}
    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}
      start={start} cancel={cancel} t={t}
      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}
    {signedIn && signOutImpact !== undefined && <SignOutDialog running={signOutImpact} signOut={signOut}
      close={() => { setSignOutImpact(undefined) }} t={t} />}
  </div>
}
