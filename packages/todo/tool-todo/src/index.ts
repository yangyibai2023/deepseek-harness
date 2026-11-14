/**
 * Model-facing whole-list replacement. Each call appends a `todo/write` snapshot to the calling
 * agent's session; replay is last-write-wins, and UIs render from session events. A non-agent
 * caller has no owning list and is rejected. Named exports preserve loader injection metadata.
 * @module @deepseek-ai/dsh-tool-todo
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TodoItem, TodoTiming, TodoTimingEntry } from './types.ts'
// Type-only: resolves the required ctx.sessionProjections service declaration.
import type {} from '@deepseek-ai/dsh-session-projection'
// The `todos` projection-key declaration lives in src/types.ts (its one home);
// this re-export projects the type face onto the package root AND keeps the
// module edge in the emitted index.d.ts, so aggregate programs consuming the
// declarations still receive the SessionProjectionMap merge.
export type * from './types.ts'

export const name = 'tool-todo'
export const inject = ['tools', 'sessionProjections']

/** The valid {@link TodoItem} statuses, as a runtime set for input narrowing. */
const STATUSES = ['pending', 'in_progress', 'completed'] as const

/** Model-facing todo tool configuration. */
export interface Config {
  /**
   * Required deployment choice for whether several todos may be `in_progress` at once. True suits
   * agents that run work concurrently — subagents, background commands, workflow fan-out — and the
   * description then instructs the model to mark every actively worked task. False restores the
   * single-active discipline: the description asks for exactly one, and a call marking more is
   * rejected.
   */
  allowParallelInProgress: boolean
}

/** Schemastery configuration for the todo tool consumer. */
export const Config: z<Config> = z.object({
  allowParallelInProgress: z.boolean().required(),
})

const DESCRIPTION_HEAD =
  'Record and update a task list to plan multi-step work and show progress; skip it for trivial '
  + 'single-step tasks. Add one todo per concrete step before you start. '

const DESCRIPTION_PARALLEL =
  'While work remains, keep the todos being worked on `in_progress`, several only when work runs in parallel. '

const DESCRIPTION_SINGLE =
  'While work remains, keep exactly one todo `in_progress`. '

/* HeightLab（2026-11-15，用户要求「每完成一小步给我一个结论」/「让我看到正在做
 * 哪一步」）：把这两个诉求写进工具描述，让模型写清单时就顺手带上。
 *
 * 为什么放在 description 而不是只在系统提示词里：description 是每次调用都跟着
 * 工具 schema 一起下发的（同一份请求，不额外增加请求数），且正好在模型准备调
 * todo_write 的那一刻生效——比远处的一段规则更容易被遵守。
 *
 * ⚠️ 2026-11-15 实测校正：最初把这三段写成「also set / you can」的建议口吻 +
 * 放在描述尾部，实测 4 轮 todo_write **一个字段都没填**（模型对可选参数默认
 * 省略）。改为 **MUST + 前置到描述开头 + 说明它是用户唯一能看到的进度**，符合
 * 「必需项要说清为什么必需」的提示词经验：模型跳过可选项通常不是拒绝，而是没
 * 意识到它承载用户价值。 */
const DESCRIPTION_RESULT =
  'MUST fill: when a todo becomes `completed`, set its `result` to ONE short sentence — the '
  + 'conclusion, number, or decision that step actually produced (e.g. "锁定 8 小时保温+摔不坏两个'
  + '卖点，人群 25-40 通勤族"), NOT a restatement of the step name. '
  /* ⚠️ 2026-11-15 实测第二坑：模型会把结论直接**追加到 content 里**
   * （「核查定价 —— 结论：Notion AI 已并入 $20/月」），result 仍为空。这样步骤名
   * 被污染、结论无法单独渲染、后续 write 还要重复粘贴越来越长的 content。
   * 必须显式禁止，否则「有结果」的假象会掩盖格式错误。 */
  + 'Keep `content` exactly the step name you first wrote — do NOT append the conclusion to it; '
  + 'the conclusion belongs in `result` only. '
  + 'This sentence is what the user reads under each step; leaving it empty means the user sees a '
  + 'checklist with no answers and has to reread the whole chat — that is the exact problem this '
  + 'field exists to solve. '

