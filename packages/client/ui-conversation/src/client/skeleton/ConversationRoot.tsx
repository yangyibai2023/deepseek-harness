// Resident conversation skeleton. Hero chrome, composer positioning, the
// chain, AND the composer bar (session-maybe slot) stay mounted across
// no-session/session transitions — the bar renders inert via owner props.

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ConversationSlotProps, InputZone } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.tsx'
// HeightLab：模板坞（hero 输入卡下方）与创意灵感/资料库覆盖层页。
import { HeightLabTemplateDock } from './HeightLabTemplateDock.tsx'
import { HeightLabHubPage, type HubPage } from './HeightLabHubPage.tsx'
import css from './ConversationRoot.module.css'

/** Full props composed from the slot contract. */
export type ConversationRootProps = ConversationSlotProps

/** localStorage key for the dragged transcript width preference (px). */
const WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
/** Floor for a dragged content width; matches the layout center-column minimum. */
const CONTENT_MIN = 640
/** Column budget the content must leave free: 88px per side keeps the width
 * handles fully placeable (24px inset + 40px strip + 24px safe zone) — a
 * larger dragged width would push its own handles off the column and leave no
 * way to drag back. */
const CONTENT_EDGE_BUDGET = 176

/** Reads the persisted width preference; durable-storage boundary, so a
 * missing or corrupt value resolves to "no preference".
 * @returns the stored width in px, or null when unset or invalid. */
function readWidthPreference(): number | null {
  const raw = localStorage.getItem(WIDTH_PREF_KEY)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Resolves the content width the CSS axis would show for a column width.
 * @param columnWidth - the conversation column's rendered width in px.
 * @param preference - the dragged preference, or null for the adaptive clamp.
 * @returns the resolved content width in px (mirrors the CSS clamp). */
function resolveContentWidth(columnWidth: number, preference: number | null): number {
  const max = Math.max(CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET)
  if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max)
  return Math.max(680, Math.min(columnWidth * 0.64, 920))
}

/** One transcript width handle: pointer capture + rAF-throttled symmetric
 * resize (both sides write the one centered width, so outward travel widens
 * by 2× the pointer distance). pointermove publishes the pointer's Y as a CSS
 * variable so the glow indicator rides it. Mirrors ui-layout AppFrame's
 * DragHandle capture model. */
