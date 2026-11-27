/**
 * O130（2026-11-27，用户拍板「侧栏项目化」）：显示重排器。
 *
 * 「移动到项目」= **标签层操作**：会话底层归属（workspace 名册/cwd）不变，
 * 只是显示归组改变——零技术债绕开 attachSession 的 cwd 硬校验（上游
 * 0.2.3 仍坚持 immutable header cwd，真移动是永久债，用户已拍板不做）。
 *
 * 存储：localStorage `hl-project-display-v1` = { sessionId: workspaceId }。
 * 写入方：heightlab-projects web-plugin 的会话三点菜单「加入项目…」；
 * 写入后 dispatch `hl:project-display-changed`，本模块的订阅者（原生
 * WorkspaceBrowser 的 workspaces memo）重排显示。
 *
 * 重排语义：
 *   · override 指向的工作区存在 → 会话从原组挪到目标组（追加尾部）
 *   · override 指向不存在的工作区（已删除）→ 忽略该条（自然回落原组）
 *   · 归档/置顶等原生行为不受影响（那些读 sessionId 不读组归属）
 */

const STORE_KEY = 'hl-project-display-v1'
export const PROJECT_DISPLAY_CHANGED = 'hl:project-display-changed'

type DisplayOverrides = Record<string, string>

export function readDisplayOverrides(): DisplayOverrides {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: DisplayOverrides = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch { return {} }
}

export function writeDisplayOverride(sessionId: string, workspaceId: string | null): void {
  try {
    const map = readDisplayOverrides()
    const next = workspaceId === null
      ? Object.fromEntries(Object.entries(map).filter(([key]) => key !== sessionId))
      : { ...map, [sessionId]: workspaceId }
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch { /* 存储不可用：显示归组退回原生 */ }
  window.dispatchEvent(new CustomEvent(PROJECT_DISPLAY_CHANGED))
}

/** 工作区形状的最小约束（ui-workspace 的 WorkspaceView 结构子集）。 */
interface WorkspaceLike { workspaceId: string; sessionIds: readonly string[] }

/**
 * 按 override 重排显示归属。纯函数：不改原数组；无 override 时原样返回
 * （引用相等，下游 memo 不抖动）。
 */
export function applyDisplayOverrides<W extends WorkspaceLike>(workspaces: readonly W[]): readonly W[] {
  const overrides = readDisplayOverrides()
  if (Object.keys(overrides).length === 0) return workspaces
  const validTargets = new Set(workspaces.map(w => w.workspaceId))
  // 每条 override 的实际生效目标（无效目标=忽略）
  const effective = new Map<string, string>()
  for (const [sessionId, target] of Object.entries(overrides)) {
    if (validTargets.has(target)) effective.set(sessionId, target)
  }
  if (effective.size === 0) return workspaces
  return workspaces.map((workspace) => {
    const removed = workspace.sessionIds.filter(id => effective.has(id) && effective.get(id) !== workspace.workspaceId)
    const added = [...effective.entries()]
      .filter(([id, target]) => target === workspace.workspaceId && !workspace.sessionIds.includes(id))
      .map(([id]) => id)
    if (removed.length === 0 && added.length === 0) return workspace
    const next = workspace.sessionIds.filter(id => !effective.has(id) || effective.get(id) === workspace.workspaceId)
    return { ...workspace, sessionIds: [...next, ...added] }
  })
}
