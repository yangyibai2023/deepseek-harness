/**
 * HeightLab（2026-10-18 用户拍板）：「个人和团队模式融合」开关。
 *
 * 设计意图：个人模式与团队模式默认**严格隔离**——个人页面的工作区列表里
 * 不出现 ds-bot 的团队工作区，用户不会误入团队目录。开关打开后两者融合：
 * 团队工作区在个人模式下也可见、可点（点开自动跳到团队页）。
 *
 * 开关默认 **关闭**（严格隔离）。状态存 localStorage，跨会话保留；
 * 变更时广播 `hl:fusion-changed`，工作区列表与隔离逻辑据此重算。
 */
const FUSION_KEY = 'hl.personal-team-fusion'

export const FUSION_EVENT = 'hl:fusion-changed'

/** 读开关状态；未设置或读取失败一律按「关闭」处理（安全默认）。 */
export function readFusion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(FUSION_KEY) === 'on'
  } catch {
    return false
  }
}

/** 写入开关状态并广播，让所有消费方立即重算。 */
export function writeFusion(on: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FUSION_KEY, on ? 'on' : 'off')
  } catch {
    // 隐私模式等：仅本次内存态，不阻塞 UI
  }
  window.dispatchEvent(new CustomEvent(FUSION_EVENT, { detail: { fusion: on } }))
}

/**
 * 团队工作区 id（由 ui-workspace 的隔离 effect 发布，来自 ds-bot 的
 * `/api/bot state`，是唯一权威，不靠标题匹配）。
 * @returns id，或未安装/未就绪时的 undefined。
 */
export function teamWorkspaceId(): string | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const id = (globalThis as { __hlTeamWorkspaceId?: unknown }).__hlTeamWorkspaceId
  return typeof id === 'string' && id !== '' ? id : undefined
}
