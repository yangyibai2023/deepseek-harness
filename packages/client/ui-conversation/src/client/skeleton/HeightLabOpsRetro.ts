/**
 * HeightLab 运营面板 · 复盘纯函数层（2026-11-17，O49 核心⑥）
 *
 * 设计 §11 的取舍忠实落地：
 * - 复盘**纯规则不调 LLM**（11.5）——模型不该编复盘
 * - 对照档位（11.7）：≥2 起量 / ≥1.2 高于 / ≥0.8 接近 / 否则低于
 * - 无预测发布 actual_only 不计入校准（11.9）——v1 用账号基线当对照锚，
 *   界面明确标注「基线对照」；真盲预测（锁定+integrity_hash）是 v2
 * - 假设结论固定「待人工判定」（11.8）——规则建议默认待审，人审才生效
 */

import { SNAPSHOT_HOURS, type PublishRecord } from './HeightLabOpsData.ts'

/* ── T+N 证据链状态 ────────────────────────────────────────────────────── */

export type SnapshotState = 'taken' | 'due' | 'missed' | 'future'

export interface SnapshotPoint {
  hour: (typeof SNAPSHOT_HOURS)[number]
  state: SnapshotState
  plays: number | null
  at: number | null
}

/**
 * 一条发布记录在各观测点的状态（复盘 tab 证据链圆点）。
 * taken=已采 / due=到点未采 / missed=该采时点已过时且永远错过 /
 * future=还没到。判定锚 = publishedAt + 观测小时数。
 */
export function snapshotChain(record: PublishRecord, now = Date.now()): SnapshotPoint[] {
  /* 最接近某观测点（±0.5h 容差内）已采的快照 */
  const near = (hour: number): { plays: number | null; at: number } | null => {
    for (const s of record.snapshots) {
      if (Math.abs(s.ageHours - hour) <= 0.5) return { plays: s.plays ?? null, at: s.at }
    }
    return null
  }
  return SNAPSHOT_HOURS.map((hour) => {
    const hit = near(hour)
    if (hit !== null) return { hour, state: 'taken' as const, plays: hit.plays, at: hit.at }
    const ageH = (now - record.publishedAt) / 3_600_000
    /* 到点后 1 小时内还允许补采，之后才判 missed（避免边界抖动） */
    if (ageH >= hour + 1) return { hour, state: 'missed' as const, plays: null, at: null }
    if (ageH >= hour) return { hour, state: 'due' as const, plays: null, at: null }
    return { hour, state: 'future' as const, plays: null, at: null }
  })
}

/* ── 复盘判定（纯规则） ────────────────────────────────────────────────── */

export type RetroVerdict = '起量' | '高于' | '接近' | '低于' | '数据不足'

export interface RetroResult {
  verdict: RetroVerdict
  /** T+168 播放 / 账号基线（null=无基线） */
  ratio: number | null
  /** 末次快照播放 / 首次快照播放（判断快热 vs 慢热） */
  growth: number | null
  heat: '快热' | '慢热' | '平稳' | null
  /** 判定依据文本（给用户看，不给模型编） */
  basis: string
}

/**
 * 复盘判定：以 T+168（或末次已采）播放对照账号基线分档；
 * 增长斜率 = 末次/首次快照，≥3 快热 / ≤1.2 慢热-ish 平稳 / 中间平稳。
 * 基线为 null（账号无作品数据）→ 数据不足（11.9 诚实口径）。
 */
export function retroVerdict(
  record: PublishRecord,
  baselineAvgPlays: number | null,
  now = Date.now(),
): RetroResult {
  const chain = snapshotChain(record, now)
  const taken = chain.filter(p => p.state === 'taken' && p.plays !== null)
  const lastTaken = taken[taken.length - 1] ?? null
  const actual = lastTaken?.plays ?? null

  if (actual === null || baselineAvgPlays === null || baselineAvgPlays <= 0) {
    return { verdict: '数据不足', ratio: null, growth: null, heat: null, basis: '缺少实际播放或账号基线，不计入校准' }
  }

  const ratio = actual / baselineAvgPlays
  const verdict: RetroVerdict = ratio >= 2 ? '起量' : ratio >= 1.2 ? '高于' : ratio >= 0.8 ? '接近' : '低于'

  const first = taken[0] ?? null
  const growth = first !== null && first.plays !== null && first.plays > 0 ? actual / first.plays : null
  const heat = growth === null ? null : growth >= 3 ? '快热' : growth <= 1.2 ? '慢热' : '平稳'

  const basis = `T+${String(lastTaken?.hour ?? 0)}h 播放 ${String(actual)} ÷ 账号基线 ${String(Math.round(baselineAvgPlays))} = ${ratio.toFixed(2)}`
  return { verdict, ratio, growth, heat, basis }
}

/* ── 规则建议 + 经验库 ─────────────────────────────────────────────────── */

export type RuleStatus = '待审' | '已验证' | '已失效'

export interface RuleItem {
  id: string
  text: string
  /** 来源发布记录 id（溯源） */
  sourceRef: string
  status: RuleStatus
  createdAt: number
}

export const RULE_STATUSES: RuleStatus[] = ['待审', '已验证', '已失效']

/** 从复盘结论生成规则建议（模板句式，纯规则） */
export function ruleSuggestion(record: PublishRecord, retro: RetroResult, now = Date.now()): RuleItem | null {
  if (retro.verdict === '数据不足') return null
  const title = record.title.slice(0, 24) || '该作品'
  const heatPart = retro.heat !== null ? `，${retro.heat}` : ''
  const text = retro.verdict === '低于'
    ? `「${title}」方向表现低于账号基线（${retro.basis}）——同类题材减少投入，先复盘差异点`
    : `「${title}」方向${retro.verdict}${heatPart}（${retro.basis}）——同类题材可加大产出`
  return {
    id: `rule-${String(now)}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    sourceRef: record.id,
    status: '待审',
    createdAt: now,
  }
}

const RULES_KEY = 'hl-ops-rules-v1'

export function loadRules(): RuleItem[] {
  try {
    const raw = window.localStorage.getItem(RULES_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as RuleItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRules(list: RuleItem[]): void {
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(list.slice(0, 100)))
  } catch { /* 满 */ }
}

/** 追加建议（同 sourceRef 的去重：已有同记录建议则跳过） */
export function addRule(item: RuleItem): RuleItem[] {
  const list = loadRules()
  if (list.some(r => r.sourceRef === item.sourceRef)) return list
  const next = [item, ...list]
  saveRules(next)
  return next
}

export function setRuleStatus(id: string, status: RuleStatus): RuleItem[] {
  const next = loadRules().map(r => (r.id === id ? { ...r, status } : r))
  saveRules(next)
  return next
}

export function removeRule(id: string): RuleItem[] {
  const next = loadRules().filter(r => r.id !== id)
  saveRules(next)
  return next
}

/** 已验证规则文本（注入「让 AI 分析」上下文用） */
export function verifiedRulesText(): string {
  const verified = loadRules().filter(r => r.status === '已验证')
  if (verified.length === 0) return ''
  return ['【已验证经验】', ...verified.map(r => `· ${r.text}`)].join('\n')
}
