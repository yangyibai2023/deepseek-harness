/**
 * 运营面板数据层单测（2026-11-12）
 *
 * 为什么这些必须测：T+N 快照与反哺基线是纯逻辑，出错会**静默产生错误的
 * 上下文喂给 Agent**——比 UI bug 危险得多（文案会照着错数据写）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
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

/* ── 今日行动队列（2026-11-16，O49 总览主区）────────────────────────
 * 规则必须确定性：同输入同输出，不许静默漏项——出错会让用户
 * 错过该采的 T+N 或该刷新的账号，比 UI bug 隐蔽。 */

import {
  MAX_ACTIONS,
  STALE_HOURS,
  buildActionItems,
  type OpsActionInput,
} from '../src/client/skeleton/HeightLabOpsActions.ts'

const NOW = 1_000_000_000_000

function input(patch: Partial<OpsActionInput> = {}): OpsActionInput {
  return {
    hasAnyData: true,
    syncedAts: { douyin: NOW - 1 * 3_600_000 },
    records: [],
    bench: [],
    ...patch,
  }
}

function publishRecord(publishedAt: number, snapshots: PublishRecord['snapshots'] = []): PublishRecord {
  return {
    id: `r-${String(publishedAt)}`,
    projectId: 'p1',
    provider: 'douyin',
    title: '直播背景测试',
    description: '',
    tags: [],
    publishedAt,
    snapshots,
  }
}

