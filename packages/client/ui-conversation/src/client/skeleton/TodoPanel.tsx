import { useState } from 'react'
import clsx from 'clsx'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// The domain's client-namespace pure-type outlet: one import edge delivers
// the `todos` projection-key merge (single source, no consumer-side restated
// declare) and the payload type. Type-only by construction — the outlet is
// free of host value imports, so no host Context merge enters this program.
import type { TodoItem, TodoTiming, TodoTimingEntry } from '@deepseek-ai/dsh-tool-todo/client'
import {
  IconChecklistOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from '../locales.ts'
import css from './TodoPanel.module.css'

export interface TodoPanelProps {
  /** The session's current plan (empty renders nothing) — selected by the dock adapter. */
  todos: readonly TodoItem[]
  /**
   * HeightLab（2026-11-15）：派生计时（`todoTiming` 投影）。由宿主按事件时间
   * 算出，模型不参与；缺失时步骤行不显示耗时（不占位）。
   */
  timing?: TodoTiming | undefined
  /** The dock entry's locale seat, passed down as a plain prop. */
  t: TodoDockProps['t']
  /**
   * HeightLab 2026-11-05（0.5.6，用户拍板方案 A）：「继续执行」收进任务条。
   * 原先是输入框上方一条全宽黑横条（用户实测反馈「太丑了」，且违反
   * 「底栏零占位零弹出」铁律）——现在降级为进度条右侧的小 pill，
   * 有未完成项且输入空闲时才出现。
   */
  showContinue?: boolean
  onContinue?: () => void
}

/** Local exhaustiveness helper — client packages do not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable todo status: ${String(value)}`)
}

/** Map Todo lifecycle state onto the shared compact status language. */
function statusDotState(status: TodoItem['status']): StateDotState {
  switch (status) {
    case 'completed': return 'done'
    case 'in_progress': return 'ongoing'
    case 'pending': return 'idle'
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Return the localized status announced beside one decorative marker. */
function statusLabel(status: TodoItem['status'], t: TodoPanelProps['t']): string {
  switch (status) {
    case 'completed': return t('todo.status.completed')
    case 'in_progress': return t('todo.status.inProgress')
    case 'pending': return t('todo.status.pending')
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos: readonly TodoItem[], t: TodoPanelProps['t']): string {
  const done = todos.filter(item => item.status === 'completed').length
  const active = todos.filter(item => item.status === 'in_progress').length
  const failed = todos.filter(item => item.error !== undefined && item.status !== 'completed').length
  const pending = todos.length - done - active - failed
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...failed > 0 ? [t('todo.progress.failed', { failed })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
  ].join('\u2002·\u2002')
}

/**
 * HeightLab（2026-11-15）：耗时的展示口径。
 *
 * 数据来自 `todoTiming` 投影（按事件时间派生，模型不参与），因此这里只需要
 * 把毫秒差格式化成「32 秒」「1 分 12 秒」。缺任一边界 → 返回 undefined（不渲染）。
 * @param entry - 该步骤的计时。
 * @param t - 会话翻译器。
 * @returns 可展示的耗时文案，或 undefined。
 */
function elapsedLabel(
  entry: TodoTimingEntry | undefined,
  t: TodoPanelProps['t'],
): string | undefined {
  if (entry?.startedAt === undefined || entry.finishedAt === undefined) return undefined
  const seconds = Math.max(0, Math.round((entry.finishedAt - entry.startedAt) / 1000))
  if (seconds < 60) return t('todo.elapsed.seconds', { n: seconds })
  return t('todo.elapsed.minutes', { m: Math.floor(seconds / 60), s: seconds % 60 })
}

/** One step's visual state — status plus the orthogonal failure flag. */
type StepState = 'done' | 'active' | 'failed' | 'pending'

/**
 * Resolve the display state of one step.
 *
 * HeightLab：失败是**正交**于 status 的（见 TodoItem.error 注释），所以先判
 * 失败再看 status —— 一个带 error 的步骤无论 status 是 pending 还是
 * in_progress，都不该显示成「正在做」。
 * @param item - the todo entry.
 * @returns the display state.
 */
function stepState(item: TodoItem): StepState {
  if (item.error !== undefined && item.status !== 'completed') return 'failed'
  if (item.status === 'completed') return 'done'
  if (item.status === 'in_progress') return 'active'
  return 'pending'
}

export function TodoPanel({ todos, t, timing, showContinue = false, onContinue }: TodoPanelProps) {
  // HeightLab：有进行中项时自动展开（实时进度可见），全部完成或无活动时收起
  const active = todos.some(item => item.status === 'in_progress')
  const failed = todos.some(item => stepState(item) === 'failed')
  const [userToggled, setUserToggled] = useState<boolean | null>(null)
  /* HeightLab（2026-11-15）：失败时也自动展开——「卡住了但看不出来」是长任务
   * 最糟的体验，失败必须强制可见。 */
  const collapsed = userToggled ?? !(active || failed)

  if (todos.length === 0) return null

  const done = todos.filter(item => item.status === 'completed').length
  const allDone = done === todos.length

  return (
    <section className={css.root} data-testid="todo-panel" aria-label={t('todo.title')}>
      <div className={css.body}>
        {/* HeightLab（2026-11-15）：「继续」pill 必须与头部按钮**并列**，不能嵌在
         * 它里面——button 套 button 是非法 HTML，浏览器会把内层提出去，外层
         * 随之丢掉 button role（`getByRole('button')` 直接找不到）。原实现用
         * 行内 style 把它塞在 header 里，实测踩到这个可访问性缺陷。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={css.header}
            aria-expanded={!collapsed}
            onClick={() => { setUserToggled(!collapsed) }}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          >
            <span className={css.lead} aria-hidden><IconChecklistOutlineRegular /></span>
            <span className={css.title}>{t('todo.title')}</span>
            <span className={css.progress}>
              {allDone ? t('todo.allDone', { n: todos.length }) : progressLabel(todos, t)}
            </span>
            <span className={css.chevron} aria-hidden>
              {collapsed ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
            </span>
          </button>
          {showContinue && onContinue && (
            <button
              type="button"
              onClick={onContinue}
              style={{
                flexShrink: 0, padding: '2px 10px', borderRadius: 999,
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                lineHeight: '18px',
                background: 'var(--dsw-alias-button-primary-fill, #2eaadc)',
                color: 'var(--dsw-alias-label-primary-foreground, #fff)',
              }}
            >
              继续
            </button>
          )}
        </div>
        {/* HeightLab（2026-11-15）：分段进度条——每段一步，一眼看出做到第几步。 */}
        <div className={css.segments} aria-hidden>
          {todos.map((item, index) => {
            const state = stepState(item)
            const stateClass = state === 'done'
              ? css.segmentDone
              : state === 'failed'
                ? css.segmentFailed
                : state === 'active'
                  ? css.segmentActive
                  : ''
            return (
              <span
                key={`${item.content}-${index}`}
                className={clsx(css.segment, stateClass)}
                data-segment-state={state}
              />
            )
          })}
        </div>
        {!collapsed && (
          <ul className={css.list}>
            {todos.map((item, index) => {
              const state = stepState(item)
              const elapsed = elapsedLabel(timing?.entries[item.content], t)
              const showActiveForm = state === 'active' && item.activeForm !== undefined
              /* 结论只在已完成时展示；失败时把 error 当作结论行（标红）。 */
              const note = state === 'failed'
                ? item.error
                : state === 'done'
                  ? item.result
                  : undefined
              return (
                <li
                  key={`${item.content}-${index}`}
                  className={clsx(css.step, state === 'active' && css.stepActive)}
                  data-status={item.status}
                  data-state={state}
                >
                  <span className={css.glyph} role="img" aria-label={statusLabel(item.status, t)}>
                    <StateDot state={state === 'failed' ? 'error' : statusDotState(item.status)} />
                  </span>
                  <span className={css.stepBody}>
                    <span className={clsx(
                      css.stepTitle,
                      state === 'active' && css.stepTitleActive,
                      state === 'pending' && css.stepTitlePending,
                      state === 'failed' && css.stepTitleFailed,
                    )}>
                      {item.content}
                    </span>
                    {showActiveForm && (
                      <span className={css.activeForm}>
                        <span className={css.pulse} aria-hidden />
                        {item.activeForm}
                      </span>
                    )}
                    {note !== undefined && (
                      <span className={clsx(css.result, state === 'failed' && css.resultFailed)}>
                        {note}
                      </span>
                    )}
                  </span>
                  {elapsed !== undefined && <span className={css.elapsed}>{elapsed}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Props for the projected todo dock. */
export type TodoDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'conversation'>

/** Renders the current todo projection, or nothing when it is absent. */
export function TodoDock({ useProjection, t, inputActions, useInput }: TodoDockProps) {
  const todos = useProjection('todos') ?? []
  /* HeightLab（2026-11-15）：派生耗时。独立投影，缺失时步骤行不显示耗时。 */
  const timing = useProjection('todoTiming')
  const phase = useInput(state => state.phase)
  // HeightLab：任务未全部完成且输入空闲 → 提供"继续执行"一键续跑
  //（premature-end 场景：轮次提前结束但清单未完成，用户无需手打"继续"）。
  const hasOpen = todos.some(item => item.status !== 'completed')
  const idle = phase === 'plain'
  const showContinue = hasOpen && idle
  const continueRun = (): void => {
    if (!inputActions) return
    inputActions.setDraft('继续')
    inputActions.submit()
  }
  return (
    /* HeightLab 2026-11-05（0.5.6，用户拍板方案 A）：原「继续执行未完成任务」
     * 全宽黑横条已删（用户实测「太丑」+ 违反「底栏零占位零弹出」铁律），
     * 「继续」能力收进任务条头部进度条右侧的小 pill。 */
    <>
      <TodoPanel
        todos={todos}
        timing={timing}
        t={t}
        showContinue={showContinue}
        onContinue={continueRun}
      />
    </>
  )
}

/** Registers the projected todo dock. */
export const todoDockEntry = {
  name: 'conversation-todo-dock',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock))
  },
}
