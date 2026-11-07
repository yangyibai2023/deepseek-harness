/**
 * Workspace plugin, browser half. Two registrations: WorkspaceBrowser fills
 * the sidebar shell's `sidebar.workspaces` hole (the whole browsing region),
 * and WorkspacePicker fills the conversation hero's picker hole
 * (`conversation.hero.workspace` — both hero forms). Both read real Host
 * Workspaces through the global useWorkspaces hook, and each declares its
 * own `single` directory-flow child hole for the composed picker package's
 * client half. WorkspaceBrowser additionally declares the two Session row
 * action lists, and this apply registers the shipped actions — pin, rename,
 * fork, archive — into them the way any client plugin would, each with its
 * own behavior, plus the rename dialog and the row-action notice into
 * `shell.overlay` (see the contract module doc). It also declares two
 * Session-row seats: the leading decoration a row renders only while its own
 * primary state is idle, and the section the row's hover card renders between
 * its relative time and its trailing status line. Export discipline:
 * packages/client/AGENTS.md.
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions, SessionForkError } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  IWorkspaces, SessionActivity, WorkspaceArchiveError, WorkspaceSnapshot,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the Controller service merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the Session root standard-hook merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import {
  type ArchiveSessionInjected, type ForkSessionInjected, menuOpenStateFactory, type PinSessionInjected,
  type SessionArchiveConfirmInjected, type SessionArchiveConfirmRequest,
  type RenameSessionInjected, type RowToast, type RowToastInjected, type RowToastState, type SessionRenameDialogInjected,
  type WorkspaceBrowserInjected, type WorkspacePickerInjected,
} from './contract/slots.ts'
import { createWorkspaceShortcutControls, installWorkspaceShortcuts } from './shortcuts.ts'
import { UiWorkspaceService } from './navigation.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { ArchiveSessionMenuItem, ArchiveSessionRowButton, SessionArchiveConfirmDialog } from './session-actions/ArchiveSession.tsx'
import { derive } from './session-actions/derived.ts'
import { ForkSessionMenuItem } from './session-actions/ForkSession.tsx'
import { PinSessionMenuItem, PinSessionRowButton } from './session-actions/PinSession.tsx'
import { RenameSessionMenuItem, SessionRenameDialog } from './session-actions/RenameSession.tsx'
import { RowActionToast } from './session-actions/RowActionToast.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { en, zh, type WorkspaceKey } from './locales.ts'

export type { StartSessionOptions, UiWorkspace } from './navigation.ts'
export type {
  DirectoryFlowOwnerProps, DirectoryFlowSlotName, DirectoryPickingHooks, DirectoryPickingInjected,
  MenuOpenState, RowToast, SessionRenameTarget, SessionRowOwnerProps, UseMenuOpenState, WorkspaceBrowserInjected,
  SessionRowScheduleOwnerProps,
  WorkspaceBrowserProps,
  WorkspacePickerInjected, WorkspacePickerProps,
} from './contract/slots.ts'
export type { WorkspaceKey } from './locales.ts'
// HeightLab（2026-10-18）：个人/团队融合开关的读写与团队工作区 id，供设置页
// （ui-settings-general 的 FusionRow）与工作区列表共用同一份状态。
export { FUSION_EVENT, readFusion, writeFusion, teamWorkspaceId } from './fusion.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    /** Selector hook over the pure Workspace Controller snapshot. */
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  }

  interface LocaleNamespaceMap {
    /** The workspace browsing region and pick/create flow copy. */
    workspace: WorkspaceKey
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    workspaceOperation: unknown
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workspace'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * the ui-sidebar / ui-conversation applies, whose activation order relative
 * to this one is NOT constrained: dsh.client.inject edges are informational
 * (loading/prefetch metadata, never apply sequencing) and neither owner
 * provides a waitable service. apply therefore depends on each slot
 * declaration through `slots.inject()` instead of assuming order.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker', 'layout', 'shortcuts',
]

