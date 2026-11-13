/**
 * 运营面板数据层单测（2026-11-12）
 *
 * 为什么这些必须测：T+N 快照与反哺基线是纯逻辑，出错会**静默产生错误的
 * 上下文喂给 Agent**——比 UI bug 危险得多（文案会照着错数据写）。
 */
import { describe, expect, it } from 'vitest'
import {
  SNAPSHOT_HOURS,
  buildBaseline,
  compactRecords,
  dueSnapshotHour,
  mergeSnapshot,
  renderBaselineForPrompt,
  type PublishRecord,
} from '../src/client/skeleton/HeightLabOpsData.ts'

const HOUR = 3_600_000

function record(publishedAt: number, snapshots: PublishRecord['snapshots'] = []): PublishRecord {
  return {
    id: 'r1',
    projectId: 'p1',
    provider: 'douyin',
    title: '测试',
    description: '',
    tags: [],
    publishedAt,
    snapshots,
  }
}

describe('dueSnapshotHour', () => {
  it('刚发布时不到第一个观测点，返回 null', () => {
    const now = 1_000_000_000_000
    expect(dueSnapshotHour(record(now - 0.5 * HOUR), now)).toBeNull()
  })

  it('到达 T+1h 时返回 1', () => {
    const now = 1_000_000_000_000
    expect(dueSnapshotHour(record(now - 1.2 * HOUR), now)).toBe(1)
  })

  it('已采过 T+1h 就跳到下一个未采的点', () => {
    const now = 1_000_000_000_000
    const r = record(now - 7 * HOUR, [
      { itemId: 'x', at: now - 6 * HOUR, ageHours: 1 },
    ])
    expect(dueSnapshotHour(r, now)).toBe(6)
  })

  it('所有观测点都采过后返回 null（不再打扰平台）', () => {
    const now = 1_000_000_000_000
    const taken = SNAPSHOT_HOURS.map(h => ({ itemId: 'x', at: now, ageHours: h }))
    expect(dueSnapshotHour(record(now - 200 * HOUR, taken), now)).toBeNull()
  })
})

describe('mergeSnapshot', () => {
  it('按 itemId 合并出带 ageHours 的快照', () => {
    const now = 1_000_000_000_000
    const r = record(now - 2 * HOUR)
    const out = mergeSnapshot(r, { itemId: 'v1', plays: 100, completionRate: 0.24 }, now)
    expect(out.snapshots).toHaveLength(1)
    expect(out.snapshots[0]?.itemId).toBe('v1')
    expect(out.snapshots[0]?.ageHours).toBeCloseTo(2, 1)
    expect(out.snapshots[0]?.plays).toBe(100)
    expect(out.snapshots[0]?.completionRate).toBe(0.24)
  })

  it('同一时刻重复同步不会堆积（覆盖而非追加）', () => {
    const now = 1_000_000_000_000
    const r = record(now - 2 * HOUR)
    const once = mergeSnapshot(r, { itemId: 'v1', plays: 100 }, now)
    const twice = mergeSnapshot(once, { itemId: 'v1', plays: 150 }, now)
    expect(twice.snapshots).toHaveLength(1)
    expect(twice.snapshots[0]?.plays).toBe(150)
  })

  it('不同时刻生成多条，且按时间升序', () => {
    const now = 1_000_000_000_000
    let r = record(now - 30 * HOUR)
    r = mergeSnapshot(r, { itemId: 'v1', plays: 10 }, now - 29 * HOUR)
    r = mergeSnapshot(r, { itemId: 'v1', plays: 80 }, now - 24 * HOUR)
    r = mergeSnapshot(r, { itemId: 'v1', plays: 300 }, now)
    expect(r.snapshots).toHaveLength(3)
    const ages = r.snapshots.map(s => s.ageHours)
    expect(ages).toEqual([...ages].sort((a, b) => a - b))
  })
})

describe('compactRecords', () => {
  it('超过 2 条快照时只留首末两点', () => {
    const now = 1_000_000_000_000
    const r = record(now - 200 * HOUR, [
      { itemId: 'v', at: now - 199 * HOUR, ageHours: 1 },
      { itemId: 'v', at: now - 170 * HOUR, ageHours: 30 },
      { itemId: 'v', at: now - 100 * HOUR, ageHours: 100 },
      { itemId: 'v', at: now, ageHours: 200 },
    ])
    const out = compactRecords([r])
    expect(out[0]?.snapshots).toHaveLength(2)
    expect(out[0]?.snapshots[0]?.ageHours).toBe(1)
    expect(out[0]?.snapshots[1]?.ageHours).toBe(200)
  })

  it('不足 2 条时原样返回', () => {
    const now = 1_000_000_000_000
    const r = record(now, [{ itemId: 'v', at: now, ageHours: 0 }])
    expect(compactRecords([r])[0]?.snapshots).toHaveLength(1)
  })
})

describe('buildBaseline（反哺输入）', () => {
  it('算均播与平均完播率，并取播放最高的 3 条', () => {
    const b = buildBaseline('douyin', '测试号', [
      { title: 'A', plays: 1000, completionRate: 0.2 },
      { title: 'B', plays: 3000, completionRate: 0.3 },
      { title: 'C', plays: 500, completionRate: 0.1 },
      { title: 'D', plays: 2000, completionRate: 0.25 },
    ])
    expect(b.sampleSize).toBe(4)
    expect(b.avgPlays).toBe(1625)
    expect(b.avgCompletion).toBeCloseTo(0.2125, 4)
    expect(b.topWorks.map(w => w.title)).toEqual(['B', 'D', 'A'])
  })

  it('没有播放数据时均值为 null，不伪造成 0', () => {
    const b = buildBaseline('douyin', '空号', [{ title: 'X' }])
    expect(b.sampleSize).toBe(0)
    expect(b.avgPlays).toBeNull()
    expect(b.avgCompletion).toBeNull()
  })
})

describe('renderBaselineForPrompt', () => {
  it('有数据时渲染出账号名、均播、完播率与 TOP 作品', () => {
    const text = renderBaselineForPrompt({
      provider: 'douyin',
      nickname: 'Colin的Ai局',
      avgPlays: 12345,
      avgCompletion: 0.2414,
      topWorks: [{ title: 'AI工具实测', plays: 52000 }],
      sampleSize: 10,
    })
    expect(text).toContain('Colin的Ai局')
    expect(text).toContain('12,345')
    expect(text).toContain('24.1%')
    expect(text).toContain('AI工具实测')
    expect(text).toContain('52,000')
  })

  it('无数据时明确说「暂无足够数据」，不让 Agent 编造规律', () => {
    const text = renderBaselineForPrompt({
      provider: 'douyin',
      nickname: '空号',
      avgPlays: null,
      avgCompletion: null,
      topWorks: [],
      sampleSize: 0,
    })
    expect(text).toContain('暂无足够作品数据')
    /* 关键：不能出现任何像「均播 xx」的编造数字 */
    expect(text).not.toMatch(/均播[:：]/)
  })
})
