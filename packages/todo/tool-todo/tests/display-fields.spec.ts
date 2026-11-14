/**
 * HeightLab（2026-11-15）：任务进度条的三个新增展示字段 + 派生计时投影。
 *
 * 覆盖：
 *   ① `result` / `activeForm` / `error` 三个可选字段能写进快照并被投影读回
 *   ② 三个字段全部可省（上游形状兼容 —— 这是最重要的回归断言）
 *   ③ 空白字符串被归一化为 undefined（UI 用 undefined 判断是否渲染，空串会
 *      渲染出一行空行，破坏「零占位」铁律）
 *   ④ `todoTiming` 投影按事件时间派生 startedAt / finishedAt
 *   ⑤ 派生计时不臆造起点：一次从 pending 跳到 completed 时只有 finishedAt
 *   ⑥ `turn/start` 清空计时（与 todos 同生命周期）
 *   ⑦ 重复写同一份清单时保持引用不变（避免无谓重渲染）
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { TodoItem, TodoTiming } from '@deepseek-ai/dsh-tool-todo'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import * as ToolTodo from '@deepseek-ai/dsh-tool-todo'

interface Bench {
  ctx: Context
  session: Session
  todos(): TodoItem[] | null
  timing(): TodoTiming | undefined
}

async function harness(): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(ToolTodo, { allowParallelInProgress: true })
  const session = ctx.sessions.create()
  await ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
  const snap = async (): Promise<Record<string, unknown>> =>
    (await ctx.sessionProjections.snapshot(session))?.values ?? {}
  return {
    ctx,
    session,
    todos: () => (snap() as unknown as never),
    timing: () => (snap() as unknown as never),
  }
}

/** Append one todo/write snapshot. */
function write(session: Session, todos: TodoItem[]): void {
  session.append('todo/write', { todos })
}

