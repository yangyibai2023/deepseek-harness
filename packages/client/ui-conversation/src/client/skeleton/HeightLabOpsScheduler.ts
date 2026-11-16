/**
 * HeightLab 运营面板 · 后台调度器（2026-11-16，O49 P5 定时采集）
 *
 * ## 为什么存在
 *
 * T+N 快照回填原本只在运营面板**打开时**发生（React effect 挂载才跑）——
 * 用户发布后关着面板，T+1h/T+6h 的观测点就永远错过，「今日行动」队列
 * 里的 P0 项会一直挂着。本模块让采集在**应用开着时**后台持续进行：
 *
 *   启动 60s 后首跑 → 之后每 30 分钟一次「计划检查」，
 *   只有命中规则的平台才真正发请求（不空打平台接口）。
 *
 * ## 触发规则（planBackgroundTargets，纯函数可单测）
 *
 * 一个平台本次要同步，当且仅当它**有快照**（=已登录）且满足其一：
 *   ① 有发布记录的 T+N 观测点到期，且该平台快照距今 > 15 分钟
 *      （快照够新时回填 effect 已经处理过，再拉无意义）；
 *   ② 快照距今 > 24 小时（日常保鲜）。
 *
 * ## 与页面逻辑的关系
 *
 * 合并（computeSyncedSnapshot）与回填（backfillDueRecords）全部复用
 * 页面同一批纯函数——**逻辑只有一份**，后台写的数据和面板显示的数据
 * 不可能分叉。写完后发两个事件：
 *   · hl-ops-snapshots-externally-changed → 面板页重读快照状态
 *   · hl-ops-groups-changed               → 概况区重新渲染
 *
 * ## 边界
 *
 * - 只在桌面壳内有意义（取数走 Tauri 命令）；纯浏览器预览里 FETCHERS
 *   会抛错——按平台 catch，不打扰、不刷屏。
 * - running 锁防重入；单平台失败不影响其他平台。
 * - 不碰登录窗口：没快照的平台永远等用户手动点卡（调度器不替人扫码）。
 */

import { backfillDueRecords, dueSnapshotHour, loadRecords, saveRecords } from './HeightLabOpsData.ts'
import { FETCHERS, PROVIDERS, STORAGE_KEY, collectBenchIntoStore, computeSyncedSnapshot, loadBench, loadSnapshots } from './HeightLabOpsPage.tsx'
import type { PlatformSnapshot } from './HeightLabOpsPage.tsx'
import type { ProviderId } from './HeightLabOpsData.ts'

/* ── 策略参数 ──────────────────────────────────────────────────────────── */

/** T+N 到期触发时，快照至少这么旧才真正去拉（分钟） */
export const DUE_REFRESH_MINUTES = 15
/** 日常保鲜阈值：快照超过 24h 无条件刷新 */
export const FRESH_HOURS = 24
/** 启动后首次检查的延迟（等应用初始化稳定） */
export const FIRST_RUN_DELAY_MS = 60_000
/** 计划检查间隔 */
export const TICK_INTERVAL_MS = 30 * 60_000

/* ── 计划（纯函数） ────────────────────────────────────────────────────── */

/**
 * 决定本次要同步哪些平台。输入全部为已落地数据，输出平台 id 列表。
 * 纯函数：同输入同输出，测试用固定时钟。
 */
export function planBackgroundTargets(
  providers: readonly { id: ProviderId }[],
  snapshots: Record<string, PlatformSnapshot>,
  recordsDueByProvider: Record<string, boolean>,
  now = Date.now(),
): ProviderId[] {
  const targets: ProviderId[] = []
  for (const def of providers) {
    const snap = snapshots[def.id]
    if (snap === undefined) continue   /* 没快照 = 没登录，调度器不替人扫码 */
    const ageMs = now - snap.syncedAt
    const dueTrigger = recordsDueByProvider[def.id] === true && ageMs > DUE_REFRESH_MINUTES * 60_000
    const freshTrigger = ageMs > FRESH_HOURS * 3_600_000
    if (dueTrigger || freshTrigger) targets.push(def.id)
  }
  return targets
}

