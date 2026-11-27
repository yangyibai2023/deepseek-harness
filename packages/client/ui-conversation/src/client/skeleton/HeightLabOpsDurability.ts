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
  /* O104（2026-11-27）：项目清单键曾长期缺席——面板 OpsPage 与 MCP 都读写
   * hl-projects-v1，但它不在镜像清单：MCP 建的项目面板永远拉不到（pull 只
   * 拉清单内键），面板写的也从不备份。补入。 */
  'hl-projects-v1',
  /* O130（2026-11-27 实锤）：「移动到项目」的显示归属若只存 localStorage =
   * 容器私有（APP WebView 与浏览器各一份，用户实测 APP 里看不到浏览器端
   * 的移动）——纳入宿主镜像：写→push，启动/换容器→pull，宿主文件为权威。 */
  'hl-project-display-v1',
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

/* O104（2026-11-27）：脏键推送。原实现每次推全量 9+1 键——大多数键只是
 * 转发 localStorage 旧值，把 MCP 刚写进宿主文件的同键新值**整值覆盖**
 * （「MCP 写入静默消失」的机理）。现在只对「自上次推送后本地真的变过」
 * 的键发 POST；宿主端按键合并，未推的键保留 MCP 写入。 */
let lastPushed: Record<string, string> = {}

/** 推送到宿主文件（原子写在桥侧做；失败静默——localStorage 仍是真相源） */
export async function pushOpsStore(): Promise<void> {
  if (typeof window === 'undefined') return
  const all = readAll()
  const dirty: Record<string, string> = {}
  for (const [key, value] of Object.entries(all)) {
    if (lastPushed[key] !== value) dirty[key] = value
  }
  if (Object.keys(dirty).length === 0) return
  try {
    const resp = await fetch('/hl/ops/store', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: dirty }),
      signal: AbortSignal.timeout(15_000),
    })
    // 推送成功才更新快照（失败键下次重推）；401（未登录）时不动快照。
    if (resp.ok) lastPushed = { ...lastPushed, ...dirty }
  } catch { /* 宿主不在（浏览器预览）时静默 */ }
}

/* O104：换账号检测。宿主按 userId 分桶；pull 响应带 userId。本地记录上次
 * 拉取的用户，变了先清全部镜像键再灌——否则新账号会看到上账号的数据
 * （「跨账号串数据」的机理）。 */
const LS_STORE_USER = 'hl-ops-store-user'

/** 从宿主文件拉回（启动时一次；远端为尊） */
export async function pullOpsStore(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const resp = await fetch(`/hl/ops/store?keys=${SYNCED_KEYS.join(',')}`, {
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await resp.json().catch(() => null)) as {
      ok?: boolean
      userId?: string | null
      values?: Record<string, string | null>
    } | null
    if (data?.ok !== true || data.values === undefined) return
    const remoteUser = typeof data.userId === 'string' ? data.userId : null
    let previousUser: string | null = null
    try { previousUser = window.localStorage.getItem(LS_STORE_USER) } catch { /* ignore */ }
    let changed = false
    if (remoteUser !== null && previousUser !== null && previousUser !== remoteUser) {
      // 换账号：清掉上账号的所有镜像键（含本地脏值），从远端干净重灌。
      for (const key of SYNCED_KEYS) {
        if (window.localStorage.getItem(key) !== null) {
          window.localStorage.removeItem(key)
          changed = true
        }
      }
      lastPushed = {}
    }
    const remoteHas = new Set<string>()
    let displayOverrideChanged = false
    for (const key of SYNCED_KEYS) {
      const remote = data.values[key]
      if (typeof remote === 'string') {
        remoteHas.add(key)
        if (remote !== window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, remote)
          changed = true
          /* O130 实锤（用户 APP 实测「项目组里是空的」）：pull 灌入移动归属
           * 后必须补发重排事件——APP 容器首次收到该键时首渲染已过，
           * 只发 groups-changed 重排器听不到，显示永不更新。 */
          if (key === 'hl-project-display-v1') displayOverrideChanged = true
        }
      }
    }
    /* O130 实锤修正（O104 脏键推送真 bug）：lastPushed 只能标记「远端真有
     * 的键」。原实现 lastPushed=readAll() 把「本地有、远端 null」的键也标成
     * 已推送 → 该键从此不再上行（用户实测：浏览器端「移动到项目」写了
     * override，宿主永远收不到，APP 容器 pull 不到=两边不一致）。
     * 正确语义：远端 null 而本地有值的键保持 dirty，由随后的 push 补上行。 */
    lastPushed = Object.fromEntries(
      Object.entries(readAll()).filter(([key]) => remoteHas.has(key)),
    )
    if (remoteUser !== null) {
      try { window.localStorage.setItem(LS_STORE_USER, remoteUser) } catch { /* ignore */ }
    }
    if (changed) window.dispatchEvent(new CustomEvent('hl-ops-groups-changed'))
    if (displayOverrideChanged) window.dispatchEvent(new CustomEvent('hl:project-display-changed'))
  } catch { /* 同上静默 */ }
}

/** 幂等启动：任何存盘点（groups-changed 事件）防抖后推送；启动先拉后推。 */
export function startOpsDurability(): void {
  if (started) return
  started = true
  if (typeof window === 'undefined') return
  const schedulePush = (): void => {
    if (pushTimer !== null) window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(() => { void pushOpsStore() }, 5_000)
  }
  /* O130：「移动到项目」写 override 后 dispatch 此事件——同走防抖 push，
   * 让宿主镜像即时更新（其他容器下次 pull 即一致）。 */
  window.addEventListener('hl:project-display-changed', schedulePush)
  window.addEventListener('hl-ops-groups-changed', schedulePush)
  void pullOpsStore().then(() => { void pushOpsStore() })
}