const DESCRIPTION_ACTIVE_FORM =
  'MUST fill while `in_progress`: set `activeForm` to what you are doing RIGHT NOW, one notch more '
  + 'specific than the step name (step "生成 6 张分镜首帧图" → activeForm "正在生成第 4/6 张"). '
  + 'Refresh it on later writes as sub-progress advances, so a long-running step never looks stalled. '

const DESCRIPTION_ERROR =
  'On failure, put the cause in `error` (one short sentence) so the step renders as failed instead of '
  + 'sitting in `in_progress` pretending to still run. '

const DESCRIPTION_TAIL = 'Mark each todo `completed` as soon as it is done.'

/**
 * The model-facing description for one activation. The active-status clause is the only part that
 * varies, because it is the only instruction the parallel policy changes.
 * @param allowParallel - whether several todos may be `in_progress` at once.
 * @returns the composed tool description.
 */
function describe(allowParallel: boolean): string {
  /* HeightLab：MUST 段前置。模型对工具描述开头最敏感，把「用户唯一能看到的
   * 进度」放在第一句，比放在末尾作为补充说明更容易被遵守（11-15 实测：
   * 尾置建议口吻 → 4 轮一个字段都没填）。 */
  return DESCRIPTION_RESULT
    + DESCRIPTION_ACTIVE_FORM
    + DESCRIPTION_HEAD
    + (allowParallel ? DESCRIPTION_PARALLEL : DESCRIPTION_SINGLE)
    + DESCRIPTION_ERROR
    + DESCRIPTION_TAIL
}

/**
 * HeightLab：可选文案字段的归一化（trim + 空串转 undefined）。
 *
 * 为什么必须是 undefined 而不是空串：UI 用 `result !== undefined` 决定是否渲染
 * 结论行；空串会渲染出一行空白，破坏「零占位」铁律。
 * @param value - 模型传入的原值（schema 已保证是 string | undefined）。
 * @returns 归一化后的文案，或 undefined。
 */
function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * HeightLab（2026-11-15）：把模型误追加进 `content` 的结论拆回 `result`。
 *
 * ## 为什么需要这道防线
 * 实测（2026-11-15，真实 dev runtime）模型**已经在照着做了**，但它把结论写成了
 * `content: "核查官方定价与 AI 能力 —— 结论：Notion AI 已并入 $20/月"`，而
 * `result` 仍然为空。后果：
 *   · 步骤名被污染（越写越长，因为每次 write 都会再粘一遍）；
 *   · UI 无法把结论单独渲染成第二行（它看起来像是一个超长步骤名）；
 *   · 用户看不到「结论」在语义上是结论。
 *
 * 提示词已经明确禁止（见 DESCRIPTION_RESULT），但**提示词不是契约**——这里做
 * 结构化解法：识别 `—— 结论：` / `— 结论:` / ` - 结论:` 等常见分隔写法，把后半
 * 段提出来当 result，`content` 还原成纯步骤名。只在一段式分隔时生效，避免误伤
 * 本身带破折号的自然文本。
 *
 * @param content - 已 trim 的步骤名。
 * @param result - 模型显式给出的 result（已归一化）。
 * @returns 拆分后的 { content, result }。
 */
