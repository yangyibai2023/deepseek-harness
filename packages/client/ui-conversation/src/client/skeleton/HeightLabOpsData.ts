/**
 * HeightLab 运营面板 · 项目与监控数据层（2026-11-12）
 *
 * ## 为什么需要这一层
 *
 * 用户要的闭环是：**发布 → 监控 → 数据反哺下一次文案**。
 * 反哺的前提是「Agent 能看到账号的历史表现」，而历史表现需要两样东西：
 *   ① **项目（Project）**：把「这批内容属于同一次营销活动」这个事实记下来
 *   ② **作品快照（WorkSnapshot[]）**：同一条作品在 T+1h/T+1d/T+7d 的表现曲线
 *
 * 单个「最新值」不够——它分不清「发布 1 小时就爆」和「三天才起来」，
 * 而这两种情况对下一次文案的指导意义完全相反。
 *
 * ## 存储
 *
 * 先用 localStorage（与账号快照同一层），体积可控：
 *   · 一个项目 ~200 字节
 *   · 一条作品快照 ~150 字节
 *   · 100 条作品 × 5 个时间点 ≈ 75KB
 *
 * 超过阈值（`MAX_BYTES`）时触发**摘要压缩**：只保留最新快照 + 首末两点。
 * 后续如需更强查询能力再迁 SQLite（已在评估清单里）。
 */

/* ── 类型 ──────────────────────────────────────────────────────────────── */

export type ProviderId = 'douyin' | 'shipinhao' | 'xhs' | 'bilibili'

/** 一条作品在某一时刻的表现 */
export interface WorkSnapshot {
  /** 平台侧作品 ID */
  itemId: string
  /** 快照时刻 */
  at: number
  /** 距发布多少小时（T+N 的 N） */
  ageHours: number
  plays?: number
  interactions?: number
  /** 完播率（0~1 小数） */
  completionRate?: number
}

/** 一次发布记录 */
export interface PublishRecord {
  /** 本地主键 */
  id: string
  projectId: string
  provider: ProviderId
  /** 平台侧 ID（发布后回填；发布前为空） */
  platformItemId?: string
  title: string
  description: string
  tags: string[]
  /** 发布时刻 */
  publishedAt: number
  /** 多次快照，按 at 升序 */
  snapshots: WorkSnapshot[]
}

/** 一个项目 = 一次营销活动 / 一批内容 */
export interface OpsProject {
  id: string
  name: string
  createdAt: number
  /** 关联账号（项目里用哪些号发） */
  accounts: { provider: ProviderId; nickname: string }[]
  /** 项目目标（写文案时作为上下文） */
  goal?: string
  /** 目标受众 */
  audience?: string
  /** 语气约束 */
  tone?: string
}

/* ── 存储 ──────────────────────────────────────────────────────────────── */

const PROJECTS_KEY = 'hl-ops-projects-v1'
const RECORDS_KEY = 'hl-ops-publish-records-v1'

/** 超过这个体量就触发快照压缩（localStorage 单域通常 5MB） */
const MAX_BYTES = 1_500_000

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    const s = JSON.stringify(value)
    if (s.length > MAX_BYTES) return false
    window.localStorage.setItem(key, s)
    return true
  } catch {
    return false
  }
}

export function loadProjects(): OpsProject[] {
  return readJson<OpsProject[]>(PROJECTS_KEY, [])
}

export function saveProjects(list: OpsProject[]): boolean {
  return writeJson(PROJECTS_KEY, list)
}

export function loadRecords(): PublishRecord[] {
  return readJson<PublishRecord[]>(RECORDS_KEY, [])
}

export function saveRecords(list: PublishRecord[]): boolean {
  return writeJson(RECORDS_KEY, list)
}

/* ── T+N 快照 ──────────────────────────────────────────────────────────── */

/** 标准观测点（小时）。发布后按这些时间点采样，形成曲线。 */
export const SNAPSHOT_HOURS = [1, 6, 24, 72, 168] as const

/**
 * 决定「现在该采哪个点」。
 *
 * 返回 null = 还不到下一个观测点（避免频繁打平台接口）。
 * 思路：找第一个「已经到达但还没采」的观测点。
 */
export function dueSnapshotHour(record: PublishRecord, now = Date.now()): number | null {
  const ageH = (now - record.publishedAt) / 3_600_000
  const taken = new Set(record.snapshots.map(s => s.ageHours))
  for (const h of SNAPSHOT_HOURS) {
    if (ageH >= h && !taken.has(h)) return h
  }
  return null
}

