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
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { WorkspaceBrowserInjected, WorkspacePickerInjected } from './contract/slots.ts'
import { createWorkspaceViewStore } from './stores.ts'
import { WorkspaceBrowser } from './WorkspaceBrowser.tsx'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import { en, zh, type WorkspaceKey } from './locales.ts'

export type {
  DirectoryFlowOwnerProps, DirectoryFlowSlotName, DirectoryPickingHooks, DirectoryPickingInjected,
  WorkspaceBrowserInjected, WorkspaceBrowserProps, WorkspacePickerInjected, WorkspacePickerProps,
} from './contract/slots.ts'
export type { WorkspaceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
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
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'connection']

/**
 * Register the browser and picker once their slot declarations are on the
 * ledger. Inject factories return plain callbacks; data reads use the
 * framework's global hooks.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const hostDescription = connection.hostDescription
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace: dictionaries')

  // HeightLab：全新环境自动完成首次初始化——没有工作区时自动创建
  // 「~/HeightLab」工作区；没有当前会话时自动开始一个新会话。
  // 直接进入产品输入框状态，而不是 DSH 原生“选择工作区”空状态。
  // 幂等：已有当前会话就不再触发；不制造任何聊天内容。
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
      attempts += 1
      try {
        const sessions = ctx.sessions.list.getSnapshot()
        let workspaces = ctx.workspaces.list.getSnapshot()
        debug({ at: 'enter', attempts, current: sessions.current ?? null, wsCount: workspaces.items.length })
        if (sessions.current !== undefined) return
        let workspaceId = workspaces.items[0]?.workspaceId
        if (workspaceId === undefined && workspaces.items.length === 0) {
          // 兜底：初始化脚本没种成功时，客户端自己建默认工作区。
          const listing = await ctx.workspaces.listDirectory()
          let dir = ''
          try {
            dir = await ctx.workspaces.createDirectory(listing.home, 'HeightLab')
          } catch {
            dir = `${listing.home.replace(/\/+$/, '')}/HeightLab`
          }
          const created = await ctx.workspaces.create({ path: dir })
          workspaceId = created.workspaceId
          try {
            await ctx.workspaces.rename(workspaceId, '我的工作区')
          } catch {
            // 重命名失败不阻塞。
          }
          workspaces = ctx.workspaces.list.getSnapshot()
        }
        workspaceId = workspaceId ?? workspaces.items[0]?.workspaceId
        if (workspaceId !== undefined && ctx.sessions.list.getSnapshot().current === undefined) {
          debug({ at: 'startSession', workspaceId })
          try {
            const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
            debug({ at: 'connected', sessionId })
            ctx.sessions.open(sessionId)
            debug({ at: 'opened' })
          } catch (error) {
            debug({ at: 'connectError', message: error instanceof Error ? error.message : String(error) })
          }
        }
      } catch (error) {
        // 基线未就绪/网络抖动：交给重试。
        debug({ at: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
    const run = (): void => { void tryAutoStart() }
    const off = ctx.on('connection/reset', run)
    window.setTimeout(run, 600)
    timer = window.setInterval(run, 2000)
    return () => {
      off()
      window.clearInterval(timer)
    }
  }, 'ui-workspace: auto-start first session')

  const searchSessions: WorkspaceBrowserInjected['searchSessions'] = async (query, signal) => {
    const result = await ctx.sessions.search(query, signal)
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
  const pickerFlowSource = flowSource('conversation.hero.workspace.directoryFlow')
  const browserInjected = (): WorkspaceBrowserInjected => ({
    // Explicit group actions keep their target; unscoped New Session inherits
    // the current Session Workspace before the recent-Workspace fallback.
    // HeightLab：工作区浏览区的「新建会话」同样先退出创意灵感/自动化页面。
    startSession: (workspaceId) => {
      window.dispatchEvent(new CustomEvent('hl:close-hub'))
      window.dispatchEvent(new CustomEvent('hl:close-automation'))
      ctx.workspaces.startSession(workspaceId)
    },
    open: (sessionId) => { ctx.sessions.open(sessionId) },
    searchSessions,
    searchResultLimit: ctx.sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      // Row → session-face hop: rename is a per-session verb (ISession), not
      // a list-service verb; the binding resolves any listed session.
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      ctx.sessions.fork({ sessionId, increaseTitle: true })
        .then((childId) => { ctx.sessions.open(childId) })
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    renameWorkspace: async (workspaceId, title) => { await ctx.workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await ctx.workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await ctx.workspaces.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await ctx.workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    createWorkspace: input => ctx.workspaces.create(input),
    hooks: { directoryFlow: browserFlowSource, hostDescription },
  })
  const pickerInjected = (): WorkspacePickerInjected => ({
    createWorkspace: input => ctx.workspaces.create(input),
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
