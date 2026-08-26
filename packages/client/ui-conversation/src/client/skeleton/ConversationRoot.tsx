// Resident conversation skeleton. Hero chrome, composer positioning, the
// chain, AND the composer bar (session-maybe slot) stay mounted across
// no-session/session transitions — the bar renders inert via owner props.

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSlotProps, InputZone } from '../contract/slots.ts'
import { HeroGlow, HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.tsx'
import { HeightLabTemplateDock } from './HeightLabTemplateDock.tsx'
import { HeightLabHubPage, type HubPage } from './HeightLabHubPage.tsx'
import { ConversationRail } from './ConversationRail.tsx'
import css from './ConversationRoot.module.css'

/** Full props composed from the slot contract. */
export type ConversationRootProps = ConversationSlotProps

export function ConversationRoot({
  sessionId, useSession, useSessions, useWorkspaces, useInput, useComposerBlock,
  renderSlot, renderSlotChain, selectWorkspace, t,
}: ConversationRootProps) {
  const openState = useSession(s => s.openState)
  const composerPhase = useSession(s => s.composerPhase)
  const pending = useSession(s => s.pending) ?? []
  const session = useSession(s => s)
  const inputState = useInput(s => s)
  const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)
  const workspaces = useWorkspaces(s => s)
  // A plugin this package cannot import (ui-model-selection) says this session cannot
  // send; its reason is already localized by whoever raised it.
  const composerBlock = useComposerBlock(block => block)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<WorkspaceId | undefined>()
  const [hub, setHub] = useState<HubPage | null>(null)
  const pickerAnchor = useRef<HTMLButtonElement>(null)
  const hubRef = useRef(hub)
  hubRef.current = hub

  // HeightLab：创意灵感 / 资料库 = 覆盖层页面（替换聊天页，类似 Z Code；
  // 侧边栏保留）。关闭时回到聊天。自动化由 ConversationSession 管理视图。
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ page?: unknown }>).detail
      if (detail?.page === 'inspiration' || detail?.page === 'library') {
        if (detail.page !== 'library') {
          window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
        }
        try { document.body.dataset.hlHub = '1' } catch { /* 非致命 */ }
        setHub(detail.page)
      }
    }
    const onClose = (): void => {
      window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
      try { document.body.dataset.hlHub = '0' } catch { /* 非致命 */ }
      setHub(null)
    }
    window.addEventListener('hl:open-hub', onOpen)
    window.addEventListener('hl:close-hub', onClose)
    return () => {
      window.removeEventListener('hl:open-hub', onOpen)
      window.removeEventListener('hl:close-hub', onClose)
    }
  }, [])

  // HeightLab：创意灵感/自动化采用覆盖层方案，会话视图常驻不卸载；
  // 点「自动化」时若创意灵感开着，只负责关掉它，视图切换由常驻的
  // ConversationSession 同步完成，无补发事件、无竞态。
  useEffect(() => {
    const onOpenAutomation = (): void => {
      window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
      if (hubRef.current !== null) setHub(null)
    }
    window.addEventListener('hl:open-automation', onOpenAutomation)
    return () => { window.removeEventListener('hl:open-automation', onOpenAutomation) }
  }, [])

  // HeightLab：创意灵感/自动化页与右侧边栏互斥——进入时收起右侧/底部面板，
  // 并给 body 打标记让右上角两个折叠按钮隐藏；退出时恢复。
  useEffect(() => {
    try {
      // 自动化视图由 ConversationSession 管理同一个标记；hub 关闭时不要
      // 覆盖「自动化已激活」的状态，避免右侧边栏错误恢复。
      if (hub !== null || document.body.dataset.hlAutomation !== '1') {
        document.body.dataset.hlHub = hub !== null ? '1' : '0'
      }
    } catch { /* 非致命 */ }
    if (hub === null) return
    const labels = ['收起侧边栏', '折叠侧边栏', '收起底部面板', '折叠底部面板']
    const closePanels = (): void => {
      // 只作用于 better-sidebar 的折叠按钮簇，绝不点击左侧原生侧边栏的收起按钮。
      const cluster = document.querySelector('[data-dsh-panel-host] [class*="toggleCluster"]')
      if (!cluster) return
      const buttons = [...cluster.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
      for (const label of labels) {
        const button = buttons.find(candidate => (candidate.getAttribute('aria-label') ?? '').includes(label))
        if (button) button.click()
      }
    }
    closePanels()
    // 面板可能在会话区被替换后异步自动拉起，延迟重试两次确保收起。
    const timers = [
      window.setTimeout(closePanels, 300),
      window.setTimeout(closePanels, 1000),
    ]
    return () => { for (const timer of timers) window.clearTimeout(timer) }
  }, [hub])

  // Publishes the seat's live height as --dsh-composer-height on the scroll
  // body so floating controls (ChatView back-to-bottom) clear the composer as
  // it grows. Callback ref, not an effect; stable identity prevents observer
  // churn while the first blank session fills the resident body outlet.
  const seatObserver = useRef<ResizeObserver | null>(null)
  const seatResizeRef = useCallback((seat: HTMLDivElement | null): void => {
    seatObserver.current?.disconnect()
    seatObserver.current = null
    const scroller = seat?.parentElement ?? null
    if (seat === null || scroller === null) return
    seatObserver.current = new ResizeObserver(() => {
      scroller.style.setProperty('--dsh-composer-height', `${seat.offsetHeight}px`)
    })
    seatObserver.current.observe(seat)
  }, [])

  const sessionWorkspace = sessionId === undefined
    ? undefined
    : workspaces.items.find(workspace => workspace.sessionIds.includes(sessionId))
  const pendingWorkspace = workspaces.items.find(
    workspace => workspace.workspaceId === pendingWorkspaceId,
  )

  // Clear the pending pick once the session lands in it, or when the picked
  // workspace disappears from a ready list (deleted from the sidebar).
  useEffect(() => {
    if (pendingWorkspaceId === undefined) return
    if (sessionWorkspace?.workspaceId === pendingWorkspaceId
      || (workspaces.phase === 'ready' && pendingWorkspace === undefined)) {
      setPendingWorkspaceId(undefined)
    }
  }, [pendingWorkspaceId, sessionWorkspace?.workspaceId, workspaces.phase, pendingWorkspace])

  // While a session is still replaying (loading + blank) the hero/docked
  // choice is unknowable — render the composer hidden instead of flashing
  // the centered hero and snapping to the docked bar (or vice versa).
  // Exemption: a session the list summary already proves blank can only
  // land on the hero, so hiding would blank the column for the whole
  // history round-trip (the startup auto-selection flash) for nothing.
  // The exemption is deliberately open-state-wide, not loading-only: a
  // summary-blank session is the hero before its open starts (`cold`) and
  // after one fails (`error`) for the same reason — there is no history.
  const settling = sessionId !== undefined && composerPhase === 'blank' && openState === 'loading'
    && summaryBlank !== true
  const hero = sessionId === undefined
    || (composerPhase === 'blank' && (openState === 'open' || summaryBlank === true))
  const zone: InputZone | undefined =
    session === undefined || inputState === undefined ? undefined : { session, input: inputState }

  // The chip is a selector; label resolution walks the flow top-down:
  //   1. a just-picked workspace (pending) → its title;
  //   2. cold start, no session yet → placeholder ("Choose workspace");
  //   3. the blank session's workspace is in the list → its title;
  //   4. list still loading → cwd folder name bridges so the title does not
  //      flash on refresh (empty cwd → placeholder);
  //   5. list ready but no owning workspace (deleted from the sidebar) →
  //      placeholder, never the deleted folder's name via cwd.
  const chipTitle = pendingWorkspace?.title
    ?? (sessionId === undefined
      ? undefined
      : sessionWorkspace?.title
        ?? (workspaces.phase === 'ready' || cwd === undefined || cwd === ''
          ? undefined
          : workspaceLabel(cwd)))

  const heroWorkspaceRow = (
    <div className={css.heroWorkspaceRow}>
      <WorkspaceChip
        buttonRef={pickerAnchor}
        label={chipTitle}
        menuOpen={pickerOpen}
        onClick={() => { setPickerOpen(open => !open) }}
        t={t}
      />
      {renderSlot('conversation.hero.workspace', {
        open: pickerOpen,
        anchorRef: pickerAnchor,
        selectedId: pendingWorkspaceId ?? sessionWorkspace?.workspaceId,
        onPick: (workspaceId) => {
          setPickerOpen(false)
          setPendingWorkspaceId(workspaceId)
          void selectWorkspace(workspaceId).catch(() => {
            setPendingWorkspaceId(current => current === workspaceId ? undefined : current)
          })
        },
        onClose: () => { setPickerOpen(false) },
      })}
      {/* HeightLab：创造 Agent 开关（原生预留的 hero.agentPreset 插槽）。 */}
      {renderSlot('conversation.hero.agentPreset', {})}
    </div>
  )

  // The placeholder chip ("Choose workspace") and the Workspace-trigger input travel
  // together: no workspace picked yet (cold start, no session at all), or a
  // blank session whose workspace vanished (deleted from the sidebar). The
  // bar is ONE session-maybe slot rendered unconditionally — inert is a prop,
  // not a different tree, so the textarea DOM survives the transition.
  const inert = sessionId === undefined || (hero && chipTitle === undefined)
  // A raised block is the same inert posture with the blocker's own reason:
  // one disabled textarea, never a second tree. The no-workspace state wins
  // when both hold — picking a workspace is the earlier prerequisite.
  const blocked = !inert && composerBlock !== undefined
  const inputBar = renderSlot('conversation.composer.bar', {
    variant: hero ? 'hero' : 'composer',
    ...(inert
      ? {
        disabled: true,
        placeholder: t('placeholder.workspace'),
        workspacePickerOpen: pickerOpen,
        onRequestWorkspace: () => { setPickerOpen(true) },
      }
      : blocked
        // `blocked`, not `disabled`: the bar refuses input either way, but a
        // block keeps the model seat live because choosing a model is how the
        // user clears it.
        ? { blocked: composerBlock, placeholder: composerBlock.reason }
        : hero ? { placeholder: t('placeholder.hero') } : {}),
    overlay: renderSlot('conversation.input.overlay', {}),
    leftItems: zone === undefined ? null : renderSlot('conversation.input.left', zone),
    rightItems: zone === undefined ? null : renderSlot('conversation.input.right', zone),
    // Stats band under the card, inside the bar's width column so both
    // share one constraint (composer.dock = stats-line family).
    footer: !hero && zone !== undefined ? renderSlot('conversation.composer.dock', zone) : null,
  })

  const composerBar = (
    <div className={clsx(css.composerStack, hero && css.composerHero)}>
      {hero && <HeroGlow className={css.heroGlow} />}
      {hero && <HeroShell t={t} renderSlot={renderSlot} />}
      {hero && heroWorkspaceRow}
      {zone !== undefined && renderSlot('conversation.input.dock', zone)}
      {inputBar}
      {hero && <HeightLabTemplateDock />}
    </div>
  )

  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  const composer = renderSlotChain(
    'conversation.composer',
    { interactions: pending, session },
    { fallback: composerBar, overlay: true },
  )

  // Sticky wraps the whole chain output (fallback + elected overlay), not
  // only `.composerStack`: overlay:true renders those as siblings, and sticky
  // on the fallback alone would leave Question/Approval panels at the content
  // end off-screen when the user is not pinned to the floor.
  const composerSeat = (
    <div ref={seatResizeRef} className={css.composerSeat} data-composer-seat="">
      {composer}
    </div>
  )

  return (
    <div className={css.root} data-phase={phase}>
      {/* HeightLab：新对话页顶部透明拖拽区（不占布局、不显示任何条），
          覆盖式标题栏下也能拖拽移动窗口；仅 hero 存在，右侧边栏按钮
          （z 更高）与左侧步骤导航条不受影响。 */}
      {hero && <div className={css.heroDragRegion} data-tauri-drag-region="" aria-hidden="true" />}
      {renderSlot('conversation.session.header', {})}
      {/* HeightLab：data-hl-conversation-body 供自动化独占页面时隐藏左侧步骤条。 */}
      <div className={css.bodyRow} data-hl-conversation-body="">
        <ConversationRail useSession={useSession} t={t} />
        <div className={css.scrollBody} data-conversation-scroll="">
          {renderSlot('conversation.session', {})}
          {composerSeat}
        </div>
      </div>
      {/* HeightLab：创意灵感 = 覆盖层页面（会话视图常驻，标签随时互切；
          × 关闭时同时回到对话，避免下层残留自动化视图）。 */}
      {hub !== null && (
        <div className={css.hubOverlay}>
          <HeightLabHubPage
            page={hub}
            onClose={() => {
              setHub(null)
              window.dispatchEvent(new CustomEvent('hl:close-automation'))
            }}
          />
        </div>
      )}
    </div>
  )
}
