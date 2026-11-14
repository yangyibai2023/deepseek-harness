// @vitest-environment jsdom
/**
 * Todo display acceptance: the TodoPanel plan strip (empty-hidden, status rows
 * including several `in_progress` at once, collapse), and its TodoDock
 * adapter (selects the plan off the session snapshot and follows changes).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { TodoDockProps } from '../src/client/skeleton/TodoPanel.tsx'
import { TodoDock, TodoPanel, todoDockEntry } from '../src/client/skeleton/TodoPanel.tsx'
import { NS, zh } from '../src/client/locales.ts'

const t: TodoDockProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

const LIST: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

/** A parallel plan: three tasks running at once (concurrent subagents). */
const PARALLEL: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '跑后台构建', status: 'in_progress' },
  { content: '读源码', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

describe('TodoPanel', () => {
  it('renders nothing while the list is empty', () => {
    const { container } = render(<TodoPanel todos={[]} t={t} />)
    expect(container.innerHTML).toBe('')
  })

  it('auto-expands while a step is in progress, with the per-status summary', () => {
    /* HeightLab（2026-11-15）：LIST 含 in_progress → 按既有设计自动展开
     *（「有进行中项时自动展开，实时进度可见」）。原断言写成「默认收起」是因为
     * 当时的旧行为，本次按实际语义校正。 */
    render(<TodoPanel todos={LIST} t={t} />)
    expect(screen.getByTestId('todo-panel')).toBeTruthy()
    expect(screen.getByText('任务')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('omits the completed segment while nothing is done yet', () => {
    render(<TodoPanel todos={[
      { content: '写组件', status: 'in_progress' },
      { content: '补测试', status: 'pending' },
    ]} t={t} />)
    expect(screen.getByText('1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText(/已完成/)).toBeNull()
  })

  it('shows one row per item with its status glyph', () => {
    render(<TodoPanel todos={LIST} t={t} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(screen.getByText('搭骨架')).toBeTruthy()
    expect(screen.getByText('写组件')).toBeTruthy()
    /* 行状态用 panel 自己的后缀（active/pending），不是 StateDot 的 ongoing/idle。 */
    expect(items.map(li => li.getAttribute('data-state'))).toEqual(['done', 'active', 'pending'])
    expect(screen.getAllByRole('img').map(node => node.getAttribute('aria-label')))
      .toEqual(['已完成', '进行中', '待处理'])
  })

  it('collapse hides the list; expand restores; header keeps the count summary', () => {
    render(<TodoPanel todos={LIST} t={t} />)
    /* 自动展开态下先收起，再展开回来。 */
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.queryByRole('list')).toBeNull()
    // Collapsed header is title + progress only (no in-progress content hint).
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText('写组件')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('marks every parallel active item, and counts them all in the header', () => {
    render(<TodoPanel todos={PARALLEL} t={t} />)
    // An unconditional in-progress cap would make this list unreachable: three
    // items carry the in-progress glyph at once, and the header counts all three.
    const statuses = screen.getAllByRole('listitem').map(li => li.getAttribute('data-status'))
    expect(statuses.filter(s => s === 'in_progress')).toHaveLength(3)
    expect(screen.getByText('跑后台构建')).toBeTruthy()
    expect(screen.getByText('读源码')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 3 进行中 · 1 待处理')).toBeTruthy()
  })

  it('an all-completed list collapses to the done summary alone', () => {
    render(<TodoPanel todos={[{ content: '都完了', status: 'completed' }]} t={t} />)
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByText('都完了')).toBeNull()
    /* HeightLab：全部完成时头部改说「N 步全部完成」（比「1 已完成」更像收尾）。 */
    expect(screen.getByText('1 步全部完成')).toBeTruthy()
    expect(screen.queryByText(/进行中|待处理/)).toBeNull()
  })

  /* ══ HeightLab（2026-11-15）新增能力的验收 ═══════════════════════════ */

  it('shows the per-step result under a completed step', () => {
    render(<TodoPanel todos={[
      { content: '确认卖点', status: 'completed', result: '锁定「8 小时保温」，人群通勤族' },
      { content: '写脚本', status: 'in_progress' },
    ]} t={t} />)
    expect(screen.getByText('锁定「8 小时保温」，人群通勤族')).toBeTruthy()
  })

  it('shows activeForm for the in-progress step only', () => {
    render(<TodoPanel todos={[
      { content: '生成分镜图', status: 'in_progress', activeForm: '正在生成第 4/6 张' },
      { content: '导出', status: 'pending', activeForm: '不该显示' },
    ]} t={t} />)
    expect(screen.getByText('正在生成第 4/6 张')).toBeTruthy()
    expect(screen.queryByText('不该显示')).toBeNull()
  })

  it('renders a failed step as failed, shows the cause, and auto-expands', () => {
    render(<TodoPanel todos={[
      { content: '生成分镜图', status: 'in_progress', error: '模型连续 3 次审核拒绝' },
      { content: '导出', status: 'pending' },
    ]} t={t} />)
    /* 失败必须强制可见——即使没有任何 in_progress 也展开。 */
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.getAttribute('data-state')).toBe('failed')
    expect(screen.getByText('模型连续 3 次审核拒绝')).toBeTruthy()
    /* 失败计入头部计数，而不是被算成「进行中」。 */
    expect(screen.getByText(/1 失败/)).toBeTruthy()
  })

  it('shows per-step elapsed time from the derived timing projection', () => {
    const startedAt = 1_000_000
    render(
      <TodoPanel
        todos={[
          { content: '写脚本', status: 'completed', result: 'ok' },
          { content: '生成分镜图', status: 'in_progress' },
        ]}
        timing={{ entries: { 写脚本: { startedAt, finishedAt: startedAt + 72_000 } } }}
        t={t}
      />,
    )
    expect(screen.getByText('1 分 12 秒')).toBeTruthy()
    /* 没有计时的步骤不渲染耗时（零占位）。 */
    expect(screen.queryByText(/0 秒/)).toBeNull()
  })

  it('renders one progress segment per step, marking done/active states', () => {
    render(<TodoPanel todos={LIST} t={t} />)
    const segments = screen.getByTestId('todo-panel').querySelectorAll('[data-segment-state]')
    expect(segments.length).toBe(LIST.length)
    expect([...segments].map(node => node.getAttribute('data-segment-state')))
      .toEqual(['done', 'active', 'pending'])
  })
})

/**
 * Dock props stub. HeightLab（2026-11-15）：`useProjection` 现在要服务两个 key
 * （`todos` 与派生的 `todoTiming`），`useInput` 也参与「继续」pill 的显隐。
 * 这里按 key 分发：未知 key 返回 undefined（与真实投影缺失时一致）。
 */
function dockProps(
  store: ReturnType<typeof createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>>,
  timingStore?: ReturnType<typeof createSnapshotStore<{ value: unknown }>>,
): TodoDockProps {
  const useProjection = (key: string, selector?: (v: unknown) => unknown) => {
    /* `todoTiming` 是本次新增的派生投影：没有 timingStore 时返回 undefined，
     * 与「宿主还没算出计时」的真实状态一致（步骤行不显示耗时）。 */
    if (key === 'todoTiming') {
      if (timingStore === undefined) return undefined
      return bindSnapshotSelector(timingStore)(s => (selector ?? (v => v))(s.value))
    }
    return bindSnapshotSelector(store)(s => (selector ?? (v => v))(s.value))
  }
  /* 「继续」pill 只在输入空闲（phase === 'plain'）时出现；测试固定为空闲。 */
  const useInput = (selector: (state: { phase: string }) => unknown) => selector({ phase: 'plain' })
  return { useProjection, useInput, t } as unknown as TodoDockProps
}

describe('TodoDock', () => {
  it('reads the host-computed todos projection and follows pushed updates', () => {
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: undefined })
    render(<TodoDock {...dockProps(store)} />)
    // Capability absent (no baseline/frame yet) renders nothing.
    expect(screen.queryByTestId('todo-panel')).toBeNull()
    act(() => { store.set({ value: LIST }) })
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    // The pre-first-write whole value (null) retires the strip (the panel owns no data).
    act(() => { store.set({ value: null }) })
    expect(screen.queryByTestId('todo-panel')).toBeNull()
  })

  it('registers before the goal and queue entries', () => {
    expect(todoDockEntry.name).toBe('conversation-todo-dock')
    expect(todoDockEntry.inject).toEqual(['slots'])
    const register = vi.fn(() => () => undefined)
    const inject = vi.fn((_name: string, callback: () => () => void) => callback())
    todoDockEntry.apply({ slots: { inject, register } } as never)
    expect(inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(register).toHaveBeenCalledWith({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock)
  })
})