describe('buildActionItems（今日行动队列）', () => {
  it('没有任何数据时，唯一行动是引导添加账号（P0）', () => {
    const items = buildActionItems(input({ hasAnyData: false }), NOW)
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe('no-data')
    expect(items[0]!.level).toBe('p0')
  })

  it('T+N 到期未采排最前（P0），按欠采小时降序并统计剩余条数', () => {
    /* due1 已采 T+1h → 欠 T+6h；due2 全新 → 欠 T+1h。降序后 due1 排前。 */
    const due1 = publishRecord(NOW - 25 * 3_600_000, [
      { itemId: 'i1', at: NOW - 24 * 3_600_000, ageHours: 1 },
    ])
    const due2 = publishRecord(NOW - 2 * 3_600_000)
    const items = buildActionItems(input({ records: [due2, due1] }), NOW)
    expect(items[0]!.id).toBe(`tndue-${due1.id}`)
    expect(items[0]!.level).toBe('p0')
    expect(items[0]!.title).toContain('T+6h')
    expect(items[0]!.detail).toContain('还有 1 条待采')
  })

  it('T+N 全部采满时不出现 tndue 项', () => {
    const done = publishRecord(NOW - 200 * 3_600_000, [
      { itemId: 'i1', at: NOW - 199 * 3_600_000, ageHours: 1 },
      { itemId: 'i1', at: NOW - 194 * 3_600_000, ageHours: 6 },
      { itemId: 'i1', at: NOW - 176 * 3_600_000, ageHours: 24 },
      { itemId: 'i1', at: NOW - 128 * 3_600_000, ageHours: 72 },
      { itemId: 'i1', at: NOW - 32 * 3_600_000, ageHours: 168 },
    ])
    const items = buildActionItems(input({ records: [done] }), NOW)
    expect(items.some(i => i.id.startsWith('tndue-'))).toBe(false)
  })

  it('快照超过 48h 判陈旧（P1），多账号只报最旧的一个并计数', () => {
    const items = buildActionItems(input({
      syncedAts: { douyin: NOW - 72 * 3_600_000, shipinhao: NOW - 96 * 3_600_000 },
    }), NOW)
    const stale = items.find(i => i.id.startsWith('stale-'))
    expect(stale).toBeDefined()
    expect(stale!.level).toBe('p1')
    expect(stale!.title).toContain('视频号')
    expect(stale!.title).toContain('4 天')
    expect(stale!.detail).toContain('还有 1 个账号数据陈旧')
  })

  it('48h 以内不判陈旧', () => {
    const items = buildActionItems(input({
      syncedAts: { douyin: NOW - (STALE_HOURS - 1) * 3_600_000 },
    }), NOW)
    expect(items.some(i => i.id.startsWith('stale-'))).toBe(false)
  })

  it('有账号但近 7 天零发布 → 提醒（P2）', () => {
    const items = buildActionItems(input({ records: [publishRecord(NOW - 10 * 24 * 3_600_000)] }), NOW)
    const noPub = items.find(i => i.id === 'no-publish-week')
    expect(noPub).toBeDefined()
    expect(noPub!.level).toBe('p2')
  })

  it('近 7 天有发布则不提醒', () => {
    const items = buildActionItems(input({ records: [publishRecord(NOW - 2 * 24 * 3_600_000)] }), NOW)
    expect(items.some(i => i.id === 'no-publish-week')).toBe(false)
  })

  it('对标有待提取文案时给出 P2 建议', () => {
    const items = buildActionItems(input({ bench: [{ worksTotal: 5, withAsr: 2 }] }), NOW)
    const asr = items.find(i => i.id === 'bench-pending-asr')
    expect(asr).toBeDefined()
    expect(asr!.title).toContain('3 条')
  })

  it('深链（v2）：T+N 欠采落到该账号的发布监控分页', () => {
    const due = publishRecord(NOW - 25 * 3_600_000, [
      { itemId: 'i1', at: NOW - 24 * 3_600_000, ageHours: 1 },
    ])
    const items = buildActionItems(input({ records: [due] }), NOW)
    const tndue = items.find(i => i.id.startsWith('tndue-'))
    expect(tndue).toBeDefined()
    expect(tndue!.target).toEqual({ kind: 'detail', provider: 'douyin', tab: '发布监控' })
  })

  it('深链（v2）：数据陈旧落到该平台详情（数据概览），由父组件静默刷新', () => {
    const items = buildActionItems(input({
      syncedAts: { shipinhao: NOW - 72 * 3_600_000 },
    }), NOW)
    const stale = items.find(i => i.id.startsWith('stale-'))
    expect(stale).toBeDefined()
    expect(stale!.target).toEqual({ kind: 'detail', provider: 'shipinhao', tab: '数据概览' })
  })

  it('兜底项（无数据/零发布/对标提取）只切账号页，不带深链', () => {
    const noData = buildActionItems(input({ hasAnyData: false }), NOW)
    expect(noData[0]!.target).toEqual({ kind: 'accounts' })
    const noPub = buildActionItems(input({
      records: [publishRecord(NOW - 10 * 24 * 3_600_000)],
    }), NOW)
    expect(noPub.find(i => i.id === 'no-publish-week')!.target).toEqual({ kind: 'accounts' })
    const asr = buildActionItems(input({ bench: [{ worksTotal: 3, withAsr: 0 }] }), NOW)
    expect(asr.find(i => i.id === 'bench-pending-asr')!.target).toEqual({ kind: 'accounts' })
  })

  it('确定性：同输入两次生成结果完全一致', () => {
    const a = buildActionItems(input({ records: [publishRecord(NOW - 25 * 3_600_000)] }), NOW)
    const b = buildActionItems(input({ records: [publishRecord(NOW - 25 * 3_600_000)] }), NOW)
    expect(a).toEqual(b)
  })

  it('上限 5 条：多条规则同时命中时截断', () => {
    const records = Array.from({ length: 8 }, (_, i) => publishRecord(NOW - (30 + i * 10) * 3_600_000))
    const items = buildActionItems(input({
      records,
      bench: [{ worksTotal: 9, withAsr: 0 }],
      syncedAts: { douyin: NOW - 100 * 3_600_000 },
    }), NOW)
    expect(items.length).toBeLessThanOrEqual(MAX_ACTIONS)
  })
})

