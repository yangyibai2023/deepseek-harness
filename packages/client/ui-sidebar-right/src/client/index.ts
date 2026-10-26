/**
 * Browser half: fill the frame's right column with the panel, put the expand
 * button in the conversation header, and own the seats a tab type registers
 * into.
 *
 * Two seats share one session-scoped store, which the slot runtime allows
 * because both are session-scoped (a handle may not span scopes). The panel seat
 * in the frame draws the surface normally or fullscreen, retaining the track
 * on wide viewports; the header's corner seat draws the way back in
 * while the panel is hidden. The store is the layout's only source of truth; the docking
 * kit's pure planners compute every change and the store records them, one
 * history entry per intent.
 *
 * The frame is a base package and never injects this one. What it needs —
 * whether the panel is shown and whether it wants a track — arrives through its
 * own `ctx.layout` action face, reported by the seat that knows both facts.
 *
 * Tab types register in two stages: the type itself into `ctx.sidebarRightTabs`,
 * its body into the keyed `sidebar.right.pane.tab` seat under the same kind. The
 * guide registers through those stages unmodified, exactly as a type shipped
 * from another package does — `ui-sidebar-documentpreview` is the live proof.
 */
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import { observeSidebarFocus } from './focus.ts'
import { registerSidebarShortcuts } from './shortcuts.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from './contract/slots.ts'
import { GuideBody, type GuideInjected } from './tabs/guide/GuideBody.tsx'
import { GuideTitle } from './tabs/guide/GuideTitle.tsx'
import { ExpandButton } from './shell/ExpandButton.tsx'
import { RightbarSeat, type SidebarRightInjected } from './shell/SidebarRight.tsx'
import { closeWithPaneFocus, openWithPaneFocus } from './shell/close-focus.ts'
import { RightbarRoot, type RightbarRootInjected } from './shell/RightbarRoot.tsx'
import { SidebarSessionViews } from './session-views.ts'
import { createSidebarRightController, type SidebarRightController } from './service.ts'
import { SidebarRightTabRegistry } from './tab-registry.ts'
import { createSidebarRightStore } from './stores.ts'
import { en, zh } from './locales.ts'
import { GUIDE_ID, guideDefinition } from './tabs/guide/definition.ts'
// HeightLab：创作控制台（营销模式）页面型 tab——按需出现，不注册 guide 入口。
import { CONSOLE_ID, CONSOLE_KIND, consoleDefinition } from './tabs/console/definition.ts'
import { ConsoleBody } from './tabs/console/ConsoleBody.tsx'
import { ConsoleTitle } from './tabs/console/ConsoleTitle.tsx'
import { guideTabInfoFactory, tabInfoFactory } from './tab-info.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { defaultSeed } from './contract/seed.ts'

export type { SidebarRightTarget } from './focus.ts'
export type { RightbarSeatProps, SidebarRightInjected, SidebarRightPresentation } from './shell/SidebarRight.tsx'
export type { GuideBodyProps, GuideInjected } from './tabs/guide/GuideBody.tsx'
export type { ExpandButtonProps } from './shell/ExpandButton.tsx'
export type { SidebarRightState, SurfaceState } from './stores.ts'
export type {
  ISidebarRight, SidebarRightOpenResourceOptions, SidebarRightOpenTabOptions,
  SidebarRightPlacement, SidebarRightCloseHandler, SurfaceActions,
} from './service.ts'
export type {
  SidebarRightGuideBox, SidebarRightGuideEntry, SidebarRightTabClaim, SidebarRightTabDefinition,
  SidebarRightTabPriority,
} from './tab-registry.ts'
export type {
  SidebarRightTabInfo, SidebarRightTabInjected, UseSidebarRightTabInfo, SidebarRightTabActions,
  SidebarRightTabMenuOwnerProps, SidebarRightTabNavigation, SidebarRightTabPlacement, SidebarRightGuideEntryOwnerProps,
} from './contract/slots.ts'
export type {
  SidebarRightNavigationParams, SidebarRightResourceParams, SidebarRightResourceParamsMap,
  SidebarRightTabParams, SidebarRightTabParamsFor, SidebarRightTabParamsMap,
} from './contract/params.ts'
// The layout ids and rectangle the navigation face takes, so a caller needs no import from the kit.
export type { FloatRect, PaneId, TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
export type { PinResource, SidebarRightNavigator, TabOccurrence, SidebarRightOccurrenceId } from './tab-domain.ts'
export type { SidebarRightKey } from './locales.ts'
export type { OpenContentIntent } from './stores.ts'
export type { SidebarRightOpenTab } from './tab-inventory.ts'

/** This package's copy namespace. */
const NS = 'sidebarRight'

/** Required browser services: the slot registry, the frame's panel actions, copy, and the resource model. */
export const inject = ['slots', 'layout', 'locale', 'resources', 'sessions', 'uiSession', 'shortcuts']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Right-Sidebar navigation and presentation face. */
    sidebarRight: SidebarRightController
    /** Right-Sidebar tab-type registry (stage one of a tab type's registration). */
    sidebarRightTabs: SidebarRightTabRegistry
  }
}

