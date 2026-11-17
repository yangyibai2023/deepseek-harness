/**
 * HeightLab 运营面板 · 今日行动队列（2026-11-16，O49 总览 tab 第一块）
 *
 * ## 为什么单列一个模块
 *
 * 设计文档（2026-11-10 设计方案 §2.2）把「总览」定义为**「我现在最该干什么？」**，
 * 今日行动队列是其中的主区（原话「全项目最有价值的一屏」）。规则必须**确定性**：
 * 同样的数据每次打开给出同样的队列，不许随机、不许静默漏项——否则用户无法
 * 信任它。所以规则做成纯函数，输入数据快照、输出行动项列表，可单测。
 *
 * ## 规则与优先级（v1，全部基于已落地的数据，不引入新数据源）
 *
 * | 优先级 | 规则 | 数据来源 |
 * |---|---|---|
 * | P0 | 没有任何账号数据 → 引导添加第一个账号 | loadSnapshots/loadBench/loadOwnExtra |
 * | P0 | 发布记录的 T+N 观测点到期未采（dueSnapshotHour 非空） | loadRecords（已有现成函数） |
 * | P1 | 账号快照超过 48h 未刷新（数据陈旧） | PlatformSnapshot.syncedAt |
 * | P2 | 有账号但近 7 天零发布记录 | loadRecords |
 * | P2 | 对标作品有待提取口播文案（无 ASR） | loadBench |
 *
 * 超出 5 条的部分不进队列（设计上限 ≤5），但计数体现在文案里
 * （「还有 N 条 T+N 待采」），避免信息丢失。
 *
 * ## 动作的 v1 取舍
 *
 * 所有项的 CTA 统一为「去处理」→ 切到「账号」tab。T+N 回填/扫码刷新/发布
 * 入口都长在账号详情页里，深链（直接打开某账号某分页）留待下一版——
 * 先让队列"看得见、跳得过去"，再让每跳精确落点。
 */

import { dueSnapshotHour, type PublishRecord } from './HeightLabOpsData.ts'

/* ── 类型 ──────────────────────────────────────────────────────────────── */

export type ActionLevel = 'p0' | 'p1' | 'p2'

/**
 * 行动目标（v2 深链，2026-11-16）：
 * - accounts   只切到账号页（兜底）
 * - detail     直接打开某平台账号详情 + 指定二级分页（T+N 欠采→发布监控、
 *              数据陈旧→数据概览并静默刷新），父组件 hl-ops-goto-tab 消费
 */
export type OpsActionTarget =
  | { kind: 'accounts' }
  | { kind: 'detail'; provider: string; tab: '数据概览' | '作品表现' | '粉丝画像' | '发布监控' }

export interface OpsActionItem {
  id: string
  level: ActionLevel
  /** 一行话讲清要干什么 */
  title: string
  /** 补充数据（多少小时/多少条），可为空 */
  detail?: string
  target: OpsActionTarget
}

/** 规则输入：全部取自现有 localStorage 数据层，不新增存储 */
export interface OpsActionInput {
  /** 已有任何账号数据（自有/对标/额外账号任一非空） */
  hasAnyData: boolean
  /** providerId → 最近一次同步时间戳 */
  syncedAts: Record<string, number>
  records: PublishRecord[]
  /** 对标账号的作品数与已提取文案数 */
  bench: { worksTotal: number; withAsr: number }[]
}

/* ── F5 阈值单源 ─────────────────────────────────────────────────────────
 * 判定阈值的唯一权威在桥（GET /hl/ops/thresholds，OPS_THRESHOLDS）。调度器/
 * 持久层启动时拉取写入 window.__hlOpsThresholds；本模块所有阈值消费点读
 * thr()（覆盖值或下方默认——默认必须与桥字面量一致，改一边必须改另一边，
 * verify-mcp-coverage 的门禁断言对两侧字面量做一致性比对）。 */
interface OpsThresholds {
  staleHours: number
  dueGraceHours: number
  verdictBands: { viral: number; above: number; close: number }
  maxActions: number
  benchMonitorDefaultH: number
}
declare global { interface Window { __hlOpsThresholds?: Partial<OpsThresholds> } }
export function thr(): OpsThresholds {
  const o = (typeof window !== 'undefined' ? window.__hlOpsThresholds : undefined) ?? {}
  return {
    staleHours: o.staleHours ?? 48,
    dueGraceHours: o.dueGraceHours ?? 1,
    verdictBands: { viral: 2, above: 1.2, close: 0.8, ...(o.verdictBands ?? {}) },
    maxActions: o.maxActions ?? 5,
    benchMonitorDefaultH: o.benchMonitorDefaultH ?? 6,
  }
}
export async function pullOpsThresholds(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const res = await fetch('/hl/ops/thresholds', { signal: AbortSignal.timeout(5_000) })
    const d = (await res.json().catch(() => null)) as { ok?: boolean; thresholds?: Partial<OpsThresholds> } | null
    if (res.ok && d?.ok === true && d.thresholds !== undefined) window.__hlOpsThresholds = d.thresholds
  } catch { /* 桥不可达用兜底 */ }
}