function WidthHandle(props: {
  side: 'left' | 'right'
  onStart: () => number
  onDrag: (width: number) => void
  onCommit: (width: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const base = useRef(0)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props

  const outwardWidth = () => {
    const dx = latest.current - origin.current
    const outward = callbacks.current.side === 'right' ? dx : -dx
    return base.current + outward * 2
  }
  const cancelFrame = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
  }
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    base.current = callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--dsh-width-handle-pointer-y', `${e.clientY - box.top}px`)
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(outwardWidth())
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    cancelFrame()
    latest.current = e.clientX
    // Only a gesture with actual travel commits: a press-and-release on a
    // window-clamped width must not overwrite the wider stored preference
    // with the clamped display value.
    if (latest.current !== origin.current) callbacks.current.onCommit(outwardWidth())
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  // Releasing the button outside the window delivers pointercancel (or drops
  // the capture silently) instead of pointerup; without this the glow's
  // data-dragging state sticks on. The gesture is abandoned uncommitted —
  // onEnd republishes the stored preference. releasePointerCapture inside
  // onPointerUp also fires lostpointercapture, so this runs (idempotently)
  // after every normal drag end too; keep both paths.
  const onPointerCancel = useCallback(() => {
    cancelFrame()
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.widthHandle}
      data-side={props.side}
      data-width-handle={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

export function ConversationRoot({
  sessionId, useSession, useSessions, useSessionPendingInteraction,
  useWorkspaces, useConversation, useInput, useComposerBlock,
  renderSlot, renderSlotChain, selectWorkspace, t,
}: ConversationRootProps) {
  const session = useSession(s => s)
  const pendingInteraction = useSessionPendingInteraction(snapshot =>
    sessionId === undefined ? undefined : snapshot.get(sessionId))
  const conversation = useConversation(s => s)
  const shellPhase = session === undefined || conversation === undefined
    ? 'blank'
    : conversationPhase(session, conversation)
  const openState = session?.openState
  const inputState = useInput(s => s)
  const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)
  const workspaces = useWorkspaces(s => s)
  // A plugin this package cannot import (ui-model-selection) says this session cannot
  // send; its reason is already localized by whoever raised it.
  const composerBlock = useComposerBlock(block => block)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<WorkspaceId | undefined>()
  const pickerAnchor = useRef<HTMLButtonElement>(null)
  // HeightLab：创意灵感 / 资料库覆盖层页状态（null = 显示聊天）。
  const [hub, setHub] = useState<HubPage | null>(null)
  const hubRef = useRef(hub)
  hubRef.current = hub
  // HeightLab V26c：App 每次启动（进程加载本模块）时清除复刻模式标记——
  // 模式是「入口点击的一次性意图」，不得跨启动残留（用户实测：重启直接
  // 进入复刻模式）。sessionStorage 进程内只清一次，同进程内「视频创作→
  // 爆款复刻」设置的模式不受影响。
  try {
    if (sessionStorage.getItem('hl-boot-mode-cleared') === null) {
      localStorage.removeItem('hl-console-mode')
      sessionStorage.setItem('hl-boot-mode-cleared', '1')
    }
  } catch { /* 隐私模式等存储不可用时跳过 */ }
  // HeightLab V24b：视频复刻模式（侧边栏「视频创作」→「爆款复刻」进入）——
  // 空状态布局切换：hero 引导贴顶、输入卡贴底（.composerHeroReplication）。
  const [replicationMode, setReplicationMode] = useState(
    () => localStorage.getItem('hl-console-mode') === 'replication',
  )
  useEffect(() => {
    const sync = (): void => {
      const next = localStorage.getItem('hl-console-mode') === 'replication'
      setReplicationMode(next)
      // V26c 用户实测：进入二级页面（本视图挂载）时工作台才可能可靠打开
      //（此刻会话 surface 必已就绪）——挂载即打开，替代此前不可靠的
      // 「先广播后挂载」时序。
      if (next) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('hl:open-console'))
        }, 120)
      }
    }
    window.addEventListener('hl:mode-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('hl:mode-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // HeightLab：创意灵感 / 资料库 = 覆盖层页面（替换聊天页，类似 Z Code；
  // 侧边栏保留）。关闭时回到聊天。自动化由 ConversationSession 管理视图。
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ page?: unknown }>).detail
      if (detail?.page === 'inspiration' || detail?.page === 'library' || detail?.page === 'video-studio') {
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
      // 只作用于 better-sidebar 的面板宿主，绝不点击左侧原生侧边栏的收起按钮。
      // HeightLab 2026-09-14：0.19.1 删除了 toggleCluster 类（旧版用它圈定按钮簇），
      // 直接以面板宿主 data-dsh-panel-host 为范围——两版都成立的稳定锚点。
      const host = document.querySelector('[data-dsh-panel-host]')
      if (host === null) return
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
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

  // Publishes the two live measurements floating View chrome reads off the
  // scroll body: the seat's height as --dsh-composer-height, so controls clear
  // the composer as it grows, and the scrollport's own height as
  // --dsh-conversation-viewport-height, so a control can sit in the band the
  // seat leaves visible. Callback ref, not an effect; stable identity prevents
  // observer churn while the first blank session fills the resident body
  // outlet.
  const seatObserver = useRef<ResizeObserver | null>(null)
  const seatResizeRef = useCallback((seat: HTMLDivElement | null): void => {
    seatObserver.current?.disconnect()
    seatObserver.current = null
    const scroller = seat?.parentElement ?? null
    if (seat === null || scroller === null) return
    seatObserver.current = new ResizeObserver(() => {
      scroller.style.setProperty('--dsh-composer-height', `${seat.offsetHeight}px`)
      scroller.style.setProperty(
        '--dsh-conversation-viewport-height',
        `${scroller.clientHeight}px`,
      )
    })
    seatObserver.current.observe(seat)
    seatObserver.current.observe(scroller)
  }, [])

  // Publishes the column's live width as --dsh-conversation-column-width so
  // the shared width axis can adapt (see the .root CSS), and re-clamps a
  // dragged preference against the shrunken column WITHOUT rewriting the
  // stored preference — widening the window restores it (the AppFrame
  // sidebar-drag rule). Same callback-ref pattern as the seat observer.
  const rootEl = useRef<HTMLDivElement | null>(null)
  const rootObserver = useRef<ResizeObserver | null>(null)
  const publishWidths = useCallback((root: HTMLDivElement): void => {
    const column = root.offsetWidth
    root.style.setProperty('--dsh-conversation-column-width', `${column}px`)
    const preference = readWidthPreference()
    if (preference === null) {
      root.style.removeProperty('--dsh-chat-user-width')
    } else {
      root.style.setProperty('--dsh-chat-user-width', `${resolveContentWidth(column, preference)}px`)
    }
  }, [])
  const rootResizeRef = useCallback((root: HTMLDivElement | null): void => {
    rootObserver.current?.disconnect()
    rootObserver.current = null
    rootEl.current = root
    if (root === null) return
    rootObserver.current = new ResizeObserver(() => { publishWidths(root) })
    rootObserver.current.observe(root)
    publishWidths(root)
  }, [publishWidths])

  // Drag plumbing for the two width handles: onStart snapshots the resolved
  // width (grabbing a clamped column must not jump back to the raw stored
  // preference), onDrag publishes only the live clamped style, onCommit
  // persists the width of a gesture that actually travelled, and onEnd
  // republishes from storage — an uncommitted press leaves the stored
  // preference untouched.
  const onHandleStart = useCallback((): number => {
    const root = rootEl.current
    /* v8 ignore next -- handles render inside the root, so the ref is always attached. */
    if (root === null) return 680
    return resolveContentWidth(root.offsetWidth, readWidthPreference())
  }, [])
  const onHandleDrag = useCallback((width: number): void => {
    const root = rootEl.current
    /* v8 ignore next -- handles render inside the root, so the ref is always attached. */
    if (root === null) return
    const clamped = resolveContentWidth(root.offsetWidth, width)
    root.style.setProperty('--dsh-chat-user-width', `${clamped}px`)
  }, [])
  const onHandleCommit = useCallback((width: number): void => {
    const root = rootEl.current
    /* v8 ignore next -- handles render inside the root, so the ref is always attached. */
    if (root === null) return
    localStorage.setItem(WIDTH_PREF_KEY, `${resolveContentWidth(root.offsetWidth, width)}`)
  }, [])
  const onHandleEnd = useCallback((): void => {
    const root = rootEl.current
    if (root !== null) publishWidths(root)
  }, [publishWidths])

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
  // A restored continuable subagent also stays settled until its eagerly
  // loaded parent catalog establishes availability. This keeps the composer
  // hidden instead of briefly rendering the parent-offline takeover.
  const parentAvailabilityPending = session?.subagent?.address.mode === 'continuable'
    && session.subagent.parentAvailable === undefined
  const settling = sessionId !== undefined && (
    (shellPhase === 'blank' && openState === 'loading' && summaryBlank !== true)
    || parentAvailabilityPending
  )
  const hero = sessionId === undefined
    || (shellPhase === 'blank' && (openState === 'open' || summaryBlank === true))
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
  // HeightLab V31：hero 页滚动两态（对标 MiniMax Design）——composerStack
  // 自身为滚动容器（.composerHeroScroll）：顶部时品牌区+大输入卡（hero
  // variant）+模板区露一排半；上滚超过阈值后品牌区滚出、输入卡切紧凑
  // variant（composer）并 sticky 吸底，模板网格在其下无限滚动。复刻模式
  // 不参与（保持贴底引导布局）。
  const [heroCollapsed, setHeroCollapsed] = useState(false)
  const inputBar = renderSlot('conversation.composer.bar', {
    variant: hero && !heroCollapsed ? 'hero' : 'composer',
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
  })

  const composerBar = (
    <div
      className={clsx(
        css.composerStack,
        hero && !replicationMode && css.composerHeroScroll,
        hero && (replicationMode ? css.composerHeroReplication : css.composerHero),
      )}
      onScroll={hero && !replicationMode
        ? (event) => { setHeroCollapsed(event.currentTarget.scrollTop > 32) }
        : undefined}
    >
      {hero && <HeroShell t={t} renderSlot={renderSlot} />}
      {hero && heroWorkspaceRow}
      {zone !== undefined && renderSlot('conversation.input.dock', zone)}
      {/* V31：输入卡 sticky 吸底——滚动流中始终可见，底部渐变让滚过的内容
          从卡后淡出（对标 MiniMax 滚动态的紧凑输入条）。 */}
      {hero ? <div className={css.inputCardSeat}>{inputBar}</div> : inputBar}
      {/* HeightLab：模板坞（V31 起普通模式=视频模板网格），仅 hero 显示。 */}
      {hero && <HeightLabTemplateDock />}
    </div>
  )

  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  const composer = renderSlotChain(
    'conversation.composer',
    { sessionId, session, pendingInteraction },
    { fallback: composerBar, fallbackOnly: sessionId === undefined, overlay: true },
  )

  // Sticky wraps the whole chain output (fallback + elected overlay), not
  // only `.composerStack`: overlay:true renders those as siblings, and sticky
  // on the fallback alone would leave a business-owned takeover at the content
  // end off-screen when the user is not pinned to the floor.
  const composerSeat = (
    <div ref={seatResizeRef} className={css.composerSeat} data-composer-seat="">
      {composer}
    </div>
  )

  return (
    <div ref={rootResizeRef} className={css.root} data-phase={phase}>
      {/* HeightLab：新对话页顶部透明拖拽区（不占布局、不显示任何条），
          覆盖式标题栏下也能拖拽移动窗口；仅 hero 存在。 */}
      {hero && <div className={css.heroDragRegion} data-tauri-drag-region="" aria-hidden="true" />}
      {sessionId === undefined ? null : renderSlot('conversation.session.header', {})}
      {/* HeightLab：data-hl-conversation-body 供自动化独占页面时隐藏左侧步骤条。 */}
      <div className={css.body} data-hl-conversation-body="">
        <div className={css.scrollBody} data-conversation-scroll="">
          {sessionId === undefined ? null : renderSlot('conversation.session', {})}
          {composerSeat}
        </div>
        {/* Width handles only while a transcript is on screen; the hero has no
            content column to size. */}
        {phase === 'active' && (['left', 'right'] as const).map(side => (
          <WidthHandle
            key={side}
            side={side}
            onStart={onHandleStart}
            onDrag={onHandleDrag}
            onCommit={onHandleCommit}
            onEnd={onHandleEnd}
          />
        ))}
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