function splitInlineConclusion(
  content: string,
  result: string | undefined,
): { content: string; result: string | undefined } {
  /* 只在模型**没写** result 时兜底：显式 result 永远优先，不覆盖模型的选择。 */
  if (result !== undefined) return { content, result }
  /* 形态 A：显式「— 结论：」分隔（模型最常见的混写方式之一）。 */
  const explicit = /^(.{2,}?)\s*(?:——|—|–|\s-\s)\s*结论[：:]\s*(.+)$/u.exec(content)
  if (explicit !== null) {
    const head = (explicit[1] ?? '').trim()
    const tail = (explicit[2] ?? '').trim()
    if (head.length > 0 && tail.length > 0) return { content: head, result: tail }
  }
  /* 形态 B（2026-11-15 第二次实测）：模型不用「结论：」字样，而是把整句结论直接
   * 写进 content，形如「供需盘点完成：收纳是家居类目里搜索密度最高的入口，但…」
   * 「确定 3 个方向：A …、B …、C …」。特征是「短前缀 + 冒号 + 长正文」。
   *
   * 结构判据（而非关键词）：冒号前 ≤ 24 字且冒号后 ≥ 12 字，且整串长度明显超出
   * 一个步骤名该有的长度（> 30 字）。这样「对比 Notion：定价 / 隐私」这类本身
   * 就短的步骤名不会被误拆，而任何携带完整结论的长串都会被拆开。 */
  const colon = /^(.{2,24}?)\s*[：:]\s*(.{12,})$/u.exec(content)
  if (colon !== null && content.length > 30) {
    const head = (colon[1] ?? '').trim()
    const tail = (colon[2] ?? '').trim()
    /* 「完成/拆完/确定/交付/补齐」这类动词结尾的前缀，本身就是完成陈述而非步骤名
     * —— 它更像「这步做完了什么」，整句保留为 result，步骤名退化为前缀。 */
    if (head.length > 0 && tail.length > 0) return { content: head, result: tail }
  }
  return { content, result }
}

/**
 * HeightLab（2026-11-15）：展示层归一化——把模型误追加进 `content` 的结论拆回
 * `result`，并清掉空串字段。
 *
 * **为什么投影层也要跑一遍**：`todos` 投影是所有 `todo/write` 事件的唯一必经
 * 之路（工具调用、存档重放、测试直接 append、将来其它写入方都经过它），而工具
 * 校验只覆盖「模型走 todo_write」这一条。实测就是模型把结论写成
 * `content: "核查定价 —— 结论：Notion AI 已并入 $20/月"`、`result` 留空，
 * 若只在工具层处理，UI 上就会渲染出一个越来越长的步骤名。
 *
 * 纯函数、幂等：对已规范化的输入再跑一次结果相同。
 * @param todos - 任意来源的整份清单。
 * @returns 规范化后的整份清单。
 */
function normalizeTodos(todos: readonly TodoItem[]): TodoItem[] {
  return todos.map((item) => {
    const result0 = optionalText(item.result)
    const { content, result } = splitInlineConclusion(item.content.trim(), result0)
    const activeForm = optionalText(item.activeForm)
    const error = optionalText(item.error)
    return {
      content,
      status: item.status,
      ...(result === undefined ? {} : { result }),
      ...(activeForm === undefined ? {} : { activeForm }),
      ...(error === undefined ? {} : { error }),
    }
  })
}

/**
 * Validate the value constraints the ParameterSchemaSpec can't express and build the canonical {@link
 * TodoItem}[]: trimmed non-empty unique content, and at most one `in_progress` item unless the
 * deployment allows parallel work. The registry has already enforced the status enum and rejected
 * unknown item keys (`additionalProperties: false` — the logged snapshot must equal what the model
 * believes it wrote, so a nested/extended item shape fails loud at the schema boundary instead of
 * silently flattening); the cast below records that guarantee.
 * @param raw - the model-supplied list, already schema-checked.
 * @param allowParallel - whether several items may be `in_progress` at once.
 * @returns the canonical list.
 */
