import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { ConversationContentProps, ConversationViewsProps, InputZone } from '../contract/slots.ts'
import { HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.tsx'
// HeightLab：首页视频模板网格（V32：hero 输入卡下方、栈内滚动）与余额提示条。
import { HeightLabVideoGrid } from './HeightLabVideoGrid.tsx'
import { QuotaNotice } from './QuotaNotice.tsx'
import css from './ConversationRoot.module.css'

function ConversationSessionView({ renderSlot }: ConversationViewsProps) {
  return renderSlot('conversation.session', {})
}

function NoConversationWidthControls() {
  return null
}

/**
 * Render the shared Conversation body and its occurrence-selected local Components.
 * @param props - Factory input, standard Session sources, and Conversation seats.
 * @returns the Conversation view, Composer, and optional width controls.
 */
export function ConversationContent(props: ConversationContentProps) {
  const {
    sessionId, phase, hero, useSession, useSessions, useSessionStatus,
    useWorkspaces, useInput, useComposerBlock, renderSlot, renderSlotChain,
    selectWorkspace, t, useFactorySlot,
  } = props
  const session = useSession(snapshot => snapshot)
  const Views = useFactorySlot('views', ConversationSessionView)
  const WidthControls = useFactorySlot('widthControls', NoConversationWidthControls)
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  const pendingInteraction = useSessionStatus(snapshot =>
    sessionId === undefined ? undefined : snapshot.get(sessionId)?.pendingInteraction)
  const inputState = useInput(s => s)
  const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
  const workspaces = useWorkspaces(s => s)
  // A plugin this package cannot import (ui-model-selection) says this session cannot
  // send; its reason is already localized by whoever raised it.
  const composerBlock = useComposerBlock(block => block)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<WorkspaceId | undefined>()
  const pickerAnchor = useRef<HTMLButtonElement>(null)

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

  // HeightLab V32：hero 滚动流——composerStack 成为滚动容器；输入卡与
  // 品牌层（标题 + 工作区行）都靠纯 CSS sticky 常驻顶部（见 module.css V32 块）。
  //
  // 2026-10-21 用户拍板「输入框和它上方的文字固定住不要动，模板从它们下方
  // 划过去」→ 品牌层不再随滚动收缩淡出，因此这里不再写 --hl-collapse。
  // 保留 ref 与 scroll 处理器？（无副作用：不再写变量，仅留空实现会误导）
  // 故整体移除收缩驱动，滚动完全交给 CSS。
  const stackRef = useRef<HTMLDivElement | null>(null)

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
  // A title still automatic reads in the reader's language, matching the
  // sidebar row the same Workspace has there.
  const storedChipTitle = pendingWorkspace?.title
    ?? (sessionId === undefined
      ? undefined
      : sessionWorkspace?.title
        ?? (workspaces.phase === 'ready' || cwd === undefined || cwd === ''
          ? undefined
          : workspaceLabel(cwd)))
  const chipTitle = storedChipTitle === undefined
    ? undefined
    : workspaceDisplayTitle(storedChipTitle, t('workspace.defaultName'))

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
  })

  const composerBar = (
    <div
      ref={stackRef}
      className={clsx(css.composerStack, hero && (replicationMode ? css.composerHeroReplication : css.composerHero))}
    >
      {hero && (replicationMode ? (
        <>
          <HeroShell t={t} renderSlot={renderSlot} />
          {heroWorkspaceRow}
        </>
      ) : (
        // V32：品牌收缩包装层——收缩淡出只作用于普通 hero；复刻态布局
        // （贴顶引导）不参与，保持原结构。
        <div className={css.heroBrandWrap}>
          <HeroShell t={t} renderSlot={renderSlot} />
          {heroWorkspaceRow}
        </div>
      ))}
      {zone !== undefined && renderSlot('conversation.input.dock', zone)}
      <QuotaNotice />
      {inputBar}
      {/* HeightLab V32：首页视频模板网格（仅普通 hero；复刻态不渲染）。 */}
      {hero && !replicationMode && <HeightLabVideoGrid />}
    </div>
  )

  // HeightLab V32：离开 hero 再回来时（新会话/返回首页），栈内滚动位置与
  // 收缩变量必须归零——溢出被收回时 scrollTop 静默清零、不触发 scroll
  // 事件，残留的 --hl-collapse=1 会让品牌区在初始态就被隐藏。
  useEffect(() => {
    if (phase !== 'hero') return
    const el = stackRef.current
    if (el === null) return
    el.scrollTop = 0
    el.style.removeProperty('--hl-collapse')
  }, [phase])

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
    <div ref={seatResizeRef} className={css.composerSeat} data-composer-seat="" data-conversation-region="composer">
      {composer}
    </div>
  )

  return (
    <div
      ref={setBody}
      className={clsx(css.body, props.variant === 'embedded' && css.embeddedBody)}
      data-conversation-content=""
      data-conversation-session={sessionId}
      data-conversation-region="chat"
      data-content-phase={phase}
      data-hl-conversation-body=""
    >
      <div className={css.scrollBody} data-conversation-scroll="">
        {sessionId === undefined ? null : <Views />}
        {composerSeat}
      </div>
      <WidthControls container={body} phase={phase} />
    </div>
  )
}