/**
 * Client plugin body: provide the registry and the navigation face, register the
 * panel seat and the rail seat over one store with their extension children, and
 * register the guide type through the same public two-stage path any other type
 * uses.
 * @param ctx - client root context carrying the slot registry, the frame's face, and copy.
 */
export function apply(ctx: ClientContext): void {
  // The registry and the face it backs are built here, at apply's top level,
  // and never inside an effect. A registry other packages register into cannot
  // have an effect-internal scope as its host: `register()` adds an effect to
  // this fiber, and doing that from another plugin's apply while the effect is
  // still the active scope stalls browser boot with no error at all. The
  // template this follows (ui-conversation's definition registry) is built at
  // its own apply top level for the same reason.
  const t = ctx.locale.bind(NS)
  const tabs = new SidebarRightTabRegistry(ctx)
  const views = new SidebarSessionViews(ctx.sessions)
  ctx.effect(() => {
    const current = ctx.uiSession.adapter.current
    const sync = (): void => { views.select(current.getSnapshot().key as SessionId | undefined) }
    const unsubscribe = current.subscribe(sync)
    sync()
    return () => { unsubscribe(); views.dispose() }
  }, 'ui-sidebar-right: retained Session views')
  const layout: ILayout = ctx.layout
  // The automatic fullscreen rule as the seats last rendered it: the frame
  // hands them its width as owner props, and every seat reports the same rule.
  let autoFullscreen = false
  const { controller, adopt, forget, show, measure } = createSidebarRightController(
    tabs,
    (address, signal) => { ctx.resources.pin(address, signal) },
    {
      autoFullscreen: () => autoFullscreen,
      openWithFocus: (sessionId, open) => { openWithPaneFocus(document, sessionId, open) },
      closeWithFocus: (sessionId, paneId, close) => { closeWithPaneFocus(document, sessionId, paneId, close) },
    },
  )
  // The Session on screen: the selected one while the Conversation fills the
  // main column. Both sources notify before React renders their change, so the
  // service names the arriving Session before any component of that commit
  // reads it, and its seat mints the Session's store in the same render.
  ctx.effect(() => {
    const sync = (): void => {
      const selected = views.source.getSnapshot().find(view => view.selected)
      show(layout.panelInfo.getSnapshot().activePanelId === null ? selected?.sessionId : undefined)
    }
    const unsubscribeViews = views.source.subscribe(sync)
    const unsubscribePanel = layout.panelInfo.subscribe(sync)
    sync()
    return () => {
      unsubscribeViews()
      unsubscribePanel()
      show(undefined)
    }
  }, 'ui-sidebar-right: on-screen Session')
  const disposeRegistry = ctx.reflect.provide('sidebarRightTabs', tabs)
  const disposeService = ctx.reflect.provide('sidebarRight', controller)
  // Registered first, so it tears down last: the faces outlive every seat and
  // type that reaches for them. provide()'s disposer settles asynchronously;
  // teardown is synchronous fire-and-forget, matching ui-layout's root entry.
  // Unloading aborts every tab occurrence, which releases every pin.
  ctx.effect(() => () => {
    controller.tabDomain.dispose()
    void disposeService()
    void disposeRegistry()
  }, 'ui-sidebar-right: service faces')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-right: dictionaries')
  ctx.effect(() => registerSidebarShortcuts(ctx.shortcuts, controller, t, () => {
    void ctx.shortcuts.closeWindow().catch((error: unknown) => { console.error('Window close failed', error) })
  }), 'ui-sidebar-right: shortcuts')
  if (typeof document !== 'undefined') ctx.effect(() => observeSidebarFocus(document), 'ui-sidebar-right: focus')

  ctx.effect(() => {
    // HeightLab 创作控制台（营销模式）：按需出现的页面型 tab。
    // 不注册 guide 入口——仅做同款/聊天意图 dispatch hl:open-console 时打开。
    const disposeConsoleTypes = [tabs.register(consoleDefinition())]
    const disposeConsoleBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: CONSOLE_ID },
      ConsoleBody,
    ))
    const disposeConsoleTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
      { name: 'sidebar.right.pane.tab.title', key: CONSOLE_ID },
      ConsoleTitle,
    ))
    // HeightLab V26c 二修：openTab 在新会话 surface 未挂载时同步抛错
    //（'no session surface is mounted'），此前被静默吞掉导致「进入视频复刻
    // 工作台不弹出」。改为带重试的打开：每 400ms 一次、最多 8 次（覆盖
    // 新会话创建→视图挂载→面板绑定的全部时序），就绪即成功；多触发点
    // （入口/二级页挂载/做同款）均安全——openTab 幂等，重复只是聚焦。
    // V48：启动 3 秒内的 store-create/session-switched 属被动恢复（App 重开
    // 自动选中上次会话），不是用户主动切入——不弹工作台、不展开（用户实测
    // 重开 App 右栏自动弹+开合拉锯的根因之一）。用户主动点会话在 3 秒后，
    // 不受影响；本轮跳过后用户再点一次即可正常弹出。
    const bootAt = Date.now()
    const inBootWindow = (source: string): boolean =>
      (source === 'store-create' || source === 'session-switched') && Date.now() - bootAt < 3000

    /**
     * `hl-console-mode === 'replication'` 是否"新鲜"到可以据此自动弹面板。
     *
     * 2026-10-23：这个键是跨会话的全局开关，正常情况下应在退出创作时清掉，
     * 但实测会残留（切会话/异常退出/localStorage 被旧版本写脏）。残留时
     * 用户打开任何无关对话都会被弹创作台并挤走左侧栏 —— 用户明确反馈
     * 「这个对话和视频没有关系，也没有使用过创作台，它不应该自动弹出」。
     *
     * 判据：只在写入后 10 分钟内的复刻模式算作"用户当前正在创作"。
     * 写入方（ui-workspace / HeightLabTemplateDock）会同步写
     * `hl-console-mode-at` 时间戳；没有时间戳的旧数据一律视为过期。
     */
    const REPLICATION_MODE_TTL_MS = 10 * 60 * 1000
    const replicationModeFresh = (): boolean => {
      try {
        const at = Number(localStorage.getItem('hl-console-mode-at') ?? '0')
        if (!Number.isFinite(at) || at <= 0) return false
        return Date.now() - at < REPLICATION_MODE_TTL_MS
      } catch {
        return false
      }
    }

    let expandLoopRunning = false
    const openConsoleRetrying = (expand: boolean): void => {
      if (expand && expandLoopRunning) return
      // V40 修复：展开判定改 DOM 实测——isExpanded() 状态可能与 DOM 脱同步
      //（实测列宽 0 但状态=已展开 → 展开被跳过，面板挂在 0 宽列上位移出屏，
      // 用户看到「点了没反应」）。以侧栏列实际宽度为准，不足就强制切换。
      const colWidth = (): number =>
        document.querySelector('[class*="rightbarCol"]')?.getBoundingClientRect().width ?? 0
      let attempt = 0
      const tryOpen = (): void => {
        attempt += 1
        try {
          controller.openTab(CONSOLE_KIND)
        } catch {
          if (attempt < 8) window.setTimeout(tryOpen, 400)
          return
        }
        if (!expand) return
        let expandAttempt = 0
        expandLoopRunning = true
        const tryExpand = (): void => {
          expandAttempt += 1
          try { if (colWidth() < 300) controller.toggleExpanded() } catch { /* 静默重试 */ }
          if (colWidth() < 300 && expandAttempt < 12) window.setTimeout(tryExpand, 300)
          else expandLoopRunning = false
        }
        tryExpand()
      }
      tryOpen()
    }
    // HeightLab V29 诊断埋点：复刻带回链路各分叉 POST /hl/boot-marker，
    // 宿主日志（~/.heightlab/logs/dsh-host.log）grep hlReplication 即可
    // 定位断点；链路确认稳定后整体撤除。
    const diag = (stage: string, extra: Record<string, unknown> = {}): void => {
      try {
        void fetch('/hl/boot-marker', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hlReplication: true, stage, ...extra }),
        }).catch(() => { /* 非致命 */ })
      } catch { /* 非致命 */ }
    }
    // HeightLab V29：目标会话的复刻判定与带回（两级判定共用）。打开动作走
    // openConsoleRetrying 幂等轮询（铁律 17）。普通会话探到双 null 不打扰。
    //
    // 2026-10-23 修复「无关的对话也自动弹出创作台」（Windows 用户实测，
    // 且会连带把左侧栏挤掉、侧栏按钮消失，属严重体验事故）：
    //
    // 原实现先查 localStorage 里的 `hl-replication-sessions` 注册表，命中就
    // 无条件展开右栏。但这个注册表是**跨会话的全局缓存**，只在少数路径清理；
    // 一旦用户在某次创作里进过复刻模式，之后**打开任何历史对话**都可能被
    // 判定成复刻会话 → 右栏强制展开 + 左栏被挤走。
    //
    // 修法：注册表**不再单独构成证据**。它只用来省一次网络请求，且必须与该
    // 会话自己的服务端状态一致才采信；否则一律以 `/hl/console-state` 为准。
    // 服务端状态是 per-session 文件，不会串会话。
    const ensureReplicationConsole = (sid: string, source: string): void => {
      let cached = false
      try {
        const rep = JSON.parse(localStorage.getItem('hl-replication-sessions') ?? '[]') as unknown[]
        cached = Array.isArray(rep) && rep.includes(sid)
      } catch { /* 忽略 */ }
      diag('probe-start', { sid, source, cached })
      void fetch(`/hl/console-state?session=${encodeURIComponent(sid)}`)
        .then(res => res.json() as Promise<{ workflow?: unknown; draft?: unknown }>)
        .then((state) => {
          const hasState =
            (state?.workflow ?? null) !== null || (state?.draft ?? null) !== null
          if (!hasState) {
            // 服务端明确说这个会话没有创作状态 —— 不管本地注册表怎么说，
            // 都不能自动弹面板。顺手把这条脏记录摘掉，避免下次又命中。
            diag('probe-miss', { sid, source, cached })
            /* 2026-10-26（A1 配套）：刚进复刻模式紧随创建的新会话，服务端
             * 尚无创作状态是正常的（用户还没开始填）——此时不能摘注册表，
             * 否则下一次 session-switched 又判成非复刻会话把控制台关掉。 */
            let justEnteredReplication = false
            try {
              const at = Number(localStorage.getItem('hl-console-mode-at') ?? '0')
              justEnteredReplication = localStorage.getItem('hl-console-mode') === 'replication'
                && Number.isFinite(at) && at > 0 && Date.now() - at < 15_000
            } catch { /* 忽略 */ }
            if (cached && !justEnteredReplication) {
              try {
                const list = JSON.parse(localStorage.getItem('hl-replication-sessions') ?? '[]') as unknown[]
                if (Array.isArray(list)) {
                  localStorage.setItem(
                    'hl-replication-sessions',
                    JSON.stringify(list.filter((id) => id !== sid).slice(-50)),
                  )
                }
              } catch { /* 非致命 */ }
            }
            return
          }
          try {
            const list = JSON.parse(localStorage.getItem('hl-replication-sessions') ?? '[]') as unknown[]
            if (Array.isArray(list) && !list.includes(sid)) {
              list.push(sid)
              localStorage.setItem('hl-replication-sessions', JSON.stringify(list.slice(-50)))
            }
          } catch { /* 非致命 */ }
          diag('probe-hit-open', { sid, source })
          openConsoleRetrying(true)
        })
        .catch(() => { diag('probe-error', { sid, source }) })
    }
    // HeightLab V24b：回到主页/普通会话时创作工作台自动关闭。触发：
    // hl:close-console（显式）或 hl:mode-change 清除模式。2026-10-14 0.2.1
    // 适配：closeKind 已不存在，按 mounted 会话经 closeIn 关控制台 tab。
    // V31g：控制台关闭且无其他活动 tab 时，同时收起右栏栏体——空栏残留
    // 会把主页模板区挤压变形且无法自行恢复（用户实测）。
    const onCloseConsole = (): void => {
      const sid = controller.mounted.getSnapshot()
      if (sid !== undefined) {
        try { controller.closeIn(sid, CONSOLE_ID as TabId) } catch { /* 无 tab 时静默 */ }
      }
      try {
        if (controller.active() === undefined && controller.isExpanded()) controller.toggleExpanded()
      } catch { /* 右栏未挂载时静默 */ }
    }
    // HeightLab V26e：hl:start-replication——新会话 seed 已天生带控制台首
    // tab（contract/seed.ts）；这里只负责右栏若收起则自动展开。
    const onStartReplication = (): void => {
      window.setTimeout(() => {
        try {
          if (!controller.isExpanded()) controller.toggleExpanded()
        } catch { /* 会话尚未挂载时静默；seed 已带 tab，展开态随会话恢复 */ }
      }, 600)
    }
    // HeightLab V29：会话切换事件。V31g：切到「非复刻会话」时同步清理复刻
    // 上下文（0.2.1 适配：按切入会话 closeIn）。
    const onSessionSwitched = (event: Event): void => {
      const sid = (event as CustomEvent<{ sessionId?: unknown }>).detail?.sessionId
      if (typeof sid !== 'string' || sid === '') return
      /* 2026-10-26（1024 优化 A1，用户实测「爆款复刻的创作台自己关闭」）：
       * 该事件由 ConversationSessionHeader 的 useEffect 派发——**每个渲染出来的
       * 会话 header 都会广播自己的 ID**，不只是用户真正导航到的那个。无头实测
       * 事件链：start-replication → 新会话 ab96 广播 → 创作台展开 → 740ms 后
       * **旧会话 2eff 的 header 重新挂载又广播一次** → 这里当成"切回旧会话"
       * → 关控制台。那不是导航，是 UI 重渲染的回声。
       *
       * 权威真源是 controller.mounted（上游定义的 on-screen Session）：广播的
       * ID 与它不一致即为过时回声，直接忽略。 */
      const onScreen = controller.mounted.getSnapshot()
      if (onScreen !== undefined && onScreen !== sid) {
        diag('session-switched-stale', { sid, onScreen })
        return
      }
      diag('session-switched', { sid })
      let rep: unknown[] = []
      try { rep = JSON.parse(localStorage.getItem('hl-replication-sessions') ?? '[]') as unknown[] } catch { /* 忽略 */ }
      /* 「爆款复刻」= 进复刻模式 → 新建会话 → 切入。切入时新会话**还没登记进**
       * 注册表（登记发生在后面的服务端探针命中之后），这里会被判成"非复刻会话"。
       * 修法：复刻模式**刚刚**（15s 窄窗口）被进入时，这个紧随其后的新会话
       * 就是复刻目标——不关控制台、顺手登记注册表让后续判定一致。窄窗口而
       * 非 10 分钟 TTL：避免 10 分钟内切到任何旧会话都被当成复刻会话。 */
      let justEnteredReplication = false
      try {
        const at = Number(localStorage.getItem('hl-console-mode-at') ?? '0')
        justEnteredReplication = localStorage.getItem('hl-console-mode') === 'replication'
          && Number.isFinite(at) && at > 0 && Date.now() - at < 15_000
      } catch { /* 忽略 */ }
      const registered = Array.isArray(rep) && rep.includes(sid)
      /* 2026-10-26 追凶补充：复刻模式下，恢复中的旧会话 header 会**迟到广播**
        （无头实测：新会话创作台展开 4s 后旧会话 8218 广播到达）。此刻 mounted
        可能仍是旧会话（React 未提交新选择），"onScreen 校验"拦不住。而创作台
        的关闭只有这一处会误触发，因此收敛为：复刻模式鲜活（fresh TTL 10 分钟，
        与既有 replicationModeFresh 同口径）期间，**本监听器不做任何关闭动作**
        ——只是不关，不主动开，故不会重现 2026-10-23 的"无关对话自动弹面板"
        事故（那是 openConsole 的问题，此处不碰 openConsole）。用户手动关闭
        （hl:close-console → onCloseConsole）不受影响。 */
      if (replicationModeFresh()) {
        diag('session-switched-replication-hold', { sid })
        if (!registered) {
          try {
            const list = Array.isArray(rep) ? rep : []
            list.push(sid)
            localStorage.setItem('hl-replication-sessions', JSON.stringify(list.slice(-50)))
          } catch { /* 非致命 */ }
        }
        return
      }
      if (!registered && justEnteredReplication) {
        diag('session-switched-adopt', { sid })
        try {
          const list = Array.isArray(rep) ? rep : []
          list.push(sid)
          localStorage.setItem('hl-replication-sessions', JSON.stringify(list.slice(-50)))
        } catch { /* 非致命 */ }
      } else if (!registered) {
        try { controller.closeIn(sid as SessionId, CONSOLE_ID as TabId) } catch { /* 无 tab 时静默 */ }
        try { localStorage.removeItem('hl-console-mode') } catch { /* 忽略 */ }
        window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: '' } }))
      }
      if (!inBootWindow('session-switched')) ensureReplicationConsole(sid, 'session-switched')
    }

    const handle = createSidebarRightStore(() => defaultSeed(tabs))
    // Each Session Context generation owns one Store. Background tab actions
    // use the latest adoption for that Session.
    const adoptions = new Map<SessionId, () => void>()
    const store: typeof handle = {
      ...handle,
      create: (scopeKey) => {
        const instance = handle.create(scopeKey)
        if (scopeKey !== undefined) {
          // HeightLab V24b 二修（V28 复核升级）：复刻模式下新会话 surface 就绪
          // （store 采用）即自动打开创作工作台——挂在「store 采用」这个精确
          // 时机上，且走幂等重试（V26c 教训：openTab 在 surface 未挂载时抛错
          // 被吞，单发延迟不可靠）。seed 已带首 tab，本开启是双保险——但
          // 双保险自己必须可靠（宪法铁律 17）。
          //
          // 2026-10-23：加时效约束。`hl-console-mode` 是个**跨会话的全局开关**，
          // 用户上一次创作结束后它可能一直留着 'replication'；此时哪怕新开
          // 一个跟视频无关的会话，也会因为读到这个陈旧值而自动弹创作台。
          // 只在「刚进过复刻模式」的短窗口内认它（由 setReplicationMode 写入
          // 时间戳），窗口外视为过期。
          if (localStorage.getItem('hl-console-mode') === 'replication'
            && replicationModeFresh()) {
            openConsoleRetrying(false)
          }
          // HeightLab V29 + V48 启动门禁：切入会话的复刻带回挂在本时机；
          // 但启动 3 秒内的 store-create 属被动恢复，不弹工作台。
          if (!inBootWindow('store-create')) ensureReplicationConsole(String(scopeKey), 'store-create')
          const sessionId = scopeKey as SessionId
          adoptions.get(sessionId)?.()
          adoptions.set(sessionId, adopt(sessionId, instance))
        }
        return { ...instance, clearPersisted() {
          instance.clearPersisted()
          if (scopeKey !== undefined) forget(scopeKey as SessionId)
        } }
      },
    }
    const onOpenConsole = (): void => { openConsoleRetrying(false) }
    // HeightLab V40：模板工作台——首页模板卡点击（hl:open-template-console）
    // 打开创作控制台 tab；ConsoleBody 按 detail.skill 的 schema 渲染模板面板。
    const onOpenTemplateConsole = (): void => { openConsoleRetrying(true) }
    const onModeCleared = (event: Event): void => {
      if ((event as CustomEvent<{ mode?: unknown }>).detail?.mode === '') onCloseConsole()
    }
    window.addEventListener('hl:open-console', onOpenConsole)
    window.addEventListener('hl:open-template-console', onOpenTemplateConsole)
    window.addEventListener('hl:close-console', onCloseConsole)
    window.addEventListener('hl:mode-change', onModeCleared)
    window.addEventListener('hl:start-replication', onStartReplication)
    window.addEventListener('hl:session-switched', onSessionSwitched)
    const injected: Omit<SidebarRightInjected, 'keyedHooks' | 'occurrence' | 'closeTab' | 'measureRoom'> = {
      syncPresentation({ shown, track, fullscreen }) {
        if (shown) { layout.openRightbar(track, fullscreen); return }
        /* 2026-10-26（A1 最后一环）：会话切换时旧 seat 卸载的清理 effect 会
         * 无条件上报 shown:false → 收起栏体。无头实测复刻流程时间线：创作台
         * 展开（+230ms）→ 旧会话迟到广播（+3.8s）→ 17ms 后栏体收起——就是
         * 卸载清理在复刻新会话的 seat 尚未稳定时抢先收栏。复刻模式鲜活期
         * （replicationModeFresh，同 10 分钟口径）忽略 shown:false：只影响
         * "自动收起"，用户手动关闭走 closeIn/toggleExpanded 不同路，不受限。 */
        if (replicationModeFresh()) {
          diag('sync-presentation-hold', { shown })
          return
        }
        layout.closeRightbar()
      },
      reportAutoFullscreen: (value) => { autoFullscreen = value },
      splitPane: (paneId) => { controller.split(paneId) },
      toggleFullscreen: () => { const target = controller.commandTarget(); if (target !== undefined) controller.toggleFullscreen(target) },
      openTab: (kind, options) => { controller.openTab(kind, options) },
      hooks: {
        shortcuts: ctx.shortcuts.catalog,
        tabTypes: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.entries() },
      },
    }

    const disposeTypes = [tabs.register(guideDefinition(t))]
    const disposeSeat = ctx.slots.inject('rightbar', function* () {
      yield ctx.slots.register({
        name: 'rightbar',
        children: { 'rightbar.session': { kind: 'single', scope: 'session' } },
        inject: (): RightbarRootInjected => ({
          hooks: { views: views.source },
          mountView: reference => views.mount(reference),
        }),
      }, RightbarRoot)
      yield ctx.slots.register({
        name: 'rightbar.session',
        locale: NS,
        children: {
          'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
          'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
          'sidebar.right.tab.menu.item': { kind: 'list', scope: 'session' },
        },
        store,
        inject: (sessionId): SidebarRightInjected => ({
          ...injected,
          measureRoom: (canSplitPane) => { measure(sessionId, canSplitPane) },
          closeTab: (tabId) => {
            try { controller.closeIn(sessionId, tabId) }
            catch (error) { console.error('Sidebar tab close failed:', error) }
          },
          keyedHooks: { tabNavigation: key => controller.tabDomain.occurrence(sessionId, { id: key as TabId }).navigation },
          occurrence: tab => controller.tabDomain.occurrence(sessionId, tab),
        }),
      }, RightbarSeat)
    })
    // The expand button shares the panel's store: it only needs to know whether
    // the panel is expanded, and to ask for it to be. The header's corner seat
    // is its own place, past the utilities, so showing and hiding it moves
    // nothing else in the row.
    const disposeExpand = ctx.slots.inject('conversation.session.header.corner', () => ctx.slots.register({
      name: 'conversation.session.header.corner',
      locale: NS,
      store,
      inject: () => ({ hooks: { shortcuts: ctx.shortcuts.catalog } }),
    }, ExpandButton))
    // Stage two for the guide: it declares the chain child it hosts and reads
    // the registry's entry boxes, which an ordinary type has no reason to do.
    const guideInjected: GuideInjected = {
      hooks: {
        shortcuts: ctx.shortcuts.catalog,
        guideEntries: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.guide() },
      },
    }
    const disposeGuide = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: GUIDE_ID,
      children: {
        'sidebar.right.tab.guide.entry': {
          kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: guideTabInfoFactory } },
        },
        'sidebar.right.tab.guide': {
          kind: 'chain', scope: 'session', inject: { hooks: { tabInfo: guideTabInfoFactory } },
        },
      },
      inject: () => guideInjected,
    }, GuideBody))
    const disposeGuideTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
      { name: 'sidebar.right.pane.tab.title', key: GUIDE_ID },
      GuideTitle,
    ))
    return () => {
      disposeGuideTitle()
      disposeGuide()
      disposeExpand()
      disposeSeat()
      window.removeEventListener('hl:open-console', onOpenConsole)
      window.removeEventListener('hl:close-console', onCloseConsole)
      window.removeEventListener('hl:mode-change', onModeCleared)
      window.removeEventListener('hl:start-replication', onStartReplication)
      window.removeEventListener('hl:session-switched', onSessionSwitched)
      window.removeEventListener('hl:open-template-console', onOpenTemplateConsole)
      disposeConsoleTitle()
      disposeConsoleBody()
      for (const dispose of disposeConsoleTypes) dispose()
      for (const dispose of disposeTypes.reverse()) dispose()
      for (const release of adoptions.values()) release()
      adoptions.clear()
    }
  }, 'ui-sidebar-right: seats and shipped tab type')
}
