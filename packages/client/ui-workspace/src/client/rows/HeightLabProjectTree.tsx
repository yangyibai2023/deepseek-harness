/**
 * HeightLab 项目树（2026-11-14，O56 三轮定稿）——侧栏「项目」浏览视图。
 *
 * 像素级一致的构造保证：**直接复用原生 `ProjectRowItem` / `SessionNodeItem`**
 * （rows/Rows.tsx 导出的原生行组件）+ 原生 `sessionNode` 派生（tree.ts 导出）。
 * 项目组合成 GroupNode 形状喂给原生组件——组行/会话行的字体/间距/hover 卡/
 * 三点菜单/状态点全部由**原生组件自己渲染**，本项目零自定义行 UI。
 *
 * 数据 = localStorage `hl-projects-v1`（与 web-plugin heightlab-projects 同一
 * schema——**schema 即契约**；写入广播 `hl-projects-changed` 事件让本组件与
 * 插件互相同步）。
 *
 * 项目组是**虚拟 Workspace**（workspaceId = 项目 id 合成，cwd = undefined）：
 * 分组派生（成员归组/归档过滤/状态点）走原生 `sessionNode`，但「真移动」被
 * 明确排除——工作区仍 = 目录（设计文档 Phase 2 除外）。
 */
import { useEffect, useState } from 'react'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { sessionNode, type SessionRowState, type SessionStatuses } from '../tree.ts'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ProjectRowItem, SessionNodeItem } from './Rows.tsx'

/* ── 存储（schema 契约 = web-plugin heightlab-projects 的同一份）────────── */

interface ProjectRecord {
  id: string
  name: string
  createdAt: number
  order: number
}
interface MembershipRecord {
  sessionId: SessionId
  projectId: string
  addedAt: number
}
interface ProjectsStore {
  version: 1
  projects: ProjectRecord[]
  memberships: MembershipRecord[]
}

const STORE_KEY = 'hl-projects-v1'
const CHANGED_EVENT = 'hl-projects-changed'

function loadStore(): ProjectsStore {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectsStore
      if (parsed && parsed.version === 1) return parsed
    }
  } catch { /* 损坏即重建 */ }
  return { version: 1, projects: [], memberships: [] }
}
function saveStore(store: ProjectsStore): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
  } catch { /* 存储满：放弃 */ }
}
function listProjects(): ProjectRecord[] {
  return loadStore().projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt)
}
function membersOf(projectId: string): MembershipRecord[] {
  return loadStore().memberships.filter(m => m.projectId === projectId)
}
function createProject(name: string): ProjectRecord | null {
  const trimmed = name.trim().slice(0, 40)
  if (trimmed === '') return null
  const store = loadStore()
  const project: ProjectRecord = {
    id: 'proj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    createdAt: Date.now(),
    order: store.projects.length,
  }
  store.projects.push(project)
  saveStore(store)
  return project
}
function renameProject(projectId: string, name: string): void {
  const trimmed = name.trim().slice(0, 40)
  if (trimmed === '') return
  const store = loadStore()
  for (const p of store.projects) if (p.id === projectId) p.name = trimmed
  saveStore(store)
}
function deleteProject(projectId: string): void {
  const store = loadStore()
  store.projects = store.projects.filter(p => p.id !== projectId)
  store.memberships = store.memberships.filter(m => m.projectId !== projectId)
  saveStore(store)
}

/* ── 组件 ──────────────────────────────────────────────────────────────── */

type HeightLabProjectTreeProps =
  Pick<WorkspaceBrowserProps, 'open' | 'startSession' | 't'> & {
    /** 会话列表快照（成员标题 + mainView 判定） */
    list: SessionListState
    /** 会话状态 store（原生 sessionNode 派生用；调用点已在组件体顶层取好） */
    statuses: SessionStatuses
    /** 归档/置顶集合与过滤（原生行行为一致） */
    rowState: SessionRowState
    /** 组展开状态（与原生工作区组同一 store 机制） */
    groupExpansion: Readonly<Record<string, boolean>>
    /** 持久化一组展开状态 */
    setGroupExpanded: (key: string, expanded: boolean) => void
    /** 侧栏搜索框归一化查询（过滤成员标题） */
    query: string
    /** 原生重命名对话框（成员标题双击） */
    onSessionRenameRequest: (id: SessionId, currentTitle: string) => void
  } & PropsRenderSlots<
    | 'sidebar.workspaces.session.menu.item'
    | 'sidebar.workspaces.session.row.action'
    | 'sidebar.session.row.leading'
    | 'sidebar.session.row.hover'
  >

