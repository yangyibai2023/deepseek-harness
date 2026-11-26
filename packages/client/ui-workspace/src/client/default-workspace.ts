/**
 * 「默认工作区」唯一选择器（2026-11-27，O105）。
 *
 * 背景（1126 A 类审计）：三处独立实现漂移——
 *   ①auto-start 用 `items[0]`（注册表顺序不保证「我的工作区」优先，第一项
 *     若是团队工作区，启动即把会话建进团队目录，违反「个人绝不停团队」铁律）
 *   ②归位 effect 按标题「我的工作区」/路径末段 HeightLab 精确匹配，无兜底
 *   ③navigation 用 recentWorkspace（:315 处甚至未排除团队）
 * 统一为这一个函数，三处共用；语义或判定的任何演进只改这里。
 *
 * 解析顺序：
 *   1. 排除团队工作区（权威 id `__hlTeamWorkspaceId` 优先，标题「团队」兜底）
 *   2. 标题 === 「我的工作区」（官方默认工作区）
 *   3. 路径末段 HeightLab（用户改过默认工作区名时的回退判据）
 *   4. 最近使用（传入 sessions 时：按工作区内会话 updatedAt 取最新）
 *   5. 非团队第一项（注册表兜底，保证空历史新用户也能启动）
 *
 * 返回 undefined 仅当：注册表为空，或注册表里全是团队工作区。
 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { teamWorkspaceId } from './fusion.ts'

/** 团队工作区判定：ds-bot 权威 id 优先，标题「团队」兜底（权威 id 未就绪的早期启动窗口）。 */
export function isTeamWorkspace(item: Pick<WorkspaceView, 'workspaceId' | 'title'>): boolean {
  const authoritative = teamWorkspaceId()
  if (authoritative !== undefined && item.workspaceId === authoritative) return true
  return item.title === '团队'
}

/**
 * 解析个人默认工作区（语义见文件头）。
 * @param items - 工作区注册表快照。
 * @param sessions - 会话清单（可选；传入后启用「最近使用」层级）。
 * @returns 目标工作区 id，或无可选工作区时的 undefined。
 */
export function resolveDefaultWorkspace(
  items: readonly WorkspaceView[],
  sessions?: SessionListState['byId'],
): WorkspaceId | undefined {
  const personal = items.filter(item => !isTeamWorkspace(item))
  if (personal.length === 0) return undefined
  const byTitle = personal.find(item => item.title === '我的工作区')
  if (byTitle !== undefined) return byTitle.workspaceId
  const byPath = personal.find(item => /[\\/]HeightLab$/i.test(item.path))
  if (byPath !== undefined) return byPath.workspaceId
  if (sessions !== undefined) {
    let recent: WorkspaceId | undefined
    let recentTime = Number.NEGATIVE_INFINITY
    for (const workspace of personal) {
      let latest = Number.NEGATIVE_INFINITY
      for (const sessionId of workspace.sessionIds) {
        const session = sessions[sessionId]
        if (session !== undefined) latest = Math.max(latest, session.updatedAt)
      }
      if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt)
      if (recent === undefined || latest > recentTime) {
        recent = workspace.workspaceId
        recentTime = latest
      }
    }
    if (recent !== undefined) return recent
  }
  return personal[0]?.workspaceId
}