function toTodoList(
  raw: {
    content: string
    status: string
    result?: string
    activeForm?: string
    error?: string
  }[],
  allowParallel: boolean,
): TodoItem[] {
  const todos: TodoItem[] = []
  const seen = new Set<string>()
  let active = 0
  /* 先按 normalizeTodos 同一口径规范化（拆分内联结论、清空串），再做约束校验
   * ——两处共用一份逻辑，避免「工具层存的和投影层渲染的不一致」。 */
  for (const item of normalizeTodos(raw.map(item => ({
    content: item.content,
    status: item.status as TodoItem['status'],
    ...optionalText(item.result) === undefined ? {} : { result: item.result as string },
    ...optionalText(item.activeForm) === undefined ? {} : { activeForm: item.activeForm as string },
    ...optionalText(item.error) === undefined ? {} : { error: item.error as string },
  })))) {
    const { content, result, activeForm, error } = item
    if (content.length === 0) {
      throw new Error('invalid todo: `content` must be a non-empty string')
    }
    if (seen.has(content)) {
      throw new Error(`invalid todos: duplicate content ${JSON.stringify(content)}`)
    }
    seen.add(content)
    if (item.status === 'in_progress') active++
    todos.push({
      content,
      status: item.status,
      ...(result === undefined ? {} : { result }),
      ...(activeForm === undefined ? {} : { activeForm }),
      ...(error === undefined ? {} : { error }),
    })
  }
  if (!allowParallel && active > 1) {
    throw new Error(`invalid todos: at most one task may be in_progress (got ${active})`)
  }
  return todos
}

/** Wire payload schema of the `todos` projection (whole list or pre-first-write null). */
const todosProjectionSchema = zod.union([
  zod.array(zod.object({
    content: zod.string(),
    status: zod.union([zod.literal('pending'), zod.literal('in_progress'), zod.literal('completed')]),
    /* HeightLab：三个展示字段全部 optional —— 上游/历史存档没有它们，必须能过。 */
    result: zod.string().optional(),
    activeForm: zod.string().optional(),
    error: zod.string().optional(),
  })),
  zod.null(),
]) as unknown as ZodType<TodoItem[] | null>

/**
 * HeightLab（2026-11-15）：派生计时投影。
 *
 * 为什么独立成一个投影而不是塞进 `todos`：
 *   · `todos` 的 wire shape 必须与上游一致（模型与 UI 都按它序列化）；
 *   · 计时是**纯 UI 派生值**，不该进入模型可见清单；
 *   · 它需要记住上一次快照才能算出「何时进入 in_progress」——这份历史不属于
 *     清单本身。
 *
 * 算法（每个 `todo/write` 事件驱动一次）：
 *   · 上一次快照里该步不是 completed、本次是 completed → 记 `finishedAt`
 *   · 上一次快照里该步不是 in_progress、本次是 in_progress → 记 `startedAt`
 *   · 计时一旦记下就不再覆盖（首次发生才是真起点/终点）
 *   · `turn/start` 清空（与 `todos` 同生命周期）
 *
 * ⚠️ 投影的 state 必须是**纯 JSON**（持久化缓存的前提，见 ProjectionDefinition
 * 契约），所以「上一次各步状态」不能放 WeakMap / 闭包，必须作为字段存进 state
 * 本身；它只在宿主侧使用，`wire.view` 会把它剔除，客户端看不到。
 *
 * stateVersion=1：新增 key，没有历史持久化数据要兼容。
 */
interface TodoTimingState extends TodoTiming {
  /** 上一次 write 时各步的状态（按 content）；仅宿主侧跃迁判断用，不走 wire。 */
  readonly lastStatus: Readonly<Record<string, TodoItem['status']>>
}

/** One step's derived timing (wire + state share this). */
const timingEntrySchema = zod.object({
  startedAt: zod.number().optional(),
  finishedAt: zod.number().optional(),
})

/** Derived-timing fields shared by the state schema and the wire schema. */
const timingFields = {
  entries: zod.record(zod.string(), timingEntrySchema),
  startedAt: zod.number().optional(),
}

const todoTimingStateSchema = zod.object({
  ...timingFields,
  lastStatus: zod.record(
    zod.string(),
    zod.union([zod.literal('pending'), zod.literal('in_progress'), zod.literal('completed')]),
  ),
}) as unknown as ZodType<TodoTimingState>

/** Client-visible wire shape: derived timing only (no internal bookkeeping). */
const todoTimingWireSchema = zod.object(timingFields) as unknown as ZodType<TodoTiming>

/** Empty timing value — one shared instance so unchanged folds keep reference identity. */
const EMPTY_TIMING: TodoTimingState = { entries: {}, lastStatus: {} }

