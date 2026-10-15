import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// The domain's client-namespace pure-type outlet: one import edge delivers
// the `todos` projection-key merge (single source, no consumer-side restated
// declare) and the payload type. Type-only by construction — the outlet is
// free of host value imports, so no host Context merge enters this program.
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import {
  IconChecklistOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from '../locales.ts'
import css from './TodoPanel.module.css'

export interface TodoPanelProps {
  /** The session's current plan (empty renders nothing) — selected by the dock adapter. */
  todos: readonly TodoItem[]
  /** The dock entry's locale seat, passed down as a plain prop. */
  t: TodoDockProps['t']
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
  const pending = todos.length - done - active
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
  ].join('\u2002·\u2002')
}

export function TodoPanel({ todos, t }: TodoPanelProps) {
  // HeightLab：有进行中项时自动展开（实时进度可见），全部完成或无活动时收起
  const active = todos.some(item => item.status === 'in_progress')
  const done = todos.filter(item => item.status === 'completed').length
  const percent = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0
  const [userToggled, setUserToggled] = useState<boolean | null>(null)
  const collapsed = userToggled ?? !active

  if (todos.length === 0) return null

  return (
    <section className={css.root} data-testid="todo-panel" aria-label={t('todo.title')}>
      <div className={css.body}>
        <button
          type="button"
          className={css.header}
          aria-expanded={!collapsed}
          onClick={() => { setUserToggled(!collapsed) }}
        >
          <span className={css.lead} aria-hidden><IconChecklistOutlineRegular /></span>
          <span className={css.title}>{t('todo.title')}</span>
          <span className={css.progress}>{progressLabel(todos, t)}</span>
          <span className={css.chevron} aria-hidden>
            {collapsed ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
          </span>
        </button>
        {/* HeightLab：总进度条（完成占比） */}
        <div
          style={{
            height: 3, borderRadius: 2, overflow: 'hidden',
            background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,0.2))',
          }}
          aria-hidden
        >
          <div style={{
            width: `${percent}%`, height: '100%',
            background: active ? 'var(--dsw-alias-button-primary-fill, #2eaadc)' : '#27ae60',
            transition: 'width 300ms ease',
          }} />
        </div>
        {!collapsed && (
          <ul className={css.list}>
            {todos.map(item => (
              <li key={item.content} className={css.item} data-status={item.status}>
                <span className={css.glyph} role="img" aria-label={statusLabel(item.status, t)}>
                  <StateDot state={statusDotState(item.status)} />
                </span>
                <span className={css.content} style={item.status === 'in_progress' ? {
                  color: 'var(--dsw-alias-label-primary-foreground, inherit)',
                  fontWeight: 600,
                } : undefined}>{item.content}</span>
              </li>
            ))}
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
    <>
      <TodoPanel todos={todos} t={t} />
      {showContinue && (
        <button
          type="button"
          onClick={continueRun}
          style={{
            width: '100%', padding: '7px 12px', marginTop: 6, borderRadius: 10,
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: 'var(--dsw-alias-button-primary-fill, #2eaadc)',
            color: 'var(--dsw-alias-label-primary-foreground, #fff)',
          }}
        >
          继续执行未完成任务
        </button>
      )}
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