/**
 * Register the browser and picker once their slot declarations are on the
 * ledger. Inject factories return plain callbacks; data reads use the
 * framework's global hooks.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  // One viewing-store instance, created here as ui-layout does for its layout
  // store: the browser declares the handle, and the UiWorkspace service writes
  // view order through the same instance the renderer hands the browser.
  const viewHandle = createWorkspaceViewStore()
  const viewInstance = viewHandle.create()
  const viewStore: typeof viewHandle = { ...viewHandle, create: () => viewInstance }
  const rowToast = createSnapshotStore<RowToastState | null>(null)
  let toastSeq = 0
  const notify = (toast: RowToast): void => { rowToast.set({ ...toast, seq: ++toastSeq }) }
  const uiWorkspace = new UiWorkspaceService(
    ctx, ctx.remote.directoryPicker, workspaces, sessions, viewInstance.actions, notify,
  )
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')

  // ── HeightLab 回植（2026-10-14，自 da30b40951；0.2.1 合并曾丢弃）──────
  /* 创作入口（爆款复刻 hl:start-replication / 模块创作台 hl:start-module）共用的
   * 目标工作区解析。0.2.1 适配：SessionListState 不再有 current——按工作区解析。
   * 2026-11-08（用户实测「从已有对话里点复刻毫无反应，左栏还停在旧对话，右栏
   * 是上次残留的控制台」）：原 fallback 只用 workspace.sessionIds ∩ sessions.byId
   * 交集——该索引已被本文件实测证实不可靠（工作区 sessionIds 漏登记当前会话；
   * 个人工作区同样会出现交集全空）。交集空 => target undefined => **静默 return**
   * => 不建会话不导航。改三级解析 + 每级留痕（/hl/boot-marker 诊断通道）：
   *   ① sessionIds ∩ byId（原法；索引健康时最准）
   *   ② cwd 匹配（byId 摘要 cwd == 工作区 path；与 reuseOrCreateBlank 的空白
   *     会话判定同源，不依赖 sessionIds 索引）
   *   ③ 第一个工作区兜底（个人模式恒为「我的工作区」） */
  const resolveStudioWorkspace = (
    detailWorkspaceId: string | undefined, source: string,
  ): WorkspaceId | undefined => {
    const sessionList = sessions.list.getSnapshot()
    const wsItems = workspaces.list.getSnapshot().items
    const byId = sessionList.byId
    const diag = (stage: string, extra: Record<string, unknown>): void => {
      try {
        void fetch('/hl/boot-marker', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hlStudioEntry: true, source, stage, ...extra }),
        }).catch(() => { /* 诊断失败不影响主流程 */ })
      } catch { /* 非致命 */ }
    }
    const intersectHit = wsItems.find(item => item.sessionIds.some(id => byId[id] !== undefined))
    const cwdHit = intersectHit === undefined
      ? wsItems.find(item => Object.values(byId).some(s => s !== undefined && s.cwd === item.path))
      : undefined
    const fallbackItem = intersectHit ?? cwdHit ?? wsItems[0]
    const target = (detailWorkspaceId ?? fallbackItem?.workspaceId) as WorkspaceId | undefined
    if (target === undefined) {
      diag('no-workspace', { wsCount: wsItems.length, sessionCount: Object.keys(byId).length })
      return undefined
    }
    if (detailWorkspaceId === undefined && intersectHit === undefined) {
      diag('fallback-resolved', {
        via: cwdHit !== undefined ? 'cwd' : 'first-item',
        wsCount: wsItems.length,
      })
    }
    return target
  }

  /* 创作秒开预热（2026-11-08 用户实测「点开很慢/没反应」）：创作入口
   * （复刻/模块）点击时 connectBlank(reuse=true) 会优先复用空白会话——有
   * 空白可复用是毫秒级，没有就要现场建会话（秒级，用户感知为卡/无反应）。
   * 这里保证个人工作区**常备 1 个空白会话**：启动后预热 + 每次创作进入
   * 消耗后后台补建，点击永远走 adoption 快路径。 */
  const ensureSpareBlank = (): void => {
    void (async () => {
      try {
        const sessionList = sessions.list.getSnapshot()
        const wsItems = workspaces.list.getSnapshot().items
        const byId = sessionList.byId
        const ws = wsItems.find(item => Object.values(byId).some(sv => sv !== undefined && sv.cwd === item.path)) ?? wsItems[0]
        if (ws === undefined) return
        const archived = workspaces.list.getSnapshot().archivedSessionIds ?? []
        const hasBlank = sessionList.ids.some((id) => {
          const sv = byId[id]
          return sv !== undefined && sv.blank && sv.cwd === ws.path
            && ws.sessionIds.includes(id) && !(archived as readonly string[]).includes(id)
        })
        if (!hasBlank) await uiWorkspace.connectWorkspace(ws.workspaceId)
      } catch { /* 预热失败静默：点击时仍可现场创建（慢路径兜底） */ }
    })()
  }
  // 启动预热：8s/20s/35s 三次尝试（等工作区/会话列表就绪）。
  for (const delay of [8_000, 20_000, 35_000]) {
    setTimeout(() => { if (typeof window !== 'undefined') ensureSpareBlank() }, delay)
  }

  // HeightLab V26e-b：视频创作一级页「爆款复刻」（hl:start-replication）——
  // 新建会话并在导航打开前设置复刻模式标记 + 广播会话就绪（右栏展开消费）。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    const onStart = (event: Event): void => {
      /* detail 空 defensively：卡片派发的 CustomEvent 不带 detail（spec 默认
       * null），直接读 .workspaceId 会 TypeError 使整个入口静默崩溃——
       * 2026-11-08 实锤「复刻点击毫无反应、模块却正常」的根因（模块入口
       * 写了 ?? {} 而这里漏了）。 */
      const detail = (event as CustomEvent<{ workspaceId?: unknown }>).detail ?? {}
      const detailWorkspaceId = typeof detail.workspaceId === 'string' ? detail.workspaceId : undefined
      const target = resolveStudioWorkspace(detailWorkspaceId, 'replication')
      if (target === undefined) return
      void uiWorkspace.openWorkspace(target, (sessionId) => {
        try {
          localStorage.setItem('hl-console-mode', 'replication')
          // 时间戳供侧栏判定"这次复刻模式是不是当前的"（2026-10-23）。
          // 没有它时旧值会被当成过期，见 ui-sidebar-right 的
          // replicationModeFresh。
          localStorage.setItem('hl-console-mode-at', String(Date.now()))
        } catch { /* 非致命 */ }
        // HeightLab V29：恢复旧监听的完整职责——EmptyHero/ConversationContent/
        // TemplateDock 三处复刻判定都靠 hl:mode-change 事件刷新（左侧引导
        // 选项区+输入框贴底）。
        window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: 'replication' } }))
        window.dispatchEvent(new CustomEvent('hl:replication-session-open', { detail: { sessionId } }))
        // 本次进入消耗了预热空白——2.5s 后（导航稳定）后台补建。
        window.setTimeout(() => { ensureSpareBlank() }, 2_500)
      }).catch((reason: unknown) => {
        console.warn('replication session failed:', reason)
      })
    }
    window.addEventListener('hl:start-replication', onStart)
    return () => { window.removeEventListener('hl:start-replication', onStart) }
  }, 'ui-workspace: replication entry')

  // HeightLab 0.5.7 模块创作台（2026-11-08 用户拍板「一个功能驾驭多个模板」）：
  // 视频创作一级页其余七模块（hl:start-module）——与爆款复刻共用「新建会话 +
  // 创作模式标记 + 右栏消费」链路，模式值='module'；模板集由入口侧（HubPage，
  // 与模板目录同包）算好随 detail 传入，写 sessionStorage('hl-module-console')
  // 供 ConsoleBody 渲染模板选择网格。左栏=全新空白会话（默认引导页）。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    interface StudioModuleTemplate {
      id: string
      name: string
      tagline: string
      cover: string
      coverFallback?: string
      skill: string
    }
    const onStartModule = (event: Event): void => {
      const detail = (event as CustomEvent<{
        moduleId?: unknown
        name?: unknown
        desc?: unknown
        icon?: unknown
        templates?: unknown
        workspaceId?: unknown
      }>).detail ?? {}
      const moduleId = typeof detail.moduleId === 'string' ? detail.moduleId : ''
      if (moduleId === '') return
      const templates: StudioModuleTemplate[] = Array.isArray(detail.templates)
        ? (detail.templates as unknown[]).filter((t): t is StudioModuleTemplate =>
          typeof t === 'object' && t !== null
            && typeof (t as { id?: unknown }).id === 'string'
            && typeof (t as { skill?: unknown }).skill === 'string')
        : []
      const moduleState = {
        moduleId,
        name: typeof detail.name === 'string' ? detail.name : moduleId,
        desc: typeof detail.desc === 'string' ? detail.desc : '',
        icon: typeof detail.icon === 'string' ? detail.icon : '🎬',
        templates,
      }
      const target = resolveStudioWorkspace(
        typeof detail.workspaceId === 'string' ? detail.workspaceId : undefined, 'module',
      )
      if (target === undefined) return
      void uiWorkspace.openWorkspace(target, (sessionId) => {
        try {
          localStorage.setItem('hl-console-mode', 'module')
          localStorage.setItem('hl-console-mode-at', String(Date.now()))
        } catch { /* 非致命 */ }
        try { sessionStorage.setItem('hl-module-console', JSON.stringify(moduleState)) } catch { /* 非致命 */ }
        window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: 'module' } }))
        window.dispatchEvent(new CustomEvent('hl:replication-session-open', { detail: { sessionId } }))
        window.setTimeout(() => { ensureSpareBlank() }, 2_500)
      }).catch((reason: unknown) => {
        console.warn('module session failed:', reason)
      })
    }
    window.addEventListener('hl:start-module', onStartModule)
    return () => { window.removeEventListener('hl:start-module', onStartModule) }
  }, 'ui-workspace: module entry')

  // HeightLab 定制：全新环境自动完成首次初始化——没有工作区时自动创建
  // 「~/HeightLab」工作区；没有会话时自动开始一个新会话。直接进入产品
  // 输入框状态，而不是 DSH 原生“选择工作区”空状态。0.2.1 适配：
  // SessionListState 无 current，以「列表为空」判定未初始化（轮询内幂等）。
  ctx.effect(() => {
    let attempts = 0
    let timer = 0
    const debug = (payload: Record<string, unknown>): void => {
      try {
        void fetch('/hl/boot-marker', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hlAutoStart: true, ...payload }),
        }).catch(() => { /* 非致命 */ })
      } catch {
        // 非致命
      }
    }
    const hasSession = (): boolean => sessions.list.getSnapshot().ids.length > 0
    const tryAutoStart = async (): Promise<void> => {
      if (attempts >= 15) return
      // 未登录（登录门 out/未判定）绝不自动开会话——否则登录页背后会
      // 反复建会话（hlAutoStart enter 循环）。登录成功后轮询接管。
      if (document.body.dataset.hlAuth !== 'in') return
      attempts += 1
      try {
        let workspaceList = workspaces.list.getSnapshot()
        debug({ at: 'enter', attempts, wsCount: workspaceList.items.length })
        if (hasSession()) return
        let workspaceId = workspaceList.items[0]?.workspaceId
        if (workspaceId === undefined && workspaceList.items.length === 0) {
          // 兜底：初始化脚本没种成功时，客户端自己建默认工作区。
          const listingResult = await ctx.remote.directoryPicker.list(undefined, new AbortController().signal)
          if (!listingResult.ok) throw new Error(listingResult.error.message)
          const listing = listingResult.value
          let dir = ''
          try {
            const created2 = await ctx.remote.directoryPicker.createDirectory(listing.home, 'HeightLab')
            if (!created2.ok) throw new Error(created2.error.message)
            dir = created2.value
          } catch {
            dir = `${listing.home.replace(/\/+$/, '')}/HeightLab`
          }
          const created = await workspaces.create({ path: dir })
          workspaceId = created.workspaceId
          try {
            await workspaces.rename(workspaceId, '我的工作区')
          } catch {
            // 重命名失败不阻塞。
          }
          workspaceList = workspaces.list.getSnapshot()
        }
        workspaceId = workspaceId ?? workspaceList.items[0]?.workspaceId
        if (workspaceId !== undefined && !hasSession()) {
          debug({ at: 'startSession', workspaceId })
          try {
            const sessionId = await uiWorkspace.connectWorkspace(workspaceId)
            debug({ at: 'connected', sessionId })
            uiWorkspace.openSession(sessionId)
            debug({ at: 'opened' })
          } catch (error) {
            debug({ at: 'connectError', message: error instanceof Error ? error.message : String(error) })
          }
        }
      } catch (error) {
        debug({ at: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
    const run = (): void => {
      void tryAutoStart().then(() => {
        if (hasSession() || attempts >= 15) {
          window.clearInterval(timer)
        }
      })
    }
    if (typeof window === 'undefined') return () => {}
    run()
    timer = window.setInterval(run, 2000)
    return () => {
      window.clearInterval(timer)
    }
  }, 'ui-workspace: auto-start first session')

  // ── HeightLab（2026-10-18 用户铁律）个人/团队工作区隔离 ─────────────────────
  // 「个人」= 经典 Agent，会话必须落在官方默认工作区（我的工作区）；
  // 「团队」= ds-bot，会话只能在 ds-bot 自己的团队工作区（显示名统一「团队」）。
  // 两条硬规定：①切回个人绝不留在团队目录；②团队工作区名必须与顶部切换一致。
  // ds-bot 的工作区 id 以它自己的 /api/bot state 为准（权威），不靠猜标题。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    let renaming = false
    const dsBotWorkspaceId = async (): Promise<string | undefined> => {
      try {
        const res = await fetch('/api/bot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: 'state', payload: {} }),
        })
        if (!res.ok) return undefined
        const data = await res.json() as { ok?: boolean; value?: { workspaceId?: unknown } }
        return data.ok === true && typeof data.value?.workspaceId === 'string'
          ? data.value.workspaceId
          : undefined
      } catch {
        return undefined
      }
    }
    // 团队工作区显示名统一为「团队」：它默认建出来叫「DS Bot」，是历史遗留。
    const renameTeamWorkspace = async (workspaceId: string): Promise<void> => {
      if (renaming) return
      const current = workspaces.list.getSnapshot().items
        .find(item => item.workspaceId === workspaceId)
      if (current === undefined || current.title === '团队') return
      renaming = true
      try {
        await workspaces.rename(workspaceId as Parameters<typeof workspaces.rename>[0], '团队')
      } catch {
        // 重命名失败不阻塞切换，下次启动会再试。
      } finally {
        renaming = false
      }
    }
    const pickPersonalWorkspace = (): string | undefined => {
      const items = workspaces.list.getSnapshot().items
      // 官方默认工作区标题即「我的工作区」；用户改过名则退回路径末段 HeightLab。
      return items.find(item => item.title === '我的工作区')?.workspaceId
        ?? items.find(item => /[\\/]HeightLab$/i.test(item.path))?.workspaceId
    }
    /* 2026-11-03 诊断埋点（问题定位后撤除）：把判定依据落宿主日志，
     * 用来区分「索引命中 / cwd 命中 / 查不到」三种情况，避免再靠猜。
     * 必须定义在 sync 之前——sync 的第一个分支就要用它。 */
    const diagSync = (stage: string, extra: Record<string, unknown>): void => {
      try {
        void fetch('/hl/boot-marker', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hlSync: true, stage, ...extra }),
        }).catch(() => { /* 非致命 */ })
      } catch { /* 非致命 */ }
    }
    const sync = async (intent?: 'team' | 'personal'): Promise<void> => {
      // 点击切换时以事件意图为准（此刻 ds-bot 的 localStorage 可能还没写入）；
      // 轮询时退回读实际 surface。
      const surface = intent ?? (() => {
        try { return localStorage.getItem('ds-bot:surface') } catch { return null }
      })()
      /* 2026-11-03（0.5.3 用户实测「团队模式聊天区一直闪 + 一直向上滑」根治）：
       *
       * 5s 轮询分支**绝不允许导航或建会话**。
       *
       * 实测证据：团队工作区 8400e2d5 的 sessionIds 只有 3 个，而用户正在看的
       * 历史会话 4599639a（cwd = bot/workspace，确属团队区）不在索引里；
       * sessions.list 快照的 byId 也没有它（诊断埋点实测 cwd:null）。
       * 于是每 5s 轮询都判定「不在团队工作区」→ connectWorkspace →
       * 找不到可复用 blank → sessions.create() → openSession → 会话视图重挂载
       * → ds-bot 聊天滚到底。宿主日志实证 store-create 在 4599639a ↔ 7f963ef7
       * 乒乓 24 轮，用户看到的就是「一直闪、一直往上滑」。
       *
       * 结论：定时器不能产生副作用。轮询只做无副作用的事实发布（团队工作区
       * id），导航一律只由用户显式操作（intent 存在）驱动。
       * 代价：用户若用 ds-bot 自带的切换按钮换 surface，工作区不跟随——
       * 高亮仍由 hl-mode 的 600ms 轮询同步，点一次顶部切换即可归位。
       * 这远好于每 5 秒重建会话。 */
      const team = intent !== undefined ? intent === 'team' : surface === 'bot'
      // 无论当前是哪个模式，都先解析并发布团队工作区 id：个人模式的工作区列表
      // 需要它来隐藏团队行（融合开关关闭时），不能等切到团队才发布。
      /* 2026-11-04（0.5.4 回归修复，用户朋友 Mac 实测）：发布必须**广播事件**。
       * 原因：WorkspaceBrowser 的 teamId 是非响应式读取 globalThis（渲染时取
       * 一次），0.5.3 里轮询的 connectWorkspace 副作用恰好触发重渲染、掩盖了
       * 「id 发布后 UI 不知道」；轮询改为 poll-publish-only（只发布不导航）
       * 之后，UI 永远不会重算 → 个人模式下团队行永远显示（回归）。
       * 现在发布时 dispatch hl:team-workspace-id，消费方监听后 setState。 */
      {
        const resolved = await dsBotWorkspaceId()
        if (resolved !== undefined) {
          ;(globalThis as { __hlTeamWorkspaceId?: string }).__hlTeamWorkspaceId = resolved
          window.dispatchEvent(new CustomEvent('hl:team-workspace-id', { detail: { id: resolved } }))
        }
      }
      if (intent === undefined) {
        diagSync('poll-publish-only', { surface })
        return
      }
      const activeSessionId = (): SessionId | undefined => {
        try {
          const raw = localStorage.getItem('dsh.sessions.current')
          const parsed = raw === null ? undefined : JSON.parse(raw) as { sessionId?: unknown }
          return typeof parsed?.sessionId === 'string' ? parsed.sessionId as SessionId : undefined
        } catch {
          return undefined
        }
      }
      /* 2026-11-03（0.5.3 用户实测双 bug 根因）：判断「当前会话是否属于某工作区」
       * 不能只用 workspace.sessionIds.includes()。
       *
       * 实测数据：团队工作区 8400e2d5 的 sessionIds = [7f963ef7, e5084636, 72732f56]，
       * 而用户正在看的 Colin 会话 4599639a 的 cwd 明确是
       * ~/.heightlab/dsh-home/bot/workspace（= 团队工作区路径），却不在 sessionIds 里
       * （10-21 创建，历史数据未登记）。
       *
       * 后果（两个 bug 同源）：
       *   Bug1 团队模式：5s 轮询读到「不在团队工作区」→ connectWorkspace →
       *        找不到可复用 blank → sessions.create() 新建会话 → 会话视图重挂载
       *        → ds-bot 聊天滚到底 → 用户看到「聊天区一直闪 + 一直向上滑」。
       *        日志实证：store-create 在 4599639a ↔ 7f963ef7 之间乒乓 24 轮。
       *   Bug2 切回个人：sync('personal') 同样因 sessionIds 不含它而提前 return，
       *        永远离不开 bot 聊天，回不到个人主页。
       *
       * 修法：以 cwd（会话实际所在目录）为权威判定归属——它由会话自身记录，
       * 不会因工作区索引漏登记而失真。sessionIds 作为补充（新建未落盘时为唯一线索）。 */
      const belongsToWorkspace = (sessionId: SessionId, workspaceId: string): boolean => {
        const entry = workspaces.list.getSnapshot().items
          .find(item => item.workspaceId === workspaceId)
        if (entry === undefined) return false
        if (entry.sessionIds.includes(sessionId)) return true
        // cwd 兜底：会话记录的 cwd 落在该工作区路径下即算归属。
        const summary = sessions.list.getSnapshot().byId[sessionId]
        const cwd = summary?.cwd
        if (typeof cwd !== 'string' || cwd === '' || entry.path === '') return false
        const norm = (value: string): string => value.replace(/\/+$/, '')
        const root = norm(entry.path)
        return norm(cwd) === root || norm(cwd).startsWith(`${root}/`)
      }
      if (team) {
        const teamId = await dsBotWorkspaceId()
        /* L1-B2（0.5.7）：「桥还没挂出工作区 id」不再是静默 return——落宿主日志
         * + 安排短重试（ds-bot apply 是异步的，400ms 后桥通常就绪）。避免半程
         * 状态：顶部已切团队、会话还留在个人区，用户看到的是「点了没反应」。 */
        if (teamId === undefined) {
          try {
            void fetch('/hl/boot-marker', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ hlSync: true, stage: 'team-id-missing',
                active: activeSessionId() ?? null }),
            }).catch(() => { /* 非致命 */ })
          } catch { /* 非致命 */ }
          window.setTimeout(() => { void sync('team') }, 400)
          return
        }
        // 发布团队工作区 id：navigation.openSession 用它判断「用户点开的是不是
        // 团队会话」——单一权威，不靠标题匹配。
        ;(globalThis as { __hlTeamWorkspaceId?: string }).__hlTeamWorkspaceId = teamId
        window.dispatchEvent(new CustomEvent('hl:team-workspace-id', { detail: { id: teamId } }))
        void renameTeamWorkspace(teamId)
        // 团队模式：会话必须落在团队工作区；当前不在就切过去（复用空白会话）。
        const teamEntry = workspaces.list.getSnapshot().items
          .find(item => item.workspaceId === teamId)
        /* L1-B2（0.5.7）：团队工作区条目未就绪同样不静默——工作区列表是异步
         * 建的，短重试一次比「点了没反应」体感好。 */
        if (teamEntry === undefined) {
          try {
            void fetch('/hl/boot-marker', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ hlSync: true, stage: 'team-entry-missing', teamId }),
            }).catch(() => { /* 非致命 */ })
          } catch { /* 非致命 */ }
          window.setTimeout(() => { void sync('team') }, 400)
          return
        }
        const active = activeSessionId()
        // 用 cwd 归属判定（见 belongsToWorkspace 注释）：历史会话可能不在
        // sessionIds 索引里，若只查索引会每 5s 重建会话导致聊天区闪烁上滑。
        if (active !== undefined && belongsToWorkspace(active, teamEntry.workspaceId)) return
        diagSync('team-renavigate', {
          active,
          teamId: teamEntry.workspaceId,
          inIds: active !== undefined ? teamEntry.sessionIds.includes(active) : null,
          cwd: active !== undefined ? (sessions.list.getSnapshot().byId[active]?.cwd ?? null) : null,
          teamPath: teamEntry.path,
          idsCount: teamEntry.sessionIds.length,
        })
        await uiWorkspace.connectWorkspace(teamEntry.workspaceId).then(
          (sessionId) => { uiWorkspace.openSession(sessionId) },
          () => { /* 创建失败交给宿主提示 */ },
        )
        return
      }
      // 个人模式：绝不停在团队工作区（用户铁律，无条件执行）。
      // 2026-11-03（Bug2：用户实测「切回个人应回主页，却停在和 bot 的聊天」）：
      // 原实现要求「当前会话证明属于团队区」才导航，但历史团队会话既不在
      // teamEntry.sessionIds 索引里、sessions.list 快照也没有它（实测 cwd:null），
      // 判定为假 → 直接 return → 永远离不开 bot 聊天。
      // 改为正向判据：只要当前会话**不在个人工作区**，就回到个人主页（我的工作区）。
      // 反方向判定不需要「证明属于团队」，因此对脏索引免疫。
      const personal = pickPersonalWorkspace()
      /* L1-B2（0.5.7）：个人工作区未就绪不静默——同样短重试一次。 */
      if (personal === undefined) {
        try {
          void fetch('/hl/boot-marker', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ hlSync: true, stage: 'personal-entry-missing' }),
          }).catch(() => { /* 非致命 */ })
        } catch { /* 非致命 */ }
        window.setTimeout(() => { void sync('personal') }, 400)
        return
      }
      const activeId = activeSessionId()
      if (activeId !== undefined && belongsToWorkspace(activeId, personal)) {
        diagSync('personal-already', { active: activeId })
        return
      }
      diagSync('personal-navigate', { active: activeId ?? null, personal })
      await uiWorkspace.connectWorkspace(personal as never).then(
        (sessionId) => { uiWorkspace.openSession(sessionId) },
        () => { /* 失败不阻塞 */ },
      )
    }
    const onModeChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ mode?: unknown }>).detail
      void sync(detail.mode === 'enterprise' ? 'team' : 'personal')
    }
    // 用户点了团队工作区里的某个会话（navigation.openSession 派发）：把 surface
    // 切到团队页。切换走 hl-mode 的桥接（点 ds-bot 官方按钮），surface 变更后
    // 本 effect 的轮询会把高亮同步，不需要在这里重复做工作区校验。
    const onTeamSessionOpened = (): void => {
      window.dispatchEvent(new CustomEvent('hl:request-team-surface'))
    }
    window.addEventListener('hl:mode-changed', onModeChanged)
    window.addEventListener('hl:team-session-opened', onTeamSessionOpened)
    // 启动时跑一次：把历史遗留的「DS Bot」工作区名纠正为「团队」。
    void sync()
    const timer = window.setInterval(() => { void sync() }, 5000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('hl:mode-changed', onModeChanged)
      window.removeEventListener('hl:team-session-opened', onTeamSessionOpened)
    }
  }, 'ui-workspace: HeightLab personal/team workspace isolation')
  const shortcutControls = createWorkspaceShortcutControls()

  const searchSessions: WorkspaceBrowserInjected['searchSessions'] = async (query, signal) => {
    const result = await sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  // Stable per-surface occupancy sources (the renderer's hook cache keys by
  // source identity): true while the surface's directory-flow hole is filled.
  const flowSource = (hole: 'sidebar.workspaces.directoryFlow' | 'conversation.hero.workspace.directoryFlow'): HostObservable<boolean> => ({
    getSnapshot: () => ctx.slots.entries(hole).length > 0,
    subscribe: listener => ctx.slots.subscribe(hole, listener),
  })
  const browserFlowSource = flowSource('sidebar.workspaces.directoryFlow')
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }
  const pickerFlowSource = flowSource('conversation.hero.workspace.directoryFlow')
  const openSession: WorkspaceBrowserInjected['open'] = (sessionId) => {
    uiWorkspace.openSession(sessionId)
  }
  // Registry-global sets as Sets, rebuilt only when the Workspace snapshot changes.
  const pinnedSet = derive(workspaces.list, snapshot => new Set<SessionId>(snapshot.pinnedSessionIds))
  const archivedSet = derive(workspaces.list, snapshot => new Set<SessionId>(snapshot.archivedSessionIds))
  // Plugin-private facts the row actions and their overlay surfaces share:
  // the pending rename request and the notice on display. Each business
  // writes through its own injected callback and the surface reads through
  // its bound hook.
  const renameRequest = derive(shortcutControls.state, state => state.renameTarget)
  const archiveRequest = createSnapshotStore<SessionArchiveConfirmRequest | null>(null)
  const requestSessionRename = shortcutControls.rename
  const unarchiveSession = (sessionId: SessionId): void => {
    uiWorkspace.unarchiveSession(sessionId).catch((reason: unknown) => {
      console.warn('session unarchive rejected:', reason)
    })
  }
  const renameSession: SessionRenameDialogInjected['renameSession'] = async (sessionId, title) => {
    const result = await sessions.using(
      sessionId,
      { source: 'workspaceOperation' },
      reference => reference.binding.session.rename(title),
    )
    if (!result.ok) throw new Error(result.error.message)
  }
  const pinInjected = (): PinSessionInjected => ({
    hooks: { pinned: pinnedSet, archived: archivedSet },
    // Pin failures surface as a notice: nothing else on the surface moves, so
    // a silent failure would read as a dead action.
    pinSession: (sessionId) => {
      uiWorkspace.pinSession(sessionId).catch(() => { notify({ kind: 'pinFailed' }) })
    },
    unpinSession: (sessionId) => {
      uiWorkspace.unpinSession(sessionId).catch(() => { notify({ kind: 'unpinFailed' }) })
    },
  })
  const archiveInjected = (): ArchiveSessionInjected => ({
    hooks: { archived: archivedSet },
    // Archive preserves the log and the account position, so a quiet Session
    // needs no confirmation; the notice offers undo and the archived filter.
    // The Host's refusal for running work is the one case that asks first:
    // the confirmation names that work and offers to stop it.
    archiveSession: (sessionId) => {
      uiWorkspace.archiveSession(sessionId).then(() => {
        notify({ kind: 'archived', sessionId })
      }).catch((reason: unknown) => {
        const activity = activeSessionRefusal(reason)
        if (activity === undefined) {
          console.warn('session archive rejected:', reason)
          return
        }
        const displayTitle = sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId
        archiveRequest.set({ sessionId, displayTitle, activity })
      })
    },
    unarchiveSession,
  })
  installWorkspaceShortcuts(ctx, uiWorkspace, shortcutControls, archiveInjected().archiveSession)
  const archiveConfirmInjected = (): SessionArchiveConfirmInjected => ({
    hooks: { archiveRequest },
    settleSessionArchive: () => { archiveRequest.set(null) },
    stopAndArchiveSession: async (sessionId) => {
      await uiWorkspace.archiveSession(sessionId, { stopActivity: true })
      notify({ kind: 'stoppedAndArchived', sessionId })
    },
  })
  const forkInjected = (): ForkSessionInjected => ({
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId, (childId) => {
        ctx.get('productAnalytics')?.track('branch_session_click', { session_id: childId, parent_session_id: sessionId, click_position: 'sidebar' })
      }, { allowMigration: false }).catch((error: unknown) => {
        if (error instanceof Error && error.name === 'SessionForkError'
          && (error as SessionForkError).rpcError.code === 'session/migration-required') {
          notify({ kind: 'forkRequiresOpen', sessionId })
        }
      })
    },
  })
  const renameInjected = (): RenameSessionInjected => ({ requestSessionRename })
  const renameDialogInjected = (): SessionRenameDialogInjected => ({
    hooks: { renameRequest },
    settleSessionRename: shortcutControls.closeRename,
    renameSession,
  })
  const rowToastInjected = (): RowToastInjected => ({
    hooks: { toast: rowToast },
    dismissToast: () => { rowToast.set(null) },
    undoArchive: unarchiveSession,
    showArchived: () => { viewInstance.actions.setArchivedFilter('show') },
    openForkSource: (sessionId) => {
      if (workspaces.list.getSnapshot().archivedSessionIds.includes(sessionId)) {
        notify({ kind: 'archivedNotOpenable' })
        return
      }
      openSession(sessionId)
    },
  })
  const browserInjected = (): WorkspaceBrowserInjected => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback.
    // HeightLab V26e：视频创作入口「爆款复刻」——新建会话并在其导航打开前
    // 设置复刻模式标记（seed 于 tab 创建时同步读取）+ 广播会话就绪（右栏
    // 展开消费）。不用 openSession 后补打开，零时序竞态。
    startReplicationSession: (workspaceId) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hl:close-hub'))
        window.dispatchEvent(new CustomEvent('hl:close-automation'))
      }
      // workspaceId 可选（继承最近工作区），openWorkspace 需非空——
      // 解析逻辑与 navigation.startSession 一致（显式 → 最近 → clear）。
      // （2026-10-14 0.2.1 适配：SessionListState 不再有 current；
      // recentWorkspace 为 navigation 内部函数未导出，此处以「含已有会话的
      // 第一个工作区」近似，复刻入口恒有 HeightLab 工作区，实际不受影响。）
      const snap = workspaces.list.getSnapshot()
      const sessionsSnap = sessions.list.getSnapshot()
      const recent = snap.items.find(item => item.sessionIds.some(id => sessionsSnap.byId[id] !== undefined))?.workspaceId
      const resolved = workspaceId ?? recent
      if (resolved === undefined) {
        // 与 navigation.startSession 的 target===undefined 分支同语义：清空主区回新会话页。
        uiWorkspace.startSession(undefined, undefined)
        return
      }
      void uiWorkspace.openWorkspace(resolved, (sessionId) => {
        try {
          localStorage.setItem('hl-console-mode', 'replication')
          localStorage.setItem('hl-console-mode-at', String(Date.now()))
        } catch { /* 存储不可用时跳过 */ }
        window.dispatchEvent(new CustomEvent('hl:replication-session-open', { detail: { sessionId } }))
      })
    },
    startSession: (workspaceId, options) => { uiWorkspace.startSession(workspaceId, options) },
    open: openSession,
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    requestSessionRename,
    notifyArchivedNotOpenable: () => { notify({ kind: 'archivedNotOpenable' }) },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    unarchiveSession: async (sessionId) => { await uiWorkspace.unarchiveSession(sessionId) },
    createWorkspace: input => workspaces.create(input),
    requestSearch: shortcutControls.search,
    requestAddWorkspace: shortcutControls.add,
    closeAddWorkspace: shortcutControls.closeAdd,
    setDirectoryBusy: shortcutControls.directoryBusy,
    dismissForkError: shortcutControls.dismissForkError,
    hooks: { directoryFlow: browserFlowSource, hostInfo, workspaceShortcuts: shortcutControls.state, shortcuts: ctx.shortcuts.catalog },
  })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource },
  })
  // Each registration declares its owned children in the same call; slot
  // injection follows both the owner and declaration HMR lifetimes.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: {
        'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
        // Every row entry reads the menu's open state through a hook bound
        // from the row's render occurrence (the owner passes the state pair
        // as hookContext).
        'sidebar.workspaces.session.menu.item': {
          kind: 'list', scope: 'root', inject: { hooks: { menuOpenState: menuOpenStateFactory, shortcuts: ctx.shortcuts.catalog } },
        },
        'sidebar.workspaces.session.row.action': { kind: 'list', scope: 'root' },
        'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
        'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
      },
      store: viewStore,
      inject: browserInjected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
  // The shipped row actions take the same route as a plugin's: `slots.inject`
  // waits for the browser registration above to declare each list, and the
  // entries leave with it. Orders step by 100 so a plugin entry can land
  // between them.
  ctx.slots.inject('sidebar.workspaces.session.menu.item', function* () {
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'pin', order: 100, locale: NS, inject: pinInjected }, PinSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'rename', order: 200, locale: NS, inject: renameInjected }, RenameSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'fork', order: 300, locale: NS, inject: forkInjected }, ForkSessionMenuItem)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.menu.item', id: 'archive', order: 400, locale: NS, inject: archiveInjected }, ArchiveSessionMenuItem)
  })
  ctx.slots.inject('sidebar.workspaces.session.row.action', function* () {
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.row.action', id: 'archive', order: 100, locale: NS, inject: archiveInjected }, ArchiveSessionRowButton)
    yield ctx.slots.register({ name: 'sidebar.workspaces.session.row.action', id: 'pin', order: 200, locale: NS, inject: pinInjected }, PinSessionRowButton)
  })
  // The surfaces the actions raise live in the frame-wide layer: they must
  // outlive the row menu the action sat in.
  ctx.slots.inject('shell.overlay', function* () {
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.session-rename', locale: NS, inject: renameDialogInjected,
    }, SessionRenameDialog)
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.session-archive', locale: NS, inject: archiveConfirmInjected,
    }, SessionArchiveConfirmDialog)
    // The toast shares the browser's viewing store: it reads the archived
    // filter to drop the archived notice's filter action once rows are visible.
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'workspace.row-toast', locale: NS, store: viewStore, inject: rowToastInjected,
    }, RowActionToast)
  })
  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      children: { 'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: pickerInjected,
      locale: NS,
    },
    WorkspacePicker,
  ))
}

/**
 * The activity a Host `workspace/session-active` refusal reported, or nothing
 * for any other failure. The class identity check goes by name: client plugin
 * bundles do not share error-class identity.
 */
function activeSessionRefusal(reason: unknown): readonly SessionActivity[] | undefined {
  if (!(reason instanceof Error) || reason.name !== 'WorkspaceArchiveError') return undefined
  const { rpcError } = reason as WorkspaceArchiveError
  return rpcError.code === 'workspace/session-active' ? rpcError.details.activity : undefined
}