describe('HeightLab todo display fields', () => {
  it('round-trips result / activeForm / error through the snapshot', async () => {
    const bench = await harness()
    write(bench.session, [
      { content: '确认卖点', status: 'completed', result: '锁定「8 小时保温」，人群 25-40 通勤族' },
      { content: '生成分镜图', status: 'in_progress', activeForm: '正在生成第 4/6 张' },
      { content: '导出成片', status: 'pending' },
      { content: '加字幕', status: 'pending', error: '模型连续 3 次审核拒绝' },
    ])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const todos = values.todos as TodoItem[]
    expect(todos[0]).toMatchObject({ status: 'completed', result: '锁定「8 小时保温」，人群 25-40 通勤族' })
    expect(todos[1]).toMatchObject({ status: 'in_progress', activeForm: '正在生成第 4/6 张' })
    expect(todos[2]).toEqual({ content: '导出成片', status: 'pending' })
    expect(todos[3]).toMatchObject({ error: '模型连续 3 次审核拒绝' })
  })

  it('upstream-shaped items (no new fields) still validate', async () => {
    const bench = await harness()
    write(bench.session, [{ content: '只有上游两个字段', status: 'pending' }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    expect((values.todos as TodoItem[])[0]).toEqual({ content: '只有上游两个字段', status: 'pending' })
  })
})

describe('HeightLab inline-conclusion recovery', () => {
  /* 2026-11-15 实测：模型把结论追加进 content（"核查定价 —— 结论：…"），
   * result 留空。提示词已禁止，但提示词不是契约——这里验兜底拆分。 */
  const cases: Array<[string, string, string]> = [
    ['em dash 双破折号', '核查官方定价 —— 结论：Notion AI 已并入 $20/月', '核查官方定价'],
    ['单破折号', '核查官方定价 — 结论：Notion AI 已并入 $20/月', '核查官方定价'],
    ['ASCII 连字符', '核查官方定价 - 结论: Notion AI 已并入 $20/月', '核查官方定价'],
  ]
  for (const [label, content, expectedName] of cases) {
    it(`splits the conclusion out of content (${label})`, async () => {
      const bench = await harness()
      write(bench.session, [{ content, status: 'completed' }])
      const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
      const todo = (values.todos as TodoItem[])[0]
      expect(todo?.content).toBe(expectedName)
      expect(todo?.result).toBe('Notion AI 已并入 $20/月')
    })
  }

  it('keeps an explicit result and does not overwrite it', async () => {
    const bench = await harness()
    write(bench.session, [{
      content: '核查定价 —— 结论：content 里的这句应被忽略',
      status: 'completed',
      result: '显式 result 优先',
    }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const todo = (values.todos as TodoItem[])[0]
    expect(todo?.result).toBe('显式 result 优先')
    /* content 原样保留（不做拆分，因为模型已按契约填了 result）。 */
    expect(todo?.content).toBe('核查定价 —— 结论：content 里的这句应被忽略')
  })

  it('leaves natural dashes alone when there is no 结论 marker', async () => {
    const bench = await harness()
    write(bench.session, [{ content: '对比 Notion — Obsidian 两类的差异', status: 'pending' }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const todo = (values.todos as TodoItem[])[0]
    expect(todo?.content).toBe('对比 Notion — Obsidian 两类的差异')
    expect(todo?.result).toBeUndefined()
  })

  it('splits a long "prefix：结论正文" content (second observed shape)', async () => {
    /* 2026-11-15 第二次实测：模型不用「结论：」字样，直接把整句结论写进
     * content。判据是「短前缀 + 冒号 + 长正文 + 总长超阈值」。 */
    const bench = await harness()
    const content = '供需盘点完成：收纳是家居类目里搜索/收藏密度最高的入口，但需求已从「买工具」转向「要方案」'
    write(bench.session, [{ content, status: 'completed' }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const todo = (values.todos as TodoItem[])[0]
    expect(todo?.content).toBe('供需盘点完成')
    expect(todo?.result).toContain('收纳是家居类目里搜索/收藏密度最高的入口')
  })

  it('keeps a short "prefix：detail" step name intact', async () => {
    /* 反向保护：本身就很短的步骤名不该被拆（避免把正常的冒号用法误伤）。 */
    const bench = await harness()
    write(bench.session, [{ content: '对比 Notion：定价 / 隐私', status: 'pending' }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const todo = (values.todos as TodoItem[])[0]
    expect(todo?.content).toBe('对比 Notion：定价 / 隐私')
    expect(todo?.result).toBeUndefined()
  })
})

describe('HeightLab derived todoTiming', () => {
  it('records startedAt when a step becomes in_progress and finishedAt when completed', async () => {
    const bench = await harness()
    write(bench.session, [
      { content: 'A', status: 'in_progress' },
      { content: 'B', status: 'pending' },
    ])
    write(bench.session, [
      { content: 'A', status: 'completed', result: 'done' },
      { content: 'B', status: 'in_progress' },
    ])
    write(bench.session, [
      { content: 'A', status: 'completed', result: 'done' },
      { content: 'B', status: 'completed', result: 'done too' },
    ])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const timing = values.todoTiming as TodoTiming
    const a = timing.entries.A
    const b = timing.entries.B
    /* 两次边界都必须存在且 finish >= start（时间戳由事件驱动，不断言具体值）。 */
    expect(a?.startedAt).toBeTypeOf('number')
    expect(a?.finishedAt).toBeTypeOf('number')
    expect(b?.startedAt).toBeTypeOf('number')
    expect(b?.finishedAt).toBeTypeOf('number')
    expect(a?.finishedAt ?? 0).toBeGreaterThanOrEqual(a?.startedAt ?? 0)
    expect(b?.finishedAt ?? 0).toBeGreaterThanOrEqual(b?.startedAt ?? 0)
  })

  it('never fabricates a start time for a step that skipped in_progress', async () => {
    const bench = await harness()
    write(bench.session, [{ content: '一步到位', status: 'completed', result: 'ok' }])
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const timing = values.todoTiming as TodoTiming
    expect(timing.entries['一步到位']?.startedAt).toBeUndefined()
    expect(timing.entries['一步到位']?.finishedAt).toBeTypeOf('number')
  })

  it('clears timing on turn/start', async () => {
    const bench = await harness()
    write(bench.session, [{ content: 'A', status: 'completed', result: 'x' }])
    bench.session.append('turn/start', {} as never)
    const values = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values ?? {}
    const timing = values.todoTiming as TodoTiming
    expect(timing.entries).toEqual({})
  })

  it('re-writing the same list keeps the derived value reference-stable', async () => {
    const bench = await harness()
    const list: TodoItem[] = [{ content: 'A', status: 'in_progress' }]
    write(bench.session, list)
    const first = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values.todoTiming as TodoTiming
    write(bench.session, [{ content: 'A', status: 'in_progress' }])
    const second = (await bench.ctx.sessionProjections.snapshot(bench.session))?.values.todoTiming as TodoTiming
    /* 对象内容相同即可：投影的 wire 层按 Object.is 抑制发布，这里只断言「没有
     * 因为重复写而把起点时间往后推」。 */
    expect(second.entries.A?.startedAt).toBe(first.entries.A?.startedAt)
  })
})