/* ── 后台调度器（2026-11-16，O49 P5 定时采集）────────────────────────
 * 「关着面板也采 T+N」的计划与回填逻辑必须可测——它们决定
 * 用户不在看的时候数据是否悄悄长出来。 */

import {
  dueRecordsByProvider,
  planBackgroundTargets,
} from '../src/client/skeleton/HeightLabOpsScheduler.ts'
import { backfillDueRecords } from '../src/client/skeleton/HeightLabOpsData.ts'
import type { PlatformSnapshot } from '../src/client/skeleton/HeightLabOpsPage.tsx'

const PROVIDER_IDS = [{ id: 'douyin' as const }, { id: 'shipinhao' as const }, { id: 'xhs' as const }]

function snap(syncedAt: number): PlatformSnapshot {
  return { syncedAt }
}

describe('planBackgroundTargets（后台同步计划）', () => {
  it('没快照的平台永远不调度（不替人扫码）', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {}, {}, NOW)
    expect(targets).toEqual([])
  })

  it('快照 >24h 触发保鲜同步（有欠采与否都触发）', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {
      douyin: snap(NOW - 25 * 3_600_000),
    }, {}, NOW)
    expect(targets).toEqual(['douyin'])
  })

  it('24h 内且没有欠采 → 不同步（不空打平台接口）', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {
      douyin: snap(NOW - 2 * 3_600_000),
    }, {}, NOW)
    expect(targets).toEqual([])
  })

  it('有欠采但快照够新（<15min）→ 不同步（回填 effect 已处理）', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {
      douyin: snap(NOW - 5 * 60_000),
    }, { douyin: true }, NOW)
    expect(targets).toEqual([])
  })

  it('有欠采且快照 >15min → 触发同步', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {
      douyin: snap(NOW - 20 * 60_000),
    }, { douyin: true }, NOW)
    expect(targets).toEqual(['douyin'])
  })

  it('多平台同时命中 → 全部列入', () => {
    const targets = planBackgroundTargets(PROVIDER_IDS, {
      douyin: snap(NOW - 30 * 3_600_000),
      shipinhao: snap(NOW - 26 * 3_600_000),
      xhs: snap(NOW - 1 * 3_600_000),
    }, {}, NOW)
    expect(targets).toEqual(['douyin', 'shipinhao'])
  })
})

describe('dueRecordsByProvider', () => {
  it('只有欠采记录的平台标 true', () => {
    const due = dueRecordsByProvider([
      publishRecord(NOW - 2 * 3_600_000),                              // 欠 T+1h
      publishRecord(NOW - 200 * 3_600_000, [                           // 全采满
        { itemId: 'i', at: 0, ageHours: 1 }, { itemId: 'i', at: 0, ageHours: 6 },
        { itemId: 'i', at: 0, ageHours: 24 }, { itemId: 'i', at: 0, ageHours: 72 },
        { itemId: 'i', at: 0, ageHours: 168 },
      ]),
    ], NOW)
    expect(due).toEqual({ douyin: true })
  })
})

describe('backfillDueRecords（T+N 回填纯函数）', () => {
  it('标题包含匹配 → 合并新快照并标 changed', () => {
    const rec = publishRecord(NOW - 2 * 3_600_000)   // 欠 T+1h
    const { next, changed } = backfillDueRecords([rec], {
      douyin: [{ itemId: 'w1', title: '直播背景测试——完整版', plays: 1234 }],
    }, NOW)
    expect(changed).toBe(true)
    expect(next[0]!.snapshots.length).toBe(1)
    expect(next[0]!.snapshots[0]!.plays).toBe(1234)
  })

  it('标题匹配不上 → 不动（等下一次同步）', () => {
    const rec = publishRecord(NOW - 2 * 3_600_000)
    const { next, changed } = backfillDueRecords([rec], {
      douyin: [{ itemId: 'w1', title: '完全无关的标题', plays: 999 }],
    }, NOW)
    expect(changed).toBe(false)
    expect(next[0]).toEqual(rec)
  })

  it('不欠采的记录跳过（不重复计费不重复写）', () => {
    const full = publishRecord(NOW - 200 * 3_600_000, [
      { itemId: 'i', at: 0, ageHours: 1 }, { itemId: 'i', at: 0, ageHours: 6 },
      { itemId: 'i', at: 0, ageHours: 24 }, { itemId: 'i', at: 0, ageHours: 72 },
      { itemId: 'i', at: 0, ageHours: 168 },
    ])
    const { changed } = backfillDueRecords([full], {
      douyin: [{ itemId: 'w1', title: '直播背景测试', plays: 1 }],
    }, NOW)
    expect(changed).toBe(false)
  })
})