/* ── 阈值 ──────────────────────────────────────────────────────────────── */

/** 快照超过 48h 视为陈旧（两天一更是运营数据的合理下限） */
export const STALE_HOURS_DEFAULT = 48
/** 「本周零发布」的判定窗口 */
export const PUBLISH_WINDOW_MS = 7 * 24 * 3_600_000
/** 设计上限：今日行动最多 5 条 */
export const MAX_ACTIONS = 5

const PROVIDER_NAMES: Record<string, string> = {
  douyin: '抖音',
  shipinhao: '视频号',
  xhs: '小红书',
  bilibili: 'B站',
}

/* ── 规则引擎 ──────────────────────────────────────────────────────────── */

/**
 * 从当前数据快照生成今日行动队列（确定性：同输入同输出）。
 *
 * @param now 注入时钟，测试用固定值
 */
export function buildActionItems(input: OpsActionInput, now = Date.now()): OpsActionItem[] {
  const items: OpsActionItem[] = []

  /* P0-① 没有任何数据 → 第一优先级永远是「先把账号接上」 */
  if (!input.hasAnyData) {
    items.push({
      id: 'no-data',
      level: 'p0',
      title: '还没有任何账号数据',
      detail: '添加第一个账号，扫码登录后开始累积运营数据',
      target: { kind: 'accounts' },
    })
    return items.slice(0, MAX_ACTIONS)
  }

  /* P0-② T+N 观测点到期未采。按到期小时降序（越晚到期的越该先采）。 */
  const due = input.records
    .map(r => ({ record: r, hour: dueSnapshotHour(r, now) }))
    .filter((x): x is { record: PublishRecord; hour: number } => x.hour !== null)
    .sort((a, b) => b.hour - a.hour)
  if (due.length > 0) {
    const first = due[0]
    /* noUncheckedIndexedAccess：下标可能 undefined，显式收窄（仓规禁 ! 断言） */
    if (first !== undefined) {
      const ageH = Math.floor((now - first.record.publishedAt) / 3_600_000)
      items.push({
        id: `tndue-${first.record.id}`,
        level: 'p0',
        title: `《${first.record.title.slice(0, 24) || '未命名'}》的 T+${first.hour}h 快照该采了`,
        detail: `已发布 ${ageH} 小时${due.length > 1 ? `，还有 ${String(due.length - 1)} 条待采` : ''}`,
        /* 深链：直接落到该账号的发布监控分页，少两次点击 */
        target: { kind: 'detail', provider: first.record.provider, tab: '发布监控' },
      })
    }
  }

  /* P1 数据陈旧：任一账号快照超过 48h。按陈旧时长降序，最多报第一个。 */
  const stale = Object.entries(input.syncedAts)
    .map(([id, at]) => ({ id, at, ageH: (now - at) / 3_600_000 }))
    .filter(x => x.ageH >= thr().staleHours)
    .sort((a, b) => b.ageH - a.ageH)
  const staleFirst = stale[0]
  if (staleFirst !== undefined) {
    items.push({
      id: `stale-${staleFirst.id}`,
      level: 'p1',
      title: `${PROVIDER_NAMES[staleFirst.id] ?? staleFirst.id}数据已 ${Math.floor(staleFirst.ageH / 24)} 天未更新`,
      detail: stale.length > 1 ? `还有 ${String(stale.length - 1)} 个账号数据陈旧` : '点进账号卡即自动刷新',
      /* 深链：打开详情即触发静默刷新（父组件 syncPlatform silent） */
      target: { kind: 'detail', provider: staleFirst.id, tab: '数据概览' },
    })
  }

  /* P2-① 有账号但近 7 天零发布 */
  const recentPublish = input.records.some(r => now - r.publishedAt <= PUBLISH_WINDOW_MS)
  if (!recentPublish && input.hasAnyData) {
    items.push({
      id: 'no-publish-week',
      level: 'p2',
      title: input.records.length === 0 ? '还没有任何发布记录' : '近 7 天没有发布记录',
      detail: '发布入口在账号详情页右上角',
      target: { kind: 'accounts' },
    })
  }

  /* P2-② 对标作品待提取口播文案 */
  const pendingAsr = input.bench.reduce((s, b) => s + Math.max(0, b.worksTotal - b.withAsr), 0)
  if (pendingAsr > 0) {
    items.push({
      id: 'bench-pending-asr',
      level: 'p2',
      title: `${String(pendingAsr)} 条对标作品待提取口播文案`,
      detail: '提取后可让 AI 拆解对标的内容公式',
      target: { kind: 'accounts' },
    })
  }

  return items.slice(0, MAX_ACTIONS)
}
