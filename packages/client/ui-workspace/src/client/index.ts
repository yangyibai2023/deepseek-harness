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
  // HeightLab V26e-b：视频创作一级页「爆款复刻」（hl:start-replication）——
  // 新建会话并在导航打开前设置复刻模式标记 + 广播会话就绪（右栏展开消费）。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    const onStart = (event: Event): void => {
      const detail = (event as CustomEvent<{ workspaceId?: unknown }>).detail
      const detailWorkspaceId = typeof detail?.workspaceId === 'string' ? detail.workspaceId : undefined
      // 0.2.1 适配：SessionListState 不再有 current——取「含已有会话的第一个
      // 工作区」近似旧「当前会话工作区」，复刻入口恒有 HeightLab 工作区。
      const sessionList = sessions.list.getSnapshot()
      const fallbackWorkspaceId = workspaces.list.getSnapshot().items
        .find(item => item.sessionIds.some(id => sessionList.byId[id] !== undefined))?.workspaceId
      // 事件里来的 workspaceId 已满足 WorkspaceId 品牌约束（同构字符串），断言收窄。
      const target = (detailWorkspaceId ?? fallbackWorkspaceId) as WorkspaceId | undefined
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
      }).catch((reason: unknown) => {
        console.warn('replication session failed:', reason)
      })
    }
    window.addEventListener('hl:start-replication', onStart)
    return () => { window.removeEventListener('hl:start-replication', onStart) }
  }, 'ui-workspace: replication entry')

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
        return data?.ok === true && typeof data.value?.workspaceId === 'string'
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
    const sync = async (intent?: 'team' | 'personal'): Promise<void> => {
      // 点击切换时以事件意图为准（此刻 ds-bot 的 localStorage 可能还没写入）；
      // 轮询时退回读实际 surface。
      const surface = intent ?? (() => {
        try { return localStorage.getItem('ds-bot:surface') } catch { return null }
      })()
      const team = intent !== undefined ? intent === 'team' : surface === 'bot'
      // 无论当前是哪个模式，都先解析并发布团队工作区 id：个人模式的工作区列表
      // 需要它来隐藏团队行（融合开关关闭时），不能等切到团队才发布。
      {
        const resolved = await dsBotWorkspaceId()
        if (resolved !== undefined) {
          ;(globalThis as { __hlTeamWorkspaceId?: string }).__hlTeamWorkspaceId = resolved
        }
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
      if (team) {
        const teamId = await dsBotWorkspaceId()
        if (teamId === undefined) return
        // 发布团队工作区 id：navigation.openSession 用它判断「用户点开的是不是
        // 团队会话」——单一权威，不靠标题匹配。
        ;(globalThis as { __hlTeamWorkspaceId?: string }).__hlTeamWorkspaceId = teamId
        void renameTeamWorkspace(teamId)
        // 团队模式：会话必须落在团队工作区；当前不在就切过去（复用空白会话）。
        const teamEntry = workspaces.list.getSnapshot().items
          .find(item => item.workspaceId === teamId)
        if (teamEntry === undefined) return
        const active = activeSessionId()
        if (active !== undefined && teamEntry.sessionIds.includes(active)) return
        await uiWorkspace.connectWorkspace(teamEntry.workspaceId).then(
          (sessionId) => { uiWorkspace.openSession(sessionId) },
          () => { /* 创建失败交给宿主提示 */ },
        )
        return
      }
      // 个人模式：绝不停在团队工作区（用户铁律，无条件执行）。
      // 当前会话属于团队工作区时，直接切回官方默认工作区「我的工作区」——
      // 团队会话本身不删除，仍可在切回团队模式后继续。
      const teamId = await dsBotWorkspaceId()
      if (teamId === undefined) return
      const personal = pickPersonalWorkspace()
      if (personal === undefined) return
      const teamEntry = workspaces.list.getSnapshot().items
        .find(item => item.workspaceId === teamId)
      if (teamEntry === undefined) return
      const activeId = activeSessionId()
      if (activeId === undefined || !teamEntry.sessionIds.includes(activeId)) return
      await uiWorkspace.connectWorkspace(personal as never).then(
        (sessionId) => { uiWorkspace.openSession(sessionId) },
        () => { /* 失败不阻塞 */ },
      )
    }
    const onModeChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ mode?: unknown }>).detail
      void sync(detail?.mode === 'enterprise' ? 'team' : 'personal')
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