/* ── 对标与热点纯函数（2026-11-16，O49 对标/热点 tab）────────────────── */

import {
  addFeedback,
  addWatch,
  benchWorkScore,
  formatHotValue,
  hotSignalsFromBench,
  hotThreshold,
  isHotWork,
  loadSignals,
  median,
  removeFeedback,
  removeWatch,
} from '../src/client/skeleton/HeightLabOpsBench.ts'

describe('benchWorkScore（爆款判定公式 §4.22）', () => {
  it('赞×1 + 评×3 + 藏×4 + 转×5', () => {
    expect(benchWorkScore({ diggs: 10, comments: 2, collects: 3, shares: 1 })).toBe(10 + 6 + 12 + 5)
  })
  it('缺项按 0 计', () => {
    expect(benchWorkScore({ diggs: 5 })).toBe(5)
    expect(benchWorkScore({})).toBe(0)
  })
})

describe('median / hotThreshold', () => {
  it('奇偶中位数', () => {
    expect(median([1, 5, 9])).toBe(5)
    expect(median([1, 5, 9, 20])).toBe(7)
    expect(median([])).toBe(0)
  })
  it('阈值 = 中位数×2；空账号阈值无穷大（无爆款）', () => {
    expect(hotThreshold([{ diggs: 1 }, { diggs: 3 }, { diggs: 5 }])).toBe(6)
    expect(hotThreshold([])).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('isHotWork', () => {
  const works = [
    { diggs: 10 },   // score 10
    { diggs: 20 },   // score 20
    { diggs: 30 },   // score 30 → median(10,20,30)=20, 阈值 40
  ]
  it('高于 2×中位数判爆款', () => {
    expect(isHotWork({ diggs: 45 }, works)).toBe(true)
    expect(isHotWork({ diggs: 30 }, works)).toBe(false)
  })
  it('零分不算爆款（防全员 0 全灭/全爆）', () => {
    expect(isHotWork({}, works)).toBe(false)
  })
})

describe('hotSignalsFromBench（对标高表现信号）', () => {
  const bench = [{
    link: 'https://x', secUid: 's1', nickname: '对标A',
    works: [
      { awemeId: 'a1', desc: '新爆款', diggs: 100, firstSeenAt: NOW - 2 * 24 * 3_600_000, playUrl: 'https://v/1' },
      { awemeId: 'a2', desc: '老作品', diggs: 5, firstSeenAt: NOW - 30 * 24 * 3_600_000, playUrl: null },
      { awemeId: 'a3', desc: '新普通', diggs: 1, firstSeenAt: NOW - 1 * 24 * 3_600_000, playUrl: null },
      { awemeId: 'a4', desc: '垫中位', diggs: 2, firstSeenAt: NOW - 1 * 24 * 3_600_000, playUrl: null },
    ],
  }]
  it('只有近 7 天新出现的爆款进信号，分数降序', () => {
    const signals = hotSignalsFromBench(bench, NOW)
    expect(signals).toHaveLength(1)
    expect(signals[0]!.awemeId).toBe('a1')
    expect(signals[0]!.benchNickname).toBe('对标A')
    expect(signals[0]!.score).toBe(100)
  })
  it('missing 作品不参与判定', () => {
    const withMissing = [{
      link: 'l', secUid: 's', nickname: 'n',
      works: [
        { awemeId: 'm1', desc: '', diggs: 0, missing: true },
        { awemeId: 'm2', desc: '', diggs: 10, firstSeenAt: NOW - 1 * 24 * 3_600_000 },
      ],
    }]
    const signals = hotSignalsFromBench(withMissing, NOW)
    expect(signals.some(s => s.awemeId === 'm1')).toBe(false)
  })
})

describe('关注与反馈存储（localStorage 往返）', () => {
  it('addWatch/removeWatch 往返一致', () => {
    const s1 = addWatch('https://douyin.com/video/1', '好案例', NOW)
    expect(s1.watch).toHaveLength(1)
    expect(s1.watch[0]!.note).toBe('好案例')
    const s2 = removeWatch(s1.watch[0]!.id)
    expect(s2.watch).toHaveLength(0)
  })
  it('addFeedback/removeFeedback 往返一致', () => {
    const s1 = addFeedback('用户问怎么设置', NOW)
    expect(s1.feedback[0]!.text).toBe('用户问怎么设置')
    const s2 = removeFeedback(s1.feedback[0]!.id)
    expect(s2.feedback).toHaveLength(0)
  })
  it('loadSignals 空存储返回空骨架', () => {
    const s = loadSignals()
    expect(s.watch).toEqual([])
    expect(s.feedback).toEqual([])
  })
})

describe('formatHotValue', () => {
  it('≥1万 → xx万；否则原值；null 空串', () => {
    expect(formatHotValue(12_097_246)).toBe('1209.7万')
    expect(formatHotValue(9999)).toBe('9999')
    expect(formatHotValue(null)).toBe('')
  })
})

/* ── 选题池 + 对标自动监控（2026-11-17）──────────────────────────── */

import {
  addPoolItem,
  loadPool,
  poolPendingCount,
  removePoolItem,
  setPoolStatus,
} from '../src/client/skeleton/HeightLabOpsPool.ts'
import { BENCH_MONITOR_DEFAULT_H, planBenchCollects } from '../src/client/skeleton/HeightLabOpsScheduler.ts'

/* 本文件跑在 node 环境（无 window/localStorage）——存储层函数靠 window.localStorage
 * 持久化，这里给一个 Map 支撑的最小 mock，让「写入→重读」路径真实可测。 */
let resetStorage: () => void = () => {}
function mockLocalStorage(): void {
  let map = new Map<string, string>()
  resetStorage = () => { map = new Map<string, string>() }
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, v) },
      removeItem: (k: string) => { map.delete(k) },
    },
  }
}

