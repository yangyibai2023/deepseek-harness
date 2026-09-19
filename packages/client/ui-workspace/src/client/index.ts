/**
 * Workspace plugin, browser half. Two registrations: WorkspaceBrowser fills
 * the sidebar shell's `sidebar.workspaces` hole (the whole browsing region),
 * and WorkspacePicker fills the conversation hero's picker hole
 * (`conversation.hero.workspace` — both hero forms). Both read real Host
 * Workspaces through the global useWorkspaces hook, and each declares its
 * own `single` directory-flow child hole for the composed picker package's
 * client half (see the contract module doc). Export discipline:
 * packages/client/AGENTS.md.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
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
import type { WorkspaceBrowserInjected, WorkspacePickerInjected } from './contract/slots.ts'
import { UiWorkspaceService } from './navigation.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { en, zh, type WorkspaceKey } from './locales.ts'

export type { UiWorkspace } from './navigation.ts'
export type {
  DirectoryFlowOwnerProps, DirectoryFlowSlotName, DirectoryPickingHooks, DirectoryPickingInjected,
  WorkspaceBrowserInjected, WorkspaceBrowserProps, WorkspacePickerInjected, WorkspacePickerProps,
} from './contract/slots.ts'
export type { WorkspaceKey } from './locales.ts'

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
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker', 'layout',
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
  const uiWorkspace = new UiWorkspaceService(
    ctx, ctx.remote.directoryPicker, workspaces, sessions)
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')

  // HeightLab V26e-b：视频创作一级页「爆款复刻」（hl:start-replication）——
  // 新建会话并在导航打开前设置复刻模式标记 + 广播会话就绪（右栏展开消费）。
  // 上一轮误删了侧边栏的旧监听而未接上本处理，导致入口点击无反应——本轮补齐。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    const onStart = (event: Event): void => {
      const detail = (event as CustomEvent<{ workspaceId?: unknown }>).detail
      const detailWorkspaceId = typeof detail?.workspaceId === 'string' ? detail.workspaceId : undefined
      const sessionList = sessions.list.getSnapshot()
      const current = sessionList.current
      const currentWorkspaceId = current === undefined
        ? undefined
        : workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(current))?.workspaceId
      // 事件里来的 workspaceId 已满足 WorkspaceId 品牌约束（同构字符串），断言收窄。
      const target = (detailWorkspaceId ?? currentWorkspaceId) as WorkspaceId | undefined
      if (target === undefined) return
      void uiWorkspace.openWorkspace(target, (sessionId) => {
        try {
          localStorage.setItem('hl-console-mode', 'replication')
        } catch { /* 非致命 */ }
        // HeightLab V29：恢复旧监听的完整职责——EmptyHero/ConversationRoot/
        // TemplateDock 三处复刻判定都靠 hl:mode-change 事件刷新（左侧引导
        // 选项区+输入框贴底）。三修删旧监听时漏掉这条广播，左侧因此退回
        // 普通主页样式（右侧 seed 读 localStorage 不受影响）。
        window.dispatchEvent(new CustomEvent('hl:mode-change', { detail: { mode: 'replication' } }))
        window.dispatchEvent(new CustomEvent('hl:replication-session-open', { detail: { sessionId } }))
      }).catch((reason: unknown) => {
        console.warn('replication session failed:', reason)
      })
    }
    window.addEventListener('hl:start-replication', onStart)
    return () => { window.removeEventListener('hl:start-replication', onStart) }
  }, 'ui-workspace: replication entry')

  // ── HeightLab 定制（自 0.3.x 稳定线迁移，API 按 0.1.5 适配）──────────
  // 全新环境自动完成首次初始化——没有工作区时自动创建「~/HeightLab」
  // 工作区；没有当前会话时自动开始一个新会话。直接进入产品输入框状态，
  // 而不是 DSH 原生“选择工作区”空状态。幂等：已有当前会话就不再触发。
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
    const tryAutoStart = async (): Promise<void> => {
      if (attempts >= 15) return
      // 未登录（登录门 out/未判定）绝不自动开会话——否则登录页背后会
      // 反复建会话（hlAutoStart enter 循环）。登录成功后轮询接管。
      if (document.body.dataset.hlAuth !== 'in') return
      attempts += 1
      try {
        const sessionList = sessions.list.getSnapshot()
        let workspaceList = workspaces.list.getSnapshot()
        debug({ at: 'enter', attempts, current: sessionList.current ?? null, wsCount: workspaceList.items.length })
        if (sessionList.current !== undefined) return
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
        if (workspaceId !== undefined && sessions.list.getSnapshot().current === undefined) {
          debug({ at: 'startSession', workspaceId })
          try {
            const sessionId = await uiWorkspace.connectWorkspace(workspaceId)
            debug({ at: 'connected', sessionId })
            sessions.open(sessionId)
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
        if (sessions.list.getSnapshot().current !== undefined || attempts >= 15) {
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
      // workspaceId 可选（继承当前/最近工作区），openWorkspace 需非空——
      // 解析逻辑与 navigation.startSession 一致（current → recent → clear）。
      const snap = workspaces.list.getSnapshot()
      const sessionsSnap = sessions.list.getSnapshot()
      const current = sessionsSnap.current
      const currentWorkspaceId = current === undefined
        ? undefined
        : snap.items.find(item => item.sessionIds.includes(current))?.workspaceId
      // 继承顺序与 navigation.startSession 一致：显式 → 当前会话工作区 → 最近工作区。
      // （recentWorkspace 为 navigation 内部函数未导出；此处以「含已有会话的
      // 第一个工作区」近似，复刻入口恒有 HeightLab 工作区，实际不受影响。）
      const recent = snap.items.find(item => item.sessionIds.some(id => sessionsSnap.byId[id] !== undefined))?.workspaceId
      const resolved = workspaceId ?? currentWorkspaceId ?? recent
      if (resolved === undefined) {
        sessions.clear()
        ctx.layout.selectPanel(null)
        return
      }
      void uiWorkspace.openWorkspace(resolved, (sessionId) => {
        try {
          localStorage.setItem('hl-console-mode', 'replication')
        } catch { /* 存储不可用时跳过 */ }
        window.dispatchEvent(new CustomEvent('hl:replication-session-open', { detail: { sessionId } }))
      })
    },
    startSession: (workspaceId) => {
      // HeightLab 2026-09-16：恢复稳定线行为——开新会话时广播关闭
      // 创意灵感/资料库覆盖层与自动化视图，否则 hub 白面板会驻留在
      // 所有页面上（0.1.5 迁移丢失本段，用户实测"进入哪个页面都带白框"）。
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hl:close-hub'))
        window.dispatchEvent(new CustomEvent('hl:close-automation'))
      }
      uiWorkspace.startSession(workspaceId)
    },
    open: openSession,
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      // Row → session-face hop: rename is a per-session verb (ISession), not
      // a list-service verb; the binding resolves any listed session.
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId)
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await uiWorkspace.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: browserFlowSource, hostInfo },
  })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    hooks: { directoryFlow: pickerFlowSource },
  })
  // Each registration declares its directory-flow child in the same call;
  // slot injection follows both the owner and declaration HMR lifetimes.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
      store: createWorkspaceViewStore(),
      inject: browserInjected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
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
