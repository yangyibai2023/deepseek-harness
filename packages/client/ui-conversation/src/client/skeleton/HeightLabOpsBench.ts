/**
 * HeightLab 运营面板 · 对标与热点纯函数层（2026-11-16，O49）
 *
 * 对标 tab：爆款判定 + 作者作品排序 + 对标高表现信号
 * 热点 tab：手动关注 + 用户反馈的本地存储
 *
 * 全部纯函数/纯存储操作，与 React 无关、与平台无关——可单测。
 * 爆款判定公式沿用设计方案 §4.22（见舟算法，用户拍板「直接用」）：
 *   综合分 = 赞×1 + 评×3 + 藏×4 + 转×5
 *   爆款   = 综合分 ≥ 全账号作品综合分的中位数 × 2
 */

/* ── 爆款判定 ──────────────────────────────────────────────────────────── */

/** 一条作品算综合分所需的最小结构（BenchWork 满足） */
export interface ScorableWork {
  diggs?: number | null
  comments?: number | null
  collects?: number | null
  shares?: number | null
}

/** 设计方案 §4.22 公式：赞×1 + 评×3 + 藏×4 + 转×5。缺项按 0 计。 */
export function benchWorkScore(w: ScorableWork): number {
  return (w.diggs ?? 0) + 3 * (w.comments ?? 0) + 4 * (w.collects ?? 0) + 5 * (w.shares ?? 0)
}

/** 中位数（作品数 0 → 0，避免除零） */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  /* noUncheckedIndexedAccess：显式收窄（仓规禁 ! 断言） */
  const a = sorted[mid]
  if (a === undefined) return 0
  if (sorted.length % 2 === 1) return a
  const b = sorted[mid - 1]
  return (a + (b ?? a)) / 2
}

/** 账号内爆款阈值 = 中位数 × 2；账号没有作品时阈值无穷大（ nothing is hot ） */
export function hotThreshold(works: ScorableWork[]): number {
  if (works.length === 0) return Number.POSITIVE_INFINITY
  return median(works.map(benchWorkScore)) * 2
}

/** 是否爆款。边界：分数为 0 不算（防止全员 0 分时全灭/全爆） */
export function isHotWork(w: ScorableWork, works: ScorableWork[]): boolean {
  const score = benchWorkScore(w)
  return score > 0 && score >= hotThreshold(works)
}

/* ── 对标高表现信号（进热点 tab 信号流） ───────────────────────────────── */

export interface BenchHotSignal {
  benchKey: string
  benchNickname: string
  awemeId: string
  desc: string
  score: number
  plays: number | null
  webUrl: string
  firstSeenAt: number
}

/** 信号生成所需的作品最小结构 */
export interface BenchSignalWork extends ScorableWork {
  awemeId: string
  desc?: string
  plays?: number | null
  playUrl?: string | null
  firstSeenAt?: number
  missing?: boolean
}

/** 信号生成所需的最小对标账号结构（BenchAccount 满足） */
export interface BenchSignalSource {
  link: string
  secUid: string
  nickname: string
  works: BenchSignalWork[]
}

/**
 * 从对标账号近 `windowMs` 内新出现的爆款作品生成信号。
 * 只有「新发现且爆」的才算信号——老作品已知，不构成新信息。
 */
export function hotSignalsFromBench(
  bench: BenchSignalSource[],
  now = Date.now(),
  windowMs = 7 * 24 * 3_600_000,
): BenchHotSignal[] {
  const out: BenchHotSignal[] = []
  for (const acct of bench) {
    const live = acct.works.filter(w => w.missing !== true)
    for (const w of live) {
      const seen = w.firstSeenAt ?? 0
      if (seen === 0 || now - seen > windowMs) continue
      if (!isHotWork(w, live)) continue
      out.push({
        benchKey: acct.secUid || acct.link,
        benchNickname: acct.nickname,
        awemeId: w.awemeId,
        desc: (w.desc ?? '').slice(0, 60),
        score: benchWorkScore(w),
        plays: w.plays ?? null,
        webUrl: w.playUrl ?? `https://www.douyin.com/video/${w.awemeId}`,
        firstSeenAt: seen,
      })
    }
  }
  /* 分数降序：最爆的在前 */
  return out.sort((a, b) => b.score - a.score)
}