describe('选题池（O49 §2.3 贯穿对象）', () => {
  mockLocalStorage()
  beforeEach(() => { resetStorage() })
  it('入池→候选态；同 sourceRef 重复入池只更新 note（幂等）', () => {
    const a = addPoolItem({ title: 'AI 工具实测', sourceType: 'bench', sourceRef: 'aw1', note: '对标A' }, NOW)
    expect(a).toHaveLength(1)
    expect(a[0]!.status).toBe('候选')
    const b = addPoolItem({ title: '改名后的标题', sourceType: 'bench', sourceRef: 'aw1', note: '新备注' }, NOW + 1)
    expect(b).toHaveLength(1)
    expect(b[0]!.note).toBe('新备注')
    expect(b[0]!.title).toBe('AI 工具实测')
  })

  it('三态流转 + 计数', () => {
    const a = addPoolItem({ title: 't1', sourceType: 'hot', sourceRef: 'h1' }, NOW)
    const id = a[0]!.id
    expect(poolPendingCount(a)).toBe(1)
    const b = setPoolStatus(id, '已用')
    expect(b[0]!.status).toBe('已用')
    expect(poolPendingCount(b)).toBe(0)
    const c = setPoolStatus(id, '放弃')
    expect(c[0]!.status).toBe('放弃')
    const d = setPoolStatus(id, '候选')
    expect(d[0]!.status).toBe('候选')
  })

  it('删除 + 空存储骨架', () => {
    const a = addPoolItem({ title: 'x', sourceType: 'feedback', sourceRef: 'f1' }, NOW)
    const b = removePoolItem(a[0]!.id)
    expect(b).toHaveLength(0)
    expect(loadPool()).toEqual([])
  })
})

