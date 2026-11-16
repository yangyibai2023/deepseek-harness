/**
 * HeightLab 运营面板 · 选题池（2026-11-17，O49 设计 §2.3）
 *
 * 贯穿全链路的轻量对象：信号/对标作品/热榜/手动关注/用户反馈
 * 「入池」→ 选题池 → 「去创作」跳场景创作。设计明确不建见舟那种
 * 项目/母题/任务三层——一个扁平列表 + 4 态状态机足够。
 *
 * 存储：localStorage 'hl-ops-pool-v1'（与账号快照同层，真库化时再迁）。
 */

/* ── 类型 ──────────────────────────────────────────────────────────────── */

export type PoolSourceType = 'bench' | 'hot' | 'watch' | 'feedback'

export type PoolStatus = '候选' | '已用' | '放弃'

export interface PoolItem {
  id: string
  title: string
  sourceType: PoolSourceType
  /** 来源标识（对标 awemeId / 热榜链接 / 关注项 id / 反馈项 id） */
  sourceRef: string
  /** 补充说明（入池时带的备注） */
  note: string
  status: PoolStatus
  createdAt: number
}

export const POOL_STATUSES: PoolStatus[] = ['候选', '已用', '放弃']

/* ── 存储 ──────────────────────────────────────────────────────────────── */

const POOL_KEY = 'hl-ops-pool-v1'
const MAX_POOL = 200

export function loadPool(): PoolItem[] {
  try {
    const raw = window.localStorage.getItem(POOL_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as PoolItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePool(list: PoolItem[]): void {
  try {
    window.localStorage.setItem(POOL_KEY, JSON.stringify(list.slice(0, MAX_POOL)))
  } catch { /* 满 */ }
}

/** 入池。同一 sourceRef 不重复（重复入池只更新 note，幂等）。 */
export function addPoolItem(
  input: { title: string; sourceType: PoolSourceType; sourceRef: string; note?: string },
  now = Date.now(),
): PoolItem[] {
  const list = loadPool()
  const existing = list.find(i => i.sourceRef === input.sourceRef && i.sourceType === input.sourceType)
  if (existing !== undefined) {
    const next = list.map(i => (i.id === existing.id ? { ...i, note: input.note ?? i.note } : i))
    savePool(next)
    return next
  }
  const next: PoolItem[] = [
    {
      id: `pool-${String(now)}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title.slice(0, 80),
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      note: (input.note ?? '').slice(0, 200),
      status: '候选',
      createdAt: now,
    },
    ...list,
  ]
  savePool(next)
  return next
}

/** 状态流转：候选↔已用↔放弃（三态互转，无非法态）。 */
export function setPoolStatus(id: string, status: PoolStatus): PoolItem[] {
  const next = loadPool().map(i => (i.id === id ? { ...i, status } : i))
  savePool(next)
  return next
}

export function removePoolItem(id: string): PoolItem[] {
  const next = loadPool().filter(i => i.id !== id)
  savePool(next)
  return next
}

/* ── 展示辅助 ──────────────────────────────────────────────────────────── */

export const POOL_SOURCE_LABELS: Record<PoolSourceType, string> = {
  bench: '对标',
  hot: '热榜',
  watch: '关注',
  feedback: '反馈',
}

/** 候选数（总览数字条/角标用） */
export function poolPendingCount(list: PoolItem[]): number {
  return list.filter(i => i.status === '候选').length
}
