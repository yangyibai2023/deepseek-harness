/**
 * Pure types of the todo domain: the ONE home of the `todos` projection-key
 * declaration plus its payload types, free of this package's host-side value
 * imports (dsh-tools, zod). Two namespace projections serve it — `./types`
 * for host consumers, `./client/types` (the browser half-entry's re-export)
 * for client aggregates — with zero content duplication.
 *
 * @module @deepseek-ai/dsh-tool-todo/types
 */

/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * The base shape is upstream's: a human-readable `content` line and a
 * three-state `status`. The list is replaced wholesale on every write
 * (last-write-wins), so entries need no stable identity — they are matched by
 * `content` across writes (which is also why duplicate content is rejected).
 *
 * HeightLab（2026-11-15，用户要求「每完成一小步就给我一个结论」/「让我看到它
 * 正在做哪一步」）在此之上加了三个**纯展示、可选**字段。设计与取舍：
 *   · 全部 optional → 上游存档的旧清单（无这些字段）照常反序列化；
 *   · `result`/`error`/`activeForm` 是**文案**，不是新的 status 枚举 ——
 *     加枚举会破坏上游 wire schema（`todosProjectionSchema` 是 strict 的）；
 *   · 耗时**不走这里**：由 `todoTiming` 投影按事件时间自行派生，模型填的
 *     耗时既不可信又白花 token。
 */
export interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
  /**
   * HeightLab：这一步**做完了得到什么结论**（一句话），渲染在步骤标题下方。
   * 只在 `completed` 时有意义；省略则 UI 不渲染结论行（不占位）。
   */
  result?: string | undefined
  /**
   * HeightLab：`in_progress` 时展示「**现在**正在做什么」，比 `content`
   * （步骤名）具体一档。例：content=「生成 6 张分镜首帧图」，
   * activeForm=「正在生成第 4/6 张」。
   */
  activeForm?: string | undefined
  /**
   * HeightLab：失败原因。非空即表示这一步**失败**（UI 标红 + 提示可重试）。
   * 与 `status` 正交：失败步骤既不是纯 pending 也不是 in_progress，用一个
   * 独立文案字段表达，避免新增 status 枚举。
   */
  error?: string | undefined
}

/**
 * HeightLab：UI 侧派生计时——**由投影按事件时间计算，不让模型填**。
 *
 * 口径：每个 `todo/write` 事件带 `time`（Unix 毫秒），`todos` 的折叠是
 * last-write-wins，所以「某步骤此前的状态」只能从**前一次快照**得到。投影
 * 保留上一次快照，逐项对比得出：
 *   · 进入 `in_progress` 的时刻 → `startedAt`
 *   · 首次进入 `completed` 的时刻 → `finishedAt`
 * 两者都有才有耗时（`finishedAt - startedAt`）。
 *
 * 单独成投影（key `todoTiming`）而非塞进 `todos`，因为它是纯 UI 派生值，
 * 不该进入模型可见清单，也不该改变上游 `todos` 的 wire shape。
 */
export interface TodoTiming {
  /** 步骤 content → 计时（按 content 匹配，与清单 last-write-wins 一致）。 */
  readonly entries: Readonly<Record<string, TodoTimingEntry>>
  /** 本清单首次出现的时间（整轮任务起点）；清空后重置。 */
  readonly startedAt?: number | undefined
}

/** One step's derived timing. Both bounds absent means the step never ran. */
export interface TodoTimingEntry {
  /** 首次以 `in_progress` 出现的 write 时间。 */
  readonly startedAt?: number | undefined
  /** 首次以 `completed` 出现的 write 时间。 */
  readonly finishedAt?: number | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Whole-list snapshot; latest write wins on replay. Log-only UI state; never derived history. */
    'todo/write': { todos: TodoItem[] }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    todos: TodoItem[] | null
    /** HeightLab：派生计时（见 {@link TodoTiming}）。 */
    todoTiming: TodoTiming
  }
  interface SessionProjectionMap {
    /**
     * The agent's current whole todo list (the latest `todo/write` snapshot),
     * or `null` before the first write. Whole-value rule: every `todo/write`
     * carries the complete replacement list, so the fold is last-wins.
     */
    todos: TodoItem[] | null
    /** HeightLab：`todos` 的派生耗时（client-visible，纯展示）。 */
    todoTiming: TodoTiming
  }
}