describe('planBenchCollects（对标自动监控计划）', () => {
  interface AcctStub { link: string; syncedAt: number; monitor?: boolean; monitorIntervalH?: number }
  const acct = (link: string, syncedAt: number, monitor = true, intervalH?: number): AcctStub => ({
    link,
    syncedAt,
    ...(monitor ? { monitor: true } : {}),
    ...(intervalH !== undefined ? { monitorIntervalH: intervalH } : {}),
  })

  it('monitor 关闭不采，无论多久没同步', () => {
    expect(planBenchCollects([acct('a', NOW - 100 * 3_600_000, false)], NOW)).toEqual([])
  })

  it('默认 6h：6h 内不采，超过才采', () => {
    expect(planBenchCollects([acct('a', NOW - (BENCH_MONITOR_DEFAULT_H - 1) * 3_600_000)], NOW)).toEqual([])
    expect(planBenchCollects([acct('a', NOW - (BENCH_MONITOR_DEFAULT_H + 1) * 3_600_000)], NOW)).toEqual(['a'])
  })

  it('自定义频率优先', () => {
    expect(planBenchCollects([acct('a', NOW - 2 * 3_600_000, true, 1)], NOW)).toEqual(['a'])
    expect(planBenchCollects([acct('a', NOW - 2 * 3_600_000, true, 24)], NOW)).toEqual([])
  })

  it('多账号混合：只回到期的', () => {
    const out = planBenchCollects([
      acct('due', NOW - 10 * 3_600_000),
      acct('fresh', NOW - 1 * 3_600_000),
      acct('off', NOW - 100 * 3_600_000, false),
    ], NOW)
    expect(out).toEqual(['due'])
  })
})

/* ── 内容 tab 文案库（2026-11-17）──────────────────────────────────── */

import { asrLibrary } from '../src/client/skeleton/HeightLabOpsBench.ts'

describe('asrLibrary（文案库聚合）', () => {
  const bench = [{
    link: 'l1', secUid: 's1', nickname: '账号A',
    works: [
      { awemeId: 'a1', desc: '短的', asr: '短文案', lastSeenAt: NOW, playUrl: 'https://v/1' },
      { awemeId: 'a2', desc: '长的', asr: '这是一条明显更长的口播文案，应该有更靠前的排序位置。', lastSeenAt: NOW, playUrl: null },
      { awemeId: 'a3', desc: '没转写', asr: '', lastSeenAt: NOW },
      { awemeId: 'a4', desc: 'missing', asr: '不应出现', missing: true },
    ],
  }]

  it('只收有文案且未 missing 的作品，长度降序，playUrl 兜底拼视频链接', () => {
    const lib = asrLibrary(bench)
    expect(lib).toHaveLength(2)
    expect(lib[0]!.awemeId).toBe('a2')
    expect(lib[1]!.awemeId).toBe('a1')
    expect(lib[0]!.playUrl).toBe('https://www.douyin.com/video/a2')  /* playUrl 为 null 时兜底 */
    expect(lib[1]!.playUrl).toBe('https://v/1')  /* 有值保留 */
  })

  it('空账号/空库返回空数组', () => {
    expect(asrLibrary([])).toEqual([])
    expect(asrLibrary([{ link: 'x', secUid: '', nickname: 'n', works: [] }])).toEqual([])
  })
})
