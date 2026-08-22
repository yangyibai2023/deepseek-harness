/**
 * Hero-chip controller: which preset the NEXT session gets.
 *
 * The new-session screen has no session, so a pick is staged rather than
 * applied. It reaches a session when one becomes current and is still blank —
 * whether the workspace connect created it or reused an existing blank one,
 * which is why staging cannot simply ride along on `sessions.create`.
 *
 * The stage is forgotten once applied: the next new session starts from the
 * deployment default again, matching the workspace picker beside it.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore, type SessionId, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import { messageOf, presetOptions } from './settings-store.ts'
import type { AgentPresetOption } from './settings-store.ts'

/** Hero-chip snapshot. */
export interface AgentPresetSeatState {
  /** Presets the deployment supplies; empty means the chip renders nothing. */
  options: readonly AgentPresetOption[]
  /** The staged choice, empty until the roster loads. */
  current: string
  /** A rejected apply's message, cleared by the next attempt. */
  error: string | null
  busy: boolean
  /**
   * One-shot cue that the chip should introduce itself (the creator-draft
   * entry staged the pick from another screen, so the user never touched the
   * chip); the renderer clears it via `introduced()` once played.
   */
  introduce: boolean
  /** Whether the current session has a running turn (only then show “谁在工作”). */
  running: boolean
}

const INITIAL: AgentPresetSeatState = {
  options: [], current: '', error: null, busy: false, introduce: false, running: false,
}

/** One session's identity and whether it has started. */
export interface SeatSessionSummary {
  /** The session the chip would apply its staged choice to. */
  id: SessionId
  /** False once a turn has run — applying is refused from then on. */
  blank: boolean
  /** The preset the session already runs, when the summary reports one. */
  agentPreset?: string
  /** Whether the session currently has a running turn. */
  running?: boolean
}

/** Stages the next session's preset and applies it when one appears. */
export class AgentPresetSeatController {
  /** Chip snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<AgentPresetSeatState> = createSnapshotStore(INITIAL)

  /**
   * The deployment default, so a consumed stage can fall back to it without
   * re-reading the roster.
   */
  private fallback = ''

  /** Set while a pick is waiting for a session; cleared once applied. */
  private staged: string | undefined

  constructor(
    private readonly api: Pick<IApiClient, 'agentPresets'>,
    /** The session the hero is about to hand over to, when there is one. */
    private readonly currentSession: () => SeatSessionSummary | undefined,
    /**
     * Publish an applied switch into the session list, so the header label
     * moves with the composition instead of waiting for the next full list
     * refresh. Optional: a harness that renders no list omits it.
     */
    private readonly onApplied?: (sessionId: string, agentPreset: string) => void,
  ) {}