export function HeightLabProjectTree({
  list, statuses, rowState, groupExpansion, setGroupExpanded,
  query, open, onSessionRenameRequest, renderSlot, startSession, t,
}: HeightLabProjectTreeProps): React.JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = (): void => { bump(v => v + 1) }
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => { window.removeEventListener(CHANGED_EVENT, onChange) }
  }, [])
  /* 项目重命名/删除对话框状态（原生 Modal，照 RenameSession 形态） */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const commitRename = (id: string, name: string): void => {
    renameProject(id, name)
    setRenaming(null)
    bump(v => v + 1)
  }
  const commitDelete = (id: string): void => {
    deleteProject(id)
    setDeleting(null)
    bump(v => v + 1)
  }

  const pinned = new Set<SessionId>(rowState.pinnedSessionIds)
  const archived = new Set<SessionId>(rowState.archivedSessionIds)
  const now = Date.now()
  // 当前主视图会话（原生行高亮判据，与 SessionTree 同式）
  const current = Object.values(list.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
  const normalizedQuery = query.trim().toLowerCase()

  const projects = listProjects()
  const groups = projects.map((project) => {
    const key = 'project:' + project.id
    const members = membersOf(project.id)
    const sessions = members
      .map(m => list.byId[m.sessionId])
      .filter((s): s is SessionSummary => s !== undefined)
      .filter(s => normalizedQuery === ''
        || (typeof s.title === 'string' && s.title.toLowerCase().includes(normalizedQuery)))
      .map(s => sessionNode(s, list, statuses, pinned, archived))
    return {
      key,
      group: {
        key,
        workspaceId: project.id as WorkspaceId,
        cwd: undefined,
        createdAt: project.createdAt,
        label: project.name,
        sessionCount: sessions.length,
        expanded: groupExpansion[key] ?? true,
        containsCurrent: current !== undefined && members.some(m => m.sessionId === current),
        sessions: groupExpansion[key] === false ? [] : sessions,
      } satisfies import('../tree.ts').GroupNode,
      memberCount: members.length,
      project,
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px' }}>
      {groups.length === 0 && (
        <div style={{ padding: '10px 6px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#999)' }}>
          还没有项目——在对话三点菜单「加入项目…」里创建第一个
        </div>
      )}
      {groups.map(({ key, group, memberCount, project }) => {
        const expanded = group.expanded
        return (
          <div key={key}>
            <ProjectRowItem
              group={group}
              onToggle={() => { setGroupExpanded(key, !expanded) }}
              /* 项目内开新对话：新建空白会话（加入项目走三点菜单「加入项目…」） */
              onCreate={() => { startSession() }}
              actions={{
                rename: () => { setRenaming({ id: project.id, name: project.name }) },
                delete: () => { setDeleting({ id: project.id, name: project.name }) },
              }}
              t={t}
            />
            {expanded && memberCount === 0 && (
              <div style={{ padding: '4px 0 8px 22px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#999)' }}>
                （暂无对话——在对话三点菜单里加入）
              </div>
            )}
            {expanded && group.sessions.map(node => (
              <div key={node.id} style={{ paddingLeft: 18 }}>
                <SessionNodeItem
                  node={node}
                  currentId={current}
                  now={now}
                  onOpen={(id) => { open(id) }}
                  onRenameRequest={(id, title) => { onSessionRenameRequest(id, title) }}
                  renderSlot={renderSlot}
                  t={t}
                />
              </div>
            ))}
          </div>
        )
      })}
      <NewProjectRow onCreated={() => { bump(v => v + 1) }} />

      {/* 项目重命名对话框（原生 Modal，照 RenameSession 形态） */}
      {renaming !== null && (
        <Modal
          open
          onClose={() => { setRenaming(null) }}
          closeLabel='取消'
          title='重命名项目'
          footer={(
            <>
              <Button variant='outline' onClick={() => { setRenaming(null) }}>取消</Button>
              <Button onClick={() => { commitRename(renaming.id, renaming.name) }}>确定</Button>
            </>
          )}
        >
          <input
            value={renaming.name}
            autoFocus
            onChange={(e) => { setRenaming({ ...renaming, name: e.target.value }) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(renaming.id, renaming.name)
              if (e.key === 'Escape') setRenaming(null)
            }}
            style={{ width: '100%', border: '1px solid var(--dsw-alias-border-l2,#ddd)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'transparent', color: 'inherit', outline: 'none' }}
          />
        </Modal>
      )}

      {/* 项目删除确认对话框 */}
      {deleting !== null && (
        <Modal
          open
          onClose={() => { setDeleting(null) }}
          closeLabel='取消'
          title='删除项目'
          description={'删除「' + deleting.name + '」？对话本体不受影响，仅解除归属。'}
          footer={(
            <>
              <Button variant='outline' onClick={() => { setDeleting(null) }}>取消</Button>
              <Button onClick={() => { commitDelete(deleting.id) }}>删除</Button>
            </>
          )}
        >
          <div style={{ fontSize: 13, lineHeight: '20px' }}>此操作不可撤销（可先在对话三点菜单里移出需要的对话）。</div>
        </Modal>
      )}
    </div>
  )
}

/* ── 新建行 ────────────────────────────────────────────────────────────── */

function NewProjectRow({ onCreated }: { onCreated: () => void }): React.JSX.Element {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  if (!creating) {
    return (
      <button
        type='button'
        onClick={() => { setCreating(true) }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary,#666)', padding: '8px 6px', fontSize: 12, textAlign: 'left' }}
      >
        ＋ 新建项目
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 6px' }}>
      <input
        value={draft}
        autoFocus
        placeholder='项目名…'
        onChange={(e) => { setDraft(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { const p = createProject(draft); if (p !== null) onCreated(); setCreating(false); setDraft('') }
          if (e.key === 'Escape') { setCreating(false); setDraft('') }
        }}
        style={{ flex: 1, minWidth: 0, border: '1px solid var(--dsw-alias-border-l2,#ddd)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'transparent', color: 'inherit', outline: 'none' }}
      />
      <button
        type='button'
        onClick={() => { const p = createProject(draft); if (p !== null) onCreated(); setCreating(false); setDraft('') }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--dsw-alias-label-secondary,#666)' }}
      >
        创建
      </button>
      <button
        type='button'
        onClick={() => { setCreating(false); setDraft('') }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#999)' }}
      >
        取消
      </button>
    </div>
  )
}
