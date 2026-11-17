/**
 * HeightLab 运营面板 · 持久层客户端（2026-11-17，O49 上真库 v1）
 *
 * localStorage → 宿主文件镜像。动机：localStorage 换机即丢、5MB 有顶。
 * v1 不改任何调用点（所有 loadX/saveX 保持同步 localStorage 语义）：
 *   · 推：监听 hl-ops-groups-changed（所有存盘点都发这个事件），
 *     防抖 5s 把六个键的当前值 POST 到 /hl/ops/store
 *   · 拉：调度器启动时 GET 一次，远端有的键覆盖 localStorage（远端为尊）
 * v2（复盘 tab 时）：发布记录+快照落 SQLite 专用表（要按字段查询）。
 */

/** 参与镜像的 localStorage 键（热榜缓存可重新拉取，不镜像） */
export const SYNCED_KEYS = [
  'hl-ops-snapshots-v2',
  'hl-ops-bench-v1',
  'hl-ops-publish-records-v1',
  'hl-ops-projects-v1',
  'hl-ops-signals-v1',
  'hl-ops-pool-v1',
  'hl-ops-rules-v1',
  'hl-ops-analysis-v1',
  /* F2（1117 同族审计）：分组映射曾漏镜像——面板分组不备份且与 MCP
   * 直写 store 各写各的。键集合完整性由 verify-home-isolation 同款
   * 思路在 ops 契约门禁断言（面板全部存键 ⊆ SYNCED_KEYS）。 */
  'hl-ops-groups-v1',
] as const

let pushTimer: number | null = null
let started = false

function readAll(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof window === 'undefined') return out
  for (const key of SYNCED_KEYS) {
    const value = window.localStorage.getItem(key)
    if (value !== null) out[key] = value
  }
  return out
}

/** 推送到宿主文件（原子写在桥侧做；失败静默——localStorage 仍是真相源） */
export async function pushOpsStore(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch('/hl/ops/store', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: readAll() }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch { /* 宿主不在（浏览器预览）时静默 */ }
}

/** 从宿主文件拉回（启动时一次；远端为尊） */
export async function pullOpsStore(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const resp = await fetch(`/hl/ops/store?keys=${SYNCED_KEYS.join(',')}`, {
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; values?: Record<string, string | null> } | null
    if (data?.ok !== true || data.values === undefined) return
    let changed = false
    for (const key of SYNCED_KEYS) {
      const remote = data.values[key]
      if (typeof remote === 'string' && remote !== window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, remote)
        changed = true
      }
    }
    if (changed) window.dispatchEvent(new CustomEvent('hl-ops-groups-changed'))
  } catch { /* 同上静默 */ }
}

/** 幂等启动：任何存盘点（groups-changed 事件）防抖后推送；启动先拉后推。 */
export function startOpsDurability(): void {
  if (started) return
  started = true
  if (typeof window === 'undefined') return
  window.addEventListener('hl-ops-groups-changed', () => {
    if (pushTimer !== null) window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(() => { void pushOpsStore() }, 5_000)
  })
  void pullOpsStore().then(() => { void pushOpsStore() })
}
