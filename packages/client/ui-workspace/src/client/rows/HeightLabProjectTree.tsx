/**
 * HeightLab 项目树（2026-11-14，O56）——侧栏「项目」浏览视图。
 *
 * 侧栏滑块切到「项目」时，本组件替换原生工作区树：
 *   项目（文件夹图标 + 名称 + 成员数，行内 编辑 / 删除）
 *     └─ 成员对话（点击 = 打开；行内「移出」）
 *   ＋ 新建项目
 *
 * 数据 = localStorage `hl-projects-v1`（与 web-plugin heightlab-projects
 * 同一份 schema——**schema 即契约**，两侧各自持有同构读写函数；写入后
 * 广播 `hl-projects-changed` 事件让本组件与插件互相同步）。
 *
 * 已删除的对话成员：行标「（已不存在）」允许移出；@ 基线编译时跳过。
 */
import { useEffect, useState } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { IconEditOutlineRegular, IconFolderOpenOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/* ── 存储（schema 契约 = web-plugin heightlab-projects 的同一份）───────── */

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
function setMembership(sessionId: SessionId, projectId: string, member: boolean): void {
  const store = loadStore()
  store.memberships = store.memberships.filter(m => !(m.sessionId === sessionId && m.projectId === projectId))
  if (member) store.memberships.push({ sessionId, projectId, addedAt: Date.now() })
  saveStore(store)
}

/* ── 组件 ──────────────────────────────────────────────────────────────── */

export function HeightLabProjectTree({ list, query, open }: {
  /** 会话列表（标题/时间解析用）——父级已注入 */
  list: SessionListState
  /** 侧栏搜索框的归一化查询（projects 模式下过滤成员标题） */
  query: string
  /** 打开对话（父级已接守卫链） */
  open: (sessionId: SessionId) => void
}): React.JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = (): void => { bump(v => v + 1) }
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => { window.removeEventListener(CHANGED_EVENT, onChange) }
  }, [])

  const projects = listProjects()
  const normalizedQuery = query.trim().toLowerCase()
  const match = (title: string): boolean =>
    normalizedQuery === '' || title.toLowerCase().includes(normalizedQuery)

  const rows: React.JSX.Element[] = []
  for (const project of projects) {
    const members = membersOf(project.id)
    const visibleMembers = members
      .map(m => ({ m, summary: list.byId[m.sessionId] }))
      .filter(({ summary }) => summary === undefined || summary === null
        || match(typeof summary.title === 'string' && summary.title !== '' ? summary.title : '(未命名)'))
    if (normalizedQuery !== '' && visibleMembers.length === 0) continue

    rows.push(<ProjectSection
      key={project.id}
      project={project}
      members={visibleMembers}
      open={open}
      onRename={(name) => { renameProject(project.id, name) }}
      onDelete={() => { deleteProject(project.id) }}
      onRemoveMember={(sessionId) => { setMembership(sessionId, project.id, false) }}
    />)
  }
  if (normalizedQuery !== '' && rows.length === 0) {
    rows.push(<div key='none' style={{ padding: '10px 6px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#999)' }}>
      没有匹配「{query.trim()}」的项目对话
    </div>)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px' }}>
      {rows}
      <NewProjectRow onCreated={(id) => { bump(v => v + 1); void id }} />
    </div>
  )
}

/* ── 项目 section（可展开）─────────────────────────────────────────────── */