/**
 * 把新采到的作品数据合并进发布记录。
 *
 * ## 关键设计：按 itemId 匹配，不按标题
 *
 * 平台返回的作品标题可能被截断或改写，标题匹配不可靠；
 * `itemId` 是平台主键，唯一且稳定。
 */
export function mergeSnapshot(
  record: PublishRecord,
  work: { itemId: string; plays?: number; interactions?: number; completionRate?: number },
  now = Date.now(),
): PublishRecord {
  const ageHours = (now - record.publishedAt) / 3_600_000
  const point: WorkSnapshot = {
    itemId: work.itemId,
    at: now,
    ageHours,
  }
  if (work.plays !== undefined) point.plays = work.plays
  if (work.interactions !== undefined) point.interactions = work.interactions
  if (work.completionRate !== undefined) point.completionRate = work.completionRate

  /* 同一时刻只留一条（重复同步会覆盖而不是堆积） */
  const rest = record.snapshots.filter(s => Math.abs(s.ageHours - ageHours) > 0.5)
  const snapshots = [...rest, point].sort((a, b) => a.at - b.at)
  return { ...record, snapshots }
}

/**
 * 体量超限时的压缩：每条记录只保留「最早 + 最新」两个快照。
 *
 * 取舍依据：反哺文案需要的是**趋势**（涨得快还是慢），
 * 首末两点足以判断方向；中间点对文案指导价值低。
 */
export function compactRecords(list: PublishRecord[]): PublishRecord[] {
  return list.map(r => {
    if (r.snapshots.length <= 2) return r
    const first = r.snapshots[0]
    const last = r.snapshots[r.snapshots.length - 1]
    /* noUncheckedIndexedAccess：下标可能 undefined，必须显式收窄 */
    if (first === undefined || last === undefined) return r
    return { ...r, snapshots: [first, last] }
  })
}

/* ── 反哺：把账号历史表现编译成 Agent 上下文 ───────────────────────────── */

export interface AccountBaseline {
  provider: ProviderId
  nickname: string
  /** 平均播放量（有数据的作品） */
  avgPlays: number | null
  /** 平均完播率 */
  avgCompletion: number | null
  /** 表现最好的 3 条（标题 + 播放量） */
  topWorks: { title: string; plays: number }[]
  /** 数据样本量（作品数） */
  sampleSize: number
}

/**
 * 从「账号当前作品数据」归纳基线。
 *
 * 这是反哺的**第一阶段**（上下文注入）的输入：
 * 把「这个号过去什么内容有效」变成一段结构化提示，喂给写文案的 Agent。
 */
export function buildBaseline(
  provider: ProviderId,
  nickname: string,
  works: { title?: string; plays?: number; completionRate?: number }[],
): AccountBaseline {
  const withPlays = works.filter(w => typeof w.plays === 'number')
  const withComp = works.filter(w => typeof w.completionRate === 'number')

  const avg = (nums: number[]): number | null =>
    nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length

  const topWorks = [...withPlays]
    .sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))
    .slice(0, 3)
    .map(w => ({ title: (w.title ?? '').slice(0, 40), plays: w.plays ?? 0 }))

  return {
    provider,
    nickname,
    avgPlays: avg(withPlays.map(w => w.plays as number)),
    avgCompletion: avg(withComp.map(w => w.completionRate as number)),
    topWorks,
    sampleSize: withPlays.length,
  }
}

/**
 * 把基线渲染成**可直接注入 Agent 的文本**。
 *
 * 格式刻意用紧凑的中文短句而不是 JSON——JSON 会让模型把注意力
 * 放在结构上，短句更接近人类给同事的brief。
 */
export function renderBaselineForPrompt(b: AccountBaseline): string {
  const lines: string[] = []
  lines.push(`【账号历史表现 · ${b.provider}「${b.nickname}」】`)
  if (b.sampleSize === 0) {
    lines.push('（暂无足够作品数据，本账号按通用最佳实践处理）')
    return lines.join('\n')
  }
  if (b.avgPlays !== null) {
    lines.push(`近期均播：约 ${Math.round(b.avgPlays).toLocaleString('zh-CN')}`)
  }
  if (b.avgCompletion !== null) {
    lines.push(`平均完播率：${(b.avgCompletion * 100).toFixed(1)}%`)
  }
  if (b.topWorks.length > 0) {
    lines.push('表现最好的作品：')
    for (const w of b.topWorks) {
      lines.push(`  · ${w.title || '(无标题)'} — ${w.plays.toLocaleString('zh-CN')} 播放`)
    }
  }
  lines.push('（以上为账号实测数据，写文案时优先沿用已验证有效的题材与结构）')
  return lines.join('\n')
}