/**
 * Fold one `todo/write` into the timing state.
 * @param prev - timing state before this event.
 * @param nextTodos - the new whole list carried by this event.
 * @param time - the event's Unix-epoch-millisecond timestamp.
 * @returns the next timing state, or the same reference when nothing changed.
 */
function foldTiming(
  prev: TodoTimingState,
  nextTodos: readonly TodoItem[],
  time: number,
): TodoTimingState {
  let changed = false
  const entries: Record<string, TodoTimingEntry> = { ...prev.entries }
  const lastStatus: Record<string, TodoItem['status']> = {}
  for (const item of nextTodos) {
    lastStatus[item.content] = item.status
    const before = prev.lastStatus[item.content]
    const current = entries[item.content] ?? {}
    let next: TodoTimingEntry = current
    /* 进入 in_progress：只在「之前不是 in_progress」时记起点 */
    if (item.status === 'in_progress' && before !== 'in_progress' && current.startedAt === undefined) {
      next = { ...next, startedAt: time }
    }
    /* 进入 completed：记终点。若从未记过起点（模型一次写到位，跳过了 in_progress），
     * 不臆造起点——UI 会因缺少 startedAt 而不显示耗时，比显示 0 秒诚实。 */
    if (item.status === 'completed' && before !== 'completed' && current.finishedAt === undefined) {
      next = { ...next, finishedAt: time }
    }
    if (next !== current) {
      entries[item.content] = next
      changed = true
    }
  }
  const startedAt = prev.startedAt ?? time
  /* 状态完全没变（模型重复写同一份清单）→ 保持引用不变，避免下游无谓重渲染。
   * lastStatus 内容相同但引用不同也算「没变」，用浅比较判断。 */
  const statusSame = Object.keys(lastStatus).length === Object.keys(prev.lastStatus).length
    && Object.entries(lastStatus).every(([k, v]) => prev.lastStatus[k] === v)
  if (!changed && statusSame && prev.startedAt !== undefined) return prev
  return { entries, startedAt, lastStatus }
}

/**
 * Register the `todo_write` tool on `ctx.tools` and the `todos` + `todoTiming`
 * units on `ctx.sessionProjections`.
 * @param ctx - registrant context carrying the tool and session-projection registries.
 * @param config - deployment's explicit todo policy.
 */