function ProjectSection({ project, members, open, onRename, onDelete, onRemoveMember }: {
  project: ProjectRecord
  members: { m: MembershipRecord; summary: { title?: unknown; updatedAt?: unknown } | null | undefined }[]
  open: (sessionId: SessionId) => void
  onRename: (name: string) => void
  onDelete: () => void
  onRemoveMember: (sessionId: SessionId) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draftName, setDraftName] = useState(project.name)

  const titleRow: React.JSX.Element = renaming
    ? (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          value={draftName}
          autoFocus
          onChange={(e) => { setDraftName(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onRename(draftName); setRenaming(false) }
            if (e.key === 'Escape') setRenaming(false)
          }}
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--dsw-alias-border-l2,#ddd)', borderRadius: 6, padding: '3px 8px', fontSize: 12, background: 'transparent', color: 'inherit', outline: 'none' }}
        />
        <ActionChip label='确定' onClick={() => { onRename(draftName); setRenaming(false) }} />
        <ActionChip label='取消' onClick={() => setRenaming(false)} />
      </div>
    )
    : deleting
      ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            删除「{project.name}」？对话本体不受影响
          </span>
          <ActionChip label='删除' danger onClick={() => { onDelete(); }} />
          <ActionChip label='取消' onClick={() => setDeleting(false)} />
        </div>
      )
      : (
        <>
          <button
            type='button'
            onClick={() => { setExpanded(v => !v) }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: '3px 0', flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ flex: 'none', display: 'inline-flex' }}><IconFolderOpenOutlineRegular size={13} /></span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
            <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary,#999)', flex: 'none' }}>{members.length}</span>
          </button>
          <ActionChip icon={<IconEditOutlineRegular size={12} />} title='重命名' onClick={() => { setDraftName(project.name); setRenaming(true) }} />
          <ActionChip icon={<IconTrashOutlineRegular size={12} />} title='删除项目' onClick={() => setDeleting(true)} />
        </>
      )

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 8 }}>{titleRow}</div>
      {expanded && (
        <div style={{ padding: '0 0 4px 18px' }}>
          {members.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#999)', padding: '4px 0' }}>（暂无对话——在对话三点菜单里加入）</div>
            : members.map(({ m, summary }) => {
              const exists = summary !== undefined && summary !== null
              const title = exists && typeof summary.title === 'string' && summary.title !== '' ? summary.title : '(未命名)'
              return (
                <div key={`${m.sessionId}-${m.addedAt}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type='button'
                    disabled={!exists}
                    onClick={() => { open(m.sessionId) }}
                    style={{ border: 'none', background: 'transparent', cursor: exists ? 'pointer' : 'default', color: 'var(--dsw-alias-label-secondary,#444)', padding: '4px 0', flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: exists ? 1 : 0.6 }}
                    title={exists ? '打开这个对话' : '对话已删除，可移出'}
                  >
                    {title}{exists ? '' : '（已不存在）'}
                  </button>
                  <ActionChip label='移出' onClick={() => { onRemoveMember(m.sessionId) }} />
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

/* ── 新建行 ────────────────────────────────────────────────────────────── */

function NewProjectRow({ onCreated }: { onCreated: (id: string) => void }): React.JSX.Element {
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
          if (e.key === 'Enter') { const p = createProject(draft); if (p !== null) onCreated(p.id); setCreating(false); setDraft('') }
          if (e.key === 'Escape') { setCreating(false); setDraft('') }
        }}
        style={{ flex: 1, minWidth: 0, border: '1px solid var(--dsw-alias-border-l2,#ddd)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'transparent', color: 'inherit', outline: 'none' }}
      />
      <ActionChip label='创建' onClick={() => { const p = createProject(draft); if (p !== null) onCreated(p.id); setCreating(false); setDraft('') }} />
      <ActionChip label='取消' onClick={() => { setCreating(false); setDraft('') }} />
    </div>
  )
}

/* ── 小工具 ────────────────────────────────────────────────────────────── */

function ActionChip({ label, icon, title, onClick, danger }: {
  label?: string
  icon?: React.JSX.Element
  title?: string
  onClick: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      type='button'
      title={title}
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: danger ? 12 : 11,
        padding: '2px 4px',
        borderRadius: 6,
        color: danger ? 'var(--dsw-alias-label-error,#c00)' : 'var(--dsw-alias-label-tertiary,#888)',
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {icon ?? label}
    </button>
  )
}
