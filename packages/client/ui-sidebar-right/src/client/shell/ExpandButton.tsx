/**
 * The way into a hidden panel: one button in the conversation header's corner
 * seat, shown only while the panel is collapsed.
 *
 * It lives in the conversation's own header rather than in the frame's right
 * column so that a collapsed Sidebar costs the conversation nothing — no rail,
 * no width, and the transcript's scrollbar stays at the column's edge. The
 * corner seat is its own, past the utilities' edge, so the button never joins
 * the utilities row; while the panel is shown this renders nothing, and the
 * seat collapses with it. It shares the panel's per-session store, which the
 * slot runtime allows because both seats are session-scoped.
 *
 * The glyph is the left sidebar's collapse icon mirrored: the same affordance,
 * on the other edge.
 */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import { Button, IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createSidebarRightStore } from '../stores.ts'
import css from './ExpandButton.module.css'

/** The button's props: the header corner seat, the shared store, and copy. */
export type ExpandButtonProps =
  & PropsRuntime<'conversation.session.header.corner'>
  & PropsStore<ReturnType<typeof createSidebarRightStore>>
  & PropsLocale<'sidebarRight'>
  & InjectFace<{ hooks: { shortcuts: HostObservable<readonly ShortcutCatalogEntry[]> } }>

/** The expand control while the panel is collapsed; nothing while it is shown. */
export function ExpandButton({ sessionId, useSession, useStore, actions, t, useShortcuts }: ExpandButtonProps): ReactNode {
  // A session with no surface yet is collapsed: the panel seat materializes the
  // surface on its own mount, and until then there is nothing expanded.
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'sidebar.right.toggle'))
  const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false)
  // HeightLab（2026-10-16 用户拍板）：空白/hero 会话不渲染本按钮——标题行为空
  // 时 corner 落到主区左上角，视觉上是第二个「折叠侧边栏」钮（0.4.1 无）；
  // 右侧工作台仍由创作流程照常唤起。活动会话的 corner 在标题行右端，保留。
  const session = useSession(snapshot => snapshot)
  if (expanded || session?.blank === true) return null
  return (
    <Tooltip label={t('chrome.expand')} shortcutKeys={shortcut?.keys} side="bottom" delayMs={500}>
      <Button
        size="sm"
        className={css.button}
        aria-label={t('chrome.expandAria')}
        aria-keyshortcuts={shortcut?.aria}
        data-sidebar-right-expand
        onClick={() => { actions.setExpanded(sessionId, true) }}
      >
        <IconPanelLeftOutlineRegular className={css.icon} />
      </Button>
    </Tooltip>
  )
}