/** 对标自动监控默认频率（小时） */
export const BENCH_MONITOR_DEFAULT_H = 6

/**
 * 哪些对标账号本轮该重采：monitor 开启 且距上次同步超过 monitorIntervalH。
 * 纯函数（输入/出都可测）。返回账号 link（采集以 link 为入参）。
 */
export function planBenchCollects(
  accounts: { link: string; syncedAt: number; monitor?: boolean; monitorIntervalH?: number }[],
  now = Date.now(),
): string[] {
  return accounts
    .filter(a => a.monitor === true && now - a.syncedAt > (a.monitorIntervalH ?? BENCH_MONITOR_DEFAULT_H) * 3_600_000)
    .map(a => a.link)
}

/** 哪些平台有 T+N 欠采的发布记录（planBackgroundTargets 的输入预处理） */
export function dueRecordsByProvider(
  records: ReturnType<typeof loadRecords>,
  now = Date.now(),
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const r of records) {
    if (dueSnapshotHour(r, now) !== null) out[r.provider] = true
  }
  return out
}

/* ── 执行 ──────────────────────────────────────────────────────────────── */

let started = false
let running = false

/**
 * 跑一次后台同步：计划 → 逐平台取数合并 → 回填 T+N → 发刷新事件。
 * 返回本次同步了几个平台（0 = 没有命中规则，没发任何请求）。
 */
export async function runOpsBackgroundSync(now = Date.now()): Promise<number> {
  if (running) return 0
  running = true
  try {
    const snapshots = loadSnapshots()
    const records = loadRecords()
    const targets = planBackgroundTargets(PROVIDERS, snapshots, dueRecordsByProvider(records, now), now)
    if (targets.length === 0) return 0

    let latest = snapshots
    for (const id of targets) {
      const fetcher = FETCHERS[id]
      if (fetcher === undefined) continue
      try {
        const snap = await fetcher()
        if (snap === null) continue
        /* 契约检查与页面一致：至少一条非空指标才算成功 */
        const metrics = [
          ...(snap.highlights ?? []).map(h => h.metric),
          ...(snap.details ?? []).map(d => d.metric),
        ]
        if (metrics.filter(m => m.value !== null).length === 0) continue
        latest = computeSyncedSnapshot(latest, id, snap).persistable
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(latest))
        } catch { /* 非致命 */ }
      } catch {
        /* 单平台失败不影响其他平台；浏览器预览（无 Tauri）也走这里 */
      }
    }

    /* 对标自动监控：到期的账号重采（服务端 DTK，复用 collectBenchIntoStore
     * 的 upsert 语义；单账号失败不影响其他） */
    for (const link of planBenchCollects(loadBench(), now)) {
      try { await collectBenchIntoStore(link) } catch { /* 单账号失败跳过 */ }
    }

    /* T+N 回填：与页面同一个纯函数 */
    const { next, changed } = backfillDueRecords(records, Object.fromEntries(
      Object.entries(latest).map(([id, snap]) => [id, snap.works ?? []] as const),
    ), now)
    if (changed) saveRecords(next)

    /* 通知已挂载的 UI：面板页重读快照状态 + 概况区重新渲染 */
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hl-ops-snapshots-externally-changed'))
      window.dispatchEvent(new CustomEvent('hl-ops-groups-changed'))
    }
    return targets.length
  } finally {
    running = false
  }
}

/** 幂等启动：重复调用无副作用。桌面壳内 60s 后首跑，之后每 30min 检查。 */
export function startOpsScheduler(): void {
  if (started) return
  started = true
  if (typeof window === 'undefined') return
  const timer = window.setInterval(() => { void runOpsBackgroundSync() }, TICK_INTERVAL_MS)
  /* 页面关闭即随之消失，无需清理；卸载保护用 beforeunload 取消非必需 */
  void timer
  window.setTimeout(() => { void runOpsBackgroundSync() }, FIRST_RUN_DELAY_MS)
}
