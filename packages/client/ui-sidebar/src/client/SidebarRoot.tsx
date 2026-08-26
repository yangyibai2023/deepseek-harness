/**
 * Sidebar shell: column geometry only. Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the four upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings control only fades. The workspace/session browsing region between
 * the New Session button and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings` plus `sidebar.footer.action`; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconNewChatOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRootComponentProps } from './contract/slots.ts'
import css from './SidebarRoot.module.css'
import {
  IconInspirationStroke16, IconLibraryStroke16, IconAutomationStroke16, IconPanelLeftStroke16,
} from './sidebar-icons.tsx'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.logoRow}>
        {/* Expanded, the brand doubles as a New Session shortcut; the
            collapsed rail's logo is the expand toggle below instead. */}
        {wide && (
          <button
            type="button"
            className={clsx(css.brand, css.wide)}
            aria-label={t('session.new.label')}
            onClick={() => { startSession() }}
          >
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                {/* HeightLab 2026-08-26：黑色胶囊 PNG（透明底），随 build:web
                    进 public→dist；暗色主题由 CSS invert 转白。 */}
                {renderSlot('sidebar.brand.mark', { size: 20 }, { fallback: <img src="/heightlab-logo.png" alt="" width={20} height={20} draggable={false} style={{ width: 20, height: 20, objectFit: 'contain' }} /> })}
              </span>
              <span className={css.brandName}>
                {renderSlot('sidebar.brand.name', {}, {
                  fallback: (
                    <>
                      <span className={css.fallbackBrandName}>HEIGHTLAB</span>
                    </>
                  ),
                })}
              </span>
            </span>
          </button>
        )}
        {/* Rail resting state is the whale mark; hovering swaps in the panel
            icon (the expand affordance, figma sidebar-hover flow). */}
        <Tooltip label={collapsed ? t('toggle.open') : t('toggle.collapse')} delayMs={500}>
          <button
            type="button"
            className={clsx(css.iconButton, css.toggle)}
            aria-label={collapsed ? t('toggle.open') : t('toggle.collapse')}
            onClick={() => { toggleSidebar() }}
          >
            {!wide && (
              <span className={css.railMark} aria-hidden="true">
                {/* HeightLab 2026-08-26：折叠态胶囊 fallback，同款黑 PNG。 */}
                {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <img src="/heightlab-logo.png" alt="" width={24} height={24} draggable={false} style={{ width: 24, height: 24, objectFit: 'contain' }} /> })}
              </span>
            )}
            {/* Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes. */}
            <IconPanelLeftStroke16 className={css.panelIcon} size={wide ? 16 : 18} />
          </button>
        </Tooltip>
      </div>

      {/* Expanded, the button carries its own label — tooltip only on the rail. */}
      <Tooltip label={t('session.new.label')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={css.newSession}
          aria-label={t('session.new.label')}
          onClick={() => { startSession() }}
        >
          {/* HeightLab 2026-08-26：展开态 16px，与 hlNav/添加工作区一致。 */}
          <IconNewChatOutline16 size={wide ? 16 : 18} />
          {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
        </button>
      </Tooltip>

      {/* The browsing region fills the column between the controls and the
          foot in both states; its rail icon column rides the same slot. */}
      <div className={css.regionArea}>
        {/* HeightLab：自定义导航（创意灵感 / 资料库 / 自动化）。
           去 emoji、去内联样式，改用 rc.2 原生 SVG 描边图标 + 主题 token
           (css.hlNav* 用 var(--dsw-alias-*) 定义，与侧边栏原生风格统一)。 */}
        <div className={css.hlNav}>
          {[
            { key: 'inspiration', label: '创意灵感', Icon: IconInspirationStroke16, dispatch: 'hl:open-hub', detail: { page: 'inspiration' } },
            { key: 'library', label: '资料库', Icon: IconLibraryStroke16, dispatch: 'hl:open-hub', detail: { page: 'library' } },
            { key: 'automation', label: '自动化', Icon: IconAutomationStroke16, dispatch: 'hl:open-automation', detail: {} },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              className={css.hlNavItem}
              onClick={() => window.dispatchEvent(new CustomEvent(item.dispatch, { detail: item.detail }))}
              title={item.label}
            >
              {/* HeightLab 2026-08-26：rail 内统一 18px（figma rail spec）。 */}
              <item.Icon size={wide ? 16 : 18} className={css.hlNavIcon} />
              {wide && <span className={css.hlNavLabel}>{item.label}</span>}
            </button>
          ))}
        </div>
        {renderSlot('sidebar.workspaces', {
          wide,
          expandSidebar: () => { if (collapsed) toggleSidebar() },
        })}
      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
      </div>
    </div>
  )
}