export function apply(ctx: Context, config: Config): void {
  const allowParallel = config.allowParallelInProgress
  // Standing-plan fold: latest whole todo/write list, cleared by the next
  // turn/start (turn/end keeps the finished checklist visible); null before the
  // first write or after a later turn begins; every other event returns the
  // same state reference.
  ctx.sessionProjections.register<'todos', TodoItem[] | null>({
    key: 'todos',
    stateSchema: todosProjectionSchema,
    init: () => null,
    apply: (state, event) => {
      /* HeightLab（2026-11-15）：展示层的结论兜底必须放在**投影**这里，不能只在
       * 工具校验里做——投影是所有 `todo/write` 事件的唯一必经之路，而工具层只
       * 覆盖模型走工具的那条路（存档重放、测试直接 append、将来可能的其它写入方
       * 都绕过它）。实测就踩到了这点：模型把结论追加进 content，UI 只能渲染出
       * 一个越来越长的步骤名。 */
      if (event.type === 'todo/write') return normalizeTodos(event.data.todos)
      if (event.type === 'turn/start') return null
      return state
    },
    wire: { viewSchema: todosProjectionSchema, view: state => state },
    stateVersion: 3,
  })
  /* HeightLab（2026-11-15）：派生计时。需要上一次各步状态才能判断跃迁，
   * 因此在 state 里同时保留 `lastStatus`（host-only，wire 时剔除）。
   *
   * 注意泛型：`register<K, S>` 的 S 被约束为 `SessionProjectionStateMap[K]`
   * （即 wire 类型 `TodoTiming`），但我们的 state 比 wire 多一个内部字段。
   * 这里按内部 state 类型注册、由 `view` 收窄回 wire 类型——注册表只关心
   * 「state 是纯 JSON + 能通过 stateSchema」，多出的字段是合法的。 */
  ctx.sessionProjections.register<'todoTiming', TodoTimingState>({
    key: 'todoTiming',
    stateSchema: todoTimingStateSchema,
    init: () => EMPTY_TIMING,
    apply: (state, event) => {
      if (event.type === 'turn/start') return EMPTY_TIMING
      if (event.type !== 'todo/write') return state
      return foldTiming(state, event.data.todos, event.time)
    },
    // 只把派生计时发给客户端；lastStatus 是宿主侧跃迁判断用的内部账本。
    wire: {
      viewSchema: todoTimingWireSchema,
      view: state => ({
        entries: state.entries,
        ...state.startedAt === undefined ? {} : { startedAt: state.startedAt },
      }),
    },
    stateVersion: 1,
  })
  ctx.tools.register(defineTool({
    name: 'todo_write',
    description: describe(allowParallel),
    parameters: {
      todos: {
        type: 'array',
        required: true,
        description: 'The COMPLETE task list, replacing any previous list.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            content: { type: 'string', required: true, description: 'What the task is — a short imperative line.' },
            status: {
              type: 'string',
              required: true,
              enum: [...STATUSES],
              description: 'pending (not started) | in_progress (now) | completed (done).',
            },
            /* HeightLab（2026-11-15）：三个可选展示字段，见 TodoItem 注释。 */
            result: {
              type: 'string',
              description: 'When completed: ONE sentence with the conclusion this step produced (shown under the step).',
            },
            activeForm: {
              type: 'string',
              description: 'When in_progress: what you are doing RIGHT NOW, more specific than the step name (e.g. "正在生成第 4/6 张").',
            },
            error: {
              type: 'string',
              description: 'When the step failed: one short sentence with the cause (renders the step as failed).',
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          todos: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: [...STATUSES] },
                /* HeightLab：回显模型写入的展示字段（它是「模型以为自己写了什么」
                 * 的镜像；缺省不占键，保持与上游输出形状兼容）。 */
                result: { type: 'string' },
                activeForm: { type: 'string' },
                error: { type: 'string' },
              },
            },
          },
          counts: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              pending: { type: 'integer', required: true },
              inProgress: { type: 'integer', required: true },
              completed: { type: 'integer', required: true },
            },
          },
        },
      },
      /* HeightLab：结果文案带上「下一步做什么」的提示，让模型自然形成
       * 「完成一步 → 立刻写下结论 → 推进下一步」的节奏。 */
      render: (_args, value) => {
        const active = (value.todos as readonly TodoItem[]).find(item => item.status === 'in_progress')
        const hint = active === undefined
          ? ''
          : ` Next: ${active.content}${active.activeForm === undefined ? '' : ` — ${active.activeForm}`}`
        return [{
          type: 'text',
          text: `Updated todo list: ${value.counts.pending} pending, ${value.counts.inProgress} in progress, ${value.counts.completed} completed.${hint}`,
        }]
      },
    },
    execute(args, exec) {
      const todos = toTodoList(args.todos, allowParallel)
      if (!exec.agent) {
        // The list is per-agent-session state; a non-agent caller (no owning
        // session) has nowhere to write it. Reject rather than silently no-op.
        throw new Error('todo_write requires an owning agent session')
      }
      exec.agent.session.append('todo/write', { todos })
      const count = (status: TodoItem['status']): number => todos.filter(t => t.status === status).length
      return Promise.resolve({
        /* 镜像模型写入的完整条目（含展示字段），让「模型以为写了什么」与
         * 存档快照一致——上游注释的 schema 边界承诺。 */
        todos: todos.map(todo => ({
          content: todo.content,
          status: todo.status,
          ...todo.result === undefined ? {} : { result: todo.result },
          ...todo.activeForm === undefined ? {} : { activeForm: todo.activeForm },
          ...todo.error === undefined ? {} : { error: todo.error },
        })),
        counts: {
          pending: count('pending'),
          inProgress: count('in_progress'),
          completed: count('completed'),
        },
      })
    },
    presentCall: args => ({ card: 'generic', title: 'Update todo list', kind: 'other', rawInput: args.todos }),
  }))
}