  private set(patch: Partial<AgentPresetSeatState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** 同步当前会话的运行状态（决定是否显示“谁在工作”的覆盖标签）。 */
  private syncSession(): void {
    const session = this.currentSession()
    this.set({ running: session?.running === true })
  }

  /**
   * Read the roster and open the chip on the deployment default.
   * @returns once the snapshot reflects the host.
   */
  async load(): Promise<void> {
    try {
      const response = await this.api.agentPresets.list({})
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      const { presets } = response.result.value
      this.fallback = presets.find(preset => preset.isDefault)?.id ?? presets[0]?.id ?? ''
      this.set({
        options: presetOptions(presets),
        // Staged pick first, then the composition the current session
        // already carries, then the deployment default. The middle term is
        // what keeps a late-landing load from regressing the display after
        // an applied stage was consumed — the chip mounts (and loads) only
        // once the flow's session is current, so the reply can arrive after
        // apply() already composed it.
        current: this.staged ?? this.currentSession()?.agentPreset ?? this.fallback,
        error: null,
      })
      this.syncSession()
      // HeightLab：每次进程启动都默认 Colin（deployment default）。
      // 宿主启动脚本已清掉「当前会话」并进入新对话，但 startInitialSelection
      // 会复用工作区里遗留的空白会话——若它带着上次首页选中的专家预设
      // （如 video-producer），输入框就会默认显示专家而不是 Colin。
      // 这里仅在本次进程首次加载（hl-boot-cleared 存在且未处理过）时，
      // 把自动选中的空白会话重置回默认预设，普通刷新/后续挂载不重复执行。
      try {
        if (this.staged === undefined
          && sessionStorage.getItem('hl-boot-cleared') === '1'
          && sessionStorage.getItem('hl-boot-agent-defaulted') !== '1') {
          const session = this.currentSession()
          if (session !== undefined
            && session.blank === true
            && typeof session.agentPreset === 'string'
            && session.agentPreset !== ''
            && session.agentPreset !== this.fallback) {
            void this.api.agentPresets.select({ sessionId: session.id, agentPreset: this.fallback })
              .then((reset) => {
                if (reset.result.ok) {
                  this.set({ current: reset.result.value.agentPreset })
                  this.onApplied?.(session.id, reset.result.value.agentPreset)
                }
              })
              .catch(() => { /* 非致命：下次打开再重置 */ })
          }
          sessionStorage.setItem('hl-boot-agent-defaulted', '1')
        }
      } catch { /* 非致命 */ }
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Stage one preset for the next session, applying it immediately when a
   * blank session is already current.
   * @param id - the preset to stage.
   * @returns once the stage settled, and the apply too when one happened.
   */
  async select(id: string): Promise<void> {
    if (this.store.getSnapshot().busy) return
    this.stage(id)
    await this.apply()
  }

  /**
   * Stage a pick WITHOUT the immediate apply, for a flow that starts the
   * receiving session after the pick (the settings section's creator entry).
   * `select()`'s immediate apply would meet the still-current running session
   * and drop the stage as unservable; staging alone leaves it for the
   * list-change applier, which fires when the started session becomes
   * current.
   * @param id - the preset to stage.
   * @param introduce - true when the stage came from another screen and the
   * chip should announce itself on the session it lands on.
   */
  stage(id: string, introduce = false): void {
    this.staged = id
    this.set({ current: id, error: null, introduce })
  }

  /** Acknowledge the introduction cue once the chip has played it. */
  introduced(): void {
    if (!this.store.getSnapshot().introduce) return
    this.set({ introduce: false })
  }

  /**
   * Hand the staged choice to the current session, if there is one to take it.
   *
   * Called both by `select()` and by whoever observes the current session
   * changing, because the session may appear either before or after the pick.
   * @returns once the switch settled, or immediately when there is nothing to do.
   */
  async apply(): Promise<void> {
    this.syncSession()
    const staged = this.staged
    const session = this.currentSession()
    if (staged === undefined) {
      // 没有待应用的选择时，跟随当前会话的实际预设：冷启动/加载竞态下
      // seat 可能回退到默认值（standard），但会话实际已是某个专家
      // （如 image-generator），导致回复结束后选择框错误显示 COLIN，
      // 而输入框按钮仍按会话预设显示（两者脱节）。
      const current = this.store.getSnapshot().current
      if (session?.agentPreset !== undefined && session.agentPreset !== current) {
        this.set({ current: session.agentPreset })
      }
      return
    }
    if (session === undefined) return
    // A started session's history was produced under its own composition; the
    // host refuses the swap, so the stage is no longer meaningful.
    if (!session.blank || session.agentPreset === staged) {
      this.staged = undefined
      return
    }
    this.set({ busy: true, error: null })
    try {
      const response = await this.api.agentPresets.select({ sessionId: session.id, agentPreset: staged })
      this.staged = undefined
      if (!response.result.ok) {
        this.set({ busy: false, error: response.result.error.message, current: this.fallback })
        return
      }
      // Consumed: the next new session opens on the deployment default again.
      this.set({ busy: false, current: response.result.value.agentPreset })
      this.onApplied?.(session.id, response.result.value.agentPreset)
    } catch (error) {
      this.staged = undefined
      this.set({ busy: false, error: messageOf(error), current: this.fallback })
    }
  }
}
