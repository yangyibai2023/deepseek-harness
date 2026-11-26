/**
 * resolveDefaultWorkspace 单测（2026-11-27，O105）。
 *
 * 钉住统一选择器的五层优先级与团队排除——这是「个人绝不停团队」铁律的
 * 启动路径执行者：auto-start / 归位 / navigation / 复刻入口四处共用。
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { resolveDefaultWorkspace, isTeamWorkspace } from '../src/client/default-workspace.ts'

const wid = (id: string): WorkspaceId => id as WorkspaceId
const sid = (id: string): SessionId => id as SessionId

const workspace = (
  id: string,
  options?: { title?: string; path?: string; sessionIds?: string[]; createdAt?: string },
): WorkspaceView => ({
  workspaceId: wid(id),
  path: options?.path ?? `/projects/${id}`,
  title: options?.title ?? id,
  sessionIds: (options?.sessionIds ?? []).map(sid) as WorkspaceView['sessionIds'],
  createdAt: options?.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const session = (updatedAt: number): SessionListState['byId'][SessionId] =>
  ({ updatedAt }) as SessionListState['byId'][SessionId]

afterEach(() => {
  delete (globalThis as { __hlTeamWorkspaceId?: unknown }).__hlTeamWorkspaceId
})

describe('isTeamWorkspace', () => {
  it('matches the authoritative ds-bot id when published', () => {
    ;(globalThis as { __hlTeamWorkspaceId?: unknown }).__hlTeamWorkspaceId = 'team-ws'
    expect(isTeamWorkspace({ workspaceId: wid('team-ws'), title: '随便什么' })).toBe(true)
    expect(isTeamWorkspace({ workspaceId: wid('other'), title: '团队' })).toBe(true) // 标题兜底仍在
    expect(isTeamWorkspace({ workspaceId: wid('other'), title: '我的工作区' })).toBe(false)
  })

  it('falls back to the title before the authoritative id is ready', () => {
    expect(isTeamWorkspace({ workspaceId: wid('x'), title: '团队' })).toBe(true)
    expect(isTeamWorkspace({ workspaceId: wid('x'), title: '我的工作区' })).toBe(false)
  })
})

describe('resolveDefaultWorkspace', () => {
  it('never returns the team workspace even when it is first in the registry (the O105 bug)', () => {
    const items = [
      workspace('team', { title: '团队' }),
      workspace('mine', { title: '我的工作区' }),
    ]
    expect(resolveDefaultWorkspace(items)).toBe(wid('mine'))
  })

  it('prefers the official title over recency', () => {
    const items = [
      workspace('recent-project', { title: '项目A', sessionIds: ['s1'] }),
      workspace('mine', { title: '我的工作区' }),
    ]
    const sessions = { s1: session(9999999999999) } as SessionListState['byId']
    expect(resolveDefaultWorkspace(items, sessions)).toBe(wid('mine'))
  })

  it('falls back to the HeightLab path suffix when the default was renamed', () => {
    const items = [
      workspace('a', { title: '随便', path: '/Users/x/HeightLab' }),
      workspace('b', { title: '别的' }),
    ]
    expect(resolveDefaultWorkspace(items)).toBe(wid('a'))
  })

  it('uses recency when neither title nor path matches', () => {
    const items = [
      workspace('old', { title: '旧项目', sessionIds: ['s-old'] }),
      workspace('new', { title: '新项目', sessionIds: ['s-new'] }),
    ]
    const sessions = {
      's-old': session(1000),
      's-new': session(2000),
    } as SessionListState['byId']
    expect(resolveDefaultWorkspace(items, sessions)).toBe(wid('new'))
  })

  it('falls back to the first non-team item without sessions', () => {
    const items = [
      workspace('team', { title: '团队' }),
      workspace('first-personal', { title: '甲' }),
      workspace('second', { title: '乙' }),
    ]
    expect(resolveDefaultWorkspace(items)).toBe(wid('first-personal'))
  })

  it('returns undefined when the registry is empty or all-team', () => {
    expect(resolveDefaultWorkspace([])).toBeUndefined()
    expect(resolveDefaultWorkspace([workspace('team', { title: '团队' })])).toBeUndefined()
  })
})