/* ── 内容 tab：文案库（ASR 聚合）──────────────────────────────────────── */

export interface AsrEntry {
  /** 对标账号 key（secUid || link） */
  benchKey: string
  benchNickname: string
  awemeId: string
  desc: string
  asr: string
  lastSeenAt: number
  playUrl: string
}

/** 全部已转写文案的扁平列表（内容 tab 的文案库），按转写内容长度降序。 */
/** 文案库聚合所需的作品最小结构 */
export interface AsrWorkStub {
  awemeId: string
  desc?: string
  asr?: string
  lastSeenAt?: number
  playUrl?: string | null
  missing?: boolean
}

/** 文案库聚合所需的账号最小结构 */
export interface AsrBenchStub {
  link: string
  secUid: string
  nickname: string
  works: AsrWorkStub[]
}

export function asrLibrary(bench: AsrBenchStub[]): AsrEntry[] {
  const out: AsrEntry[] = []
  for (const acct of bench) {
    for (const w of acct.works) {
      if (w.missing === true) continue
      if (w.asr === undefined || w.asr === '') continue
      out.push({
        benchKey: acct.secUid || acct.link,
        benchNickname: acct.nickname,
        awemeId: w.awemeId,
        desc: (w.desc ?? '').slice(0, 60),
        asr: w.asr,
        lastSeenAt: w.lastSeenAt ?? 0,
        playUrl: w.playUrl ?? `https://www.douyin.com/video/${w.awemeId}`,
      })
    }
  }
  return out.sort((a, b) => b.asr.length - a.asr.length)
}

/* ── 热点 tab 本地存储：手动关注 + 用户反馈 ────────────────────────────── */

export interface WatchItem {
  id: string
  url: string
  note: string
  at: number
}

export interface FeedbackItem {
  id: string
  text: string
  at: number
}

interface SignalsStore {
  version: 1
  watch: WatchItem[]
  feedback: FeedbackItem[]
}

const SIGNALS_KEY = 'hl-ops-signals-v1'

export function loadSignals(): SignalsStore {
  try {
    const raw = window.localStorage.getItem(SIGNALS_KEY)
    if (raw === null) return { version: 1, watch: [], feedback: [] }
    const parsed = JSON.parse(raw) as Partial<SignalsStore>
    return {
      version: 1,
      watch: Array.isArray(parsed.watch) ? parsed.watch : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    }
  } catch {
    return { version: 1, watch: [], feedback: [] }
  }
}

export function saveSignals(store: SignalsStore): void {
  try {
    window.localStorage.setItem(SIGNALS_KEY, JSON.stringify(store))
  } catch { /* 满 */ }
}

export function addWatch(url: string, note: string, now = Date.now()): SignalsStore {
  const store = loadSignals()
  const next: SignalsStore = {
    ...store,
    watch: [
      { id: `w-${String(now)}-${Math.random().toString(36).slice(2, 6)}`, url: url.trim(), note: note.trim(), at: now },
      ...store.watch,
    ].slice(0, 100),
  }
  saveSignals(next)
  return next
}

export function removeWatch(id: string): SignalsStore {
  const store = loadSignals()
  const next = { ...store, watch: store.watch.filter(w => w.id !== id) }
  saveSignals(next)
  return next
}

export function addFeedback(text: string, now = Date.now()): SignalsStore {
  const store = loadSignals()
  const next: SignalsStore = {
    ...store,
    feedback: [
      { id: `f-${String(now)}-${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), at: now },
      ...store.feedback,
    ].slice(0, 200),
  }
  saveSignals(next)
  return next
}

export function removeFeedback(id: string): SignalsStore {
  const store = loadSignals()
  const next = { ...store, feedback: store.feedback.filter(f => f.id !== id) }
  saveSignals(next)
  return next
}

/* ── 热榜（网关 /api/content-tools/hot-board 响应） ────────────────────── */

export interface HotBoardItem {
  rank: number | null
  word: string
  webUrl: string
  hotValue: number | null
  contentCount: number | null
}

/** 热榜数值展示：≥1万 → 「xx万」 */
export function formatHotValue(v: number | null): string {
  if (v === null) return ''
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`
  return String(v)
}
