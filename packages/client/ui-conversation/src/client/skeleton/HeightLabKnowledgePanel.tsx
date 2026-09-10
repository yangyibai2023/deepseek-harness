/**
 * HeightLab：知识库原生管理面板。
 *
 * 上下布局：顶部一排「新建知识库 / 新建分组」操作，下方按分组列出已有
 * 知识库；选中知识库后再往下展示文档列表（添加文本 / 上传文件 / 添加网址）。
 * 全部使用 DSW 原生 token，不再使用插件自带整页/左右分栏 UI。
 */

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import css from './ConversationRoot.module.css'

interface BaseSummary {
  id: string
  name: string
  description: string
  group?: string
  documentCount: number
  chunkCount: number
  charCount: number
  tokenCount: number
  createdAt: number
  updatedAt: number
}

interface DocumentSummary {
  id: string
  baseId: string
  title: string
  sourceType: 'text' | 'file' | 'url' | 'directory'
  fileName?: string
  url?: string
  charCount: number
  chunkCount: number
  embedded: boolean
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: number
}

interface Envelope<T> {
  ok: boolean
  value: T
  error?: { message?: string }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const options: RequestInit = { ...init }
  if (init?.body !== undefined) options.headers = { 'content-type': 'application/json' }
  const res = await fetch(`/knowledge${path}`, options)
  const data = (await res.json()) as Envelope<T>
  if (!data.ok) throw new Error(data.error?.message ?? '请求失败')
  return data.value
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const fieldStyle: CSSProperties = { marginBottom: 12 }

export function HeightLabKnowledgePanel() {
  const [bases, setBases] = useState<BaseSummary[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [dragOver, setDragOver] = useState(false)
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [contentDoc, setContentDoc] = useState<DocumentSummary | null>(null)
  const [contentText, setContentText] = useState('')
  const [renameDoc, setRenameDoc] = useState<DocumentSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [dialog, setDialog] = useState<'newBase' | 'newGroup' | 'addText' | 'addUrl' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async (): Promise<void> => {
    try {
      const [nextBases, nextGroups] = await Promise.all([
        api<BaseSummary[]>('/bases'),
        api<string[]>('/groups'),
      ])
      setBases(nextBases)
      setGroups(nextGroups)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载知识库失败')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (selectedBaseId === null) {
      setDocs([])
      return
    }
    void (async () => {
      try {
        setDocs(await api<DocumentSummary[]>(`/bases/${encodeURIComponent(selectedBaseId)}/documents`))
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载文档失败')
      }
    })()
  }, [selectedBaseId])

  const flash = (text: string): void => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const createBase = async (name: string, description: string, group: string): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const created = await api<BaseSummary>('/bases', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          ...(group.trim() !== '' ? { group: group.trim() } : {}),
        }),
      })
      setDialog(null)
      await refresh()
      setSelectedBaseId(created.id)
      flash(`已创建知识库「${created.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建知识库失败')
    } finally {
      setBusy(false)
    }
  }

  const createGroup = async (name: string): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await api<unknown>('/groups', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      setDialog(null)
      await refresh()
      flash(`已创建分组「${name.trim()}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建分组失败')
    } finally {
      setBusy(false)
    }
  }

  const addText = async (title: string, content: string): Promise<void> => {
    if (selectedBaseId === null || !title.trim() || !content.trim() || busy) return
    setBusy(true)
    try {
      await api<unknown>(`/bases/${encodeURIComponent(selectedBaseId)}/documents`, {
        method: 'POST',
        body: JSON.stringify({ baseId: selectedBaseId, title: title.trim(), content }),
      })
      setDialog(null)
      await refreshSelectedDocs(selectedBaseId)
      flash('已添加文档')
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加文档失败')
    } finally {
      setBusy(false)
    }
  }

  const addUrl = async (url: string): Promise<void> => {
    if (selectedBaseId === null || !url.trim() || busy) return
    setBusy(true)
    try {
      await api<unknown>(`/bases/${encodeURIComponent(selectedBaseId)}/documents`, {
        method: 'POST',
        body: JSON.stringify({ baseId: selectedBaseId, url: url.trim() }),
      })
      setDialog(null)
      await refreshSelectedDocs(selectedBaseId)
      flash('已添加网址')
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加网址失败')
    } finally {
      setBusy(false)
    }
  }

  const refreshSelectedDocs = async (baseId: string): Promise<void> => {
    try {
      setDocs(await api<DocumentSummary[]>(`/bases/${encodeURIComponent(baseId)}/documents`))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文档失败')
    }
  }

  const uploadFile = async (baseId: string, file: File): Promise<void> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
    const contentBase64 = base64.split(',')[1] ?? base64
    await api<unknown>(`/bases/${encodeURIComponent(baseId)}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        baseId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      }),
    })
  }

  const onFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || selectedBaseId === null || busy) return
    setBusy(true)
    try {
      await uploadFile(selectedBaseId, file)
      await refreshSelectedDocs(selectedBaseId)
      flash(`已上传「${file.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传文件失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0 || busy) return
    setBusy(true)
    try {
      let baseId = selectedBaseId
      if (baseId === null) {
        const stamp = new Date()
        const name = `导入-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
        const created = await api<BaseSummary>('/bases', {
          method: 'POST',
          body: JSON.stringify({ name, description: '拖拽导入' }),
        })
        await refresh()
        setSelectedBaseId(created.id)
        baseId = created.id
        flash(`已自动创建知识库「${name}」`)
      }
      for (const file of list) {
        await uploadFile(baseId, file)
      }
      await refreshSelectedDocs(baseId)
      flash(`已上传 ${list.length} 个文件`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '拖拽上传失败')
    } finally {
      setBusy(false)
      setDragOver(false)
    }
  }

  const deleteDoc = async (doc: DocumentSummary): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await api<unknown>(`/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
      if (selectedBaseId !== null) await refreshSelectedDocs(selectedBaseId)
      flash(`已删除「${doc.title}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除文档失败')
    } finally {
      setBusy(false)
    }
  }

  const openContentEdit = async (doc: DocumentSummary): Promise<void> => {
    setContentText('')
    if (doc.sourceType === 'text' || doc.sourceType === 'file') {
      try {
        const detail = await api<{ rawText?: string }>(`/documents/${encodeURIComponent(doc.id)}?rawTextLimit=200000&includeChunks=false`)
        setContentText(detail.rawText ?? '')
      } catch {
        setContentText('')
      }
    }
    setContentDoc(doc)
  }

  const saveContent = async (content: string): Promise<void> => {
    if (contentDoc === null || !['text', 'file'].includes(contentDoc.sourceType) || busy) return
    setBusy(true)
    try {
      await api<unknown>(`/documents/${encodeURIComponent(contentDoc.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      setContentDoc(null)
      if (selectedBaseId !== null) await refreshSelectedDocs(selectedBaseId)
      flash('已保存修改')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存修改失败')
    } finally {
      setBusy(false)
    }
  }

  const openRename = (doc: DocumentSummary): void => {
    setRenameTitle(doc.title)
    setRenameDoc(doc)
  }

  const saveRename = async (title: string): Promise<void> => {
    if (renameDoc === null || !title.trim() || busy) return
    setBusy(true)
    try {
      await api<unknown>(`/documents/${encodeURIComponent(renameDoc.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim() }),
      })
      setRenameDoc(null)
      if (selectedBaseId !== null) await refreshSelectedDocs(selectedBaseId)
      flash('已重命名')
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败')
    } finally {
      setBusy(false)
    }
  }

  const selectedBase = bases.find(base => base.id === selectedBaseId) ?? null
  const sortedBases = [...bases].sort((left, right) =>
    right.charCount - left.charCount || right.documentCount - left.documentCount)
  const visibleBases = selectedGroup === 'all'
    ? sortedBases
    : selectedGroup === 'none'
      ? sortedBases.filter(base => !base.group)
      : sortedBases.filter(base => base.group === selectedGroup)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={css.libraryBody}>
        <div className={css.libraryLeft}>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => setDialog('newGroup')}
            style={{ marginBottom: 6 }}
          >
            ＋ 新建分组
          </button>
          <button
            type="button"
            className={selectedGroup === 'all' ? `${css.libraryGroupRow} ${css.libraryGroupRowActive}` : css.libraryGroupRow}
            onClick={() => setSelectedGroup('all')}
          >
            全部
          </button>
          {groups.map(group => (
            <button
              key={group}
              type="button"
              className={selectedGroup === group ? `${css.libraryGroupRow} ${css.libraryGroupRowActive}` : css.libraryGroupRow}
              onClick={() => setSelectedGroup(group)}
            >
              {group}
            </button>
          ))}
          <button
            type="button"
            className={selectedGroup === 'none' ? `${css.libraryGroupRow} ${css.libraryGroupRowActive}` : css.libraryGroupRow}
            onClick={() => setSelectedGroup('none')}
          >
            未分组
          </button>
        </div>

        <div
          className={css.libraryRight}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            void handleDrop(event.dataTransfer.files)
          }}
        >
          {error !== '' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{error}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <button type="button" className={css.libraryPrimaryButton} onClick={() => setDialog('newBase')}>
              ＋ 新建知识库
            </button>
            <span style={{ flex: 1 }} />
            {notice !== '' && (
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{notice}</span>
            )}
          </div>

          <div
            className={dragOver ? `${css.libraryDropZone} ${css.libraryDropZoneActive}` : css.libraryDropZone}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void handleDrop(event.dataTransfer.files)
            }}
          >
            将文件拖到这里：自动新建知识库并上传
          </div>

          {visibleBases.map(base => renderBase(base))}

          {visibleBases.length === 0 && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
              还没有知识库，点击「新建知识库」或直接拖入文件
            </div>
          )}

          {selectedBase !== null && (
            <section style={{ marginTop: 20 }}>
              <div className={css.librarySectionTitle}>
                {selectedBase.name} · 文档（{docs.length}）
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" className={css.libraryActionButton} onClick={() => setDialog('addText')}>＋ 添加文本</button>
                <button type="button" className={css.libraryActionButton} onClick={() => fileRef.current?.click()}>＋ 上传文件</button>
                <button type="button" className={css.libraryActionButton} onClick={() => setDialog('addUrl')}>＋ 添加网址</button>
              </div>
              {docs.length === 0 ? (
                <div style={{ padding: '24px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>
                  暂无文档，添加后即可在对话中检索使用
                </div>
              ) : (
                docs.map(doc => (
                  <div key={doc.id} className={css.libraryDocRow}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                        {doc.sourceType === 'file' ? doc.fileName ?? doc.title : doc.sourceType === 'url' ? doc.url ?? '' : doc.sourceType}
                        {' · '}{doc.chunkCount} 分块
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 6, flexShrink: 0, paddingLeft: 20 }}>
                      <button
                        type="button"
                        className={css.libraryActionButton}
                        onClick={() => { void openContentEdit(doc) }}
                        style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        className={css.libraryActionButton}
                        onClick={() => openRename(doc)}
                        style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        className={css.libraryActionButton}
                        onClick={() => { void deleteDoc(doc) }}
                        style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      >
                        删除
                      </button>
                    </span>
                  </div>
                ))
              )}
            </section>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.csv,.html,.htm,.json,.log,.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.epub"
        style={{ display: 'none' }}
        onChange={(event) => { void onFilePicked(event) }}
      />

      {dialog === 'newBase' && (
        <NewBaseDialog
          groups={groups}
          busy={busy}
          onClose={() => setDialog(null)}
          onCreate={(name, description, group) => { void createBase(name, description, group) }}
        />
      )}
      {dialog === 'newGroup' && (
        <NameDialog
          title="新建分组"
          placeholder="分组名称"
          busy={busy}
          onClose={() => setDialog(null)}
          onOk={(name) => { void createGroup(name) }}
        />
      )}
      {dialog === 'addText' && (
        <AddTextDialog busy={busy} onClose={() => setDialog(null)} onAdd={(title, content) => { void addText(title, content) }} />
      )}
      {dialog === 'addUrl' && (
        <UrlDialog busy={busy} onClose={() => setDialog(null)} onAdd={(url) => { void addUrl(url) }} />
      )}
      {contentDoc !== null && (
        <ContentEditDialog
          doc={contentDoc}
          initialContent={contentText}
          busy={busy}
          onClose={() => setContentDoc(null)}
          onSave={(content) => { void saveContent(content) }}
        />
      )}
      {renameDoc !== null && (
        <RenameDialog
          doc={renameDoc}
          initialTitle={renameTitle}
          busy={busy}
          onClose={() => setRenameDoc(null)}
          onSave={(title) => { void saveRename(title) }}
        />
      )}
    </div>
  )

  function renderBase(base: BaseSummary) {
    const active = base.id === selectedBaseId
    return (
      <button
        key={base.id}
        type="button"
        className={active ? `${css.libraryBaseRow} ${css.libraryBaseRowActive}` : css.libraryBaseRow}
        onClick={() => setSelectedBaseId(base.id)}
      >
        <span className={css.libraryBaseAvatar}>
          {base.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600 }}>{base.name}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
            {base.documentCount} 文档 · {(base.charCount / 1024).toFixed(1)} KB
            {base.group ? ` · ${base.group}` : ''}
          </span>
        </span>
      </button>
    )
  }
}

function NewBaseDialog(props: {
  groups: string[]
  busy: boolean
  onClose: () => void
  onCreate: (name: string, description: string, group: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [group, setGroup] = useState('')
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>新建知识库</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>名称</label>
          <input className={css.libraryInput} autoFocus placeholder="知识库名称" value={name} onChange={event => setName(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>描述</label>
          <textarea className={css.libraryTextarea} value={description} onChange={event => setDescription(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>分组</label>
          <select className={css.libraryInput} value={group} onChange={event => setGroup(event.target.value)}>
            <option value="">未分组</option>
            {props.groups.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || name.trim() === ''}
            onClick={() => props.onCreate(name, description, group)}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

function NameDialog(props: {
  title: string
  placeholder: string
  busy: boolean
  onClose: () => void
  onOk: (name: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>{props.title}</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>名称</label>
          <input
            className={css.libraryInput}
            autoFocus
            placeholder={props.placeholder}
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim() !== '') props.onOk(name)
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || name.trim() === ''}
            onClick={() => props.onOk(name)}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

function AddTextDialog(props: {
  busy: boolean
  onClose: () => void
  onAdd: (title: string, content: string) => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>添加文本</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} autoFocus placeholder="文档标题" value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>内容</label>
          <textarea className={css.libraryTextarea} value={content} onChange={event => setContent(event.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || title.trim() === '' || content.trim() === ''}
            onClick={() => props.onAdd(title, content)}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}

function UrlDialog(props: {
  busy: boolean
  onClose: () => void
  onAdd: (url: string) => void
}) {
  const [url, setUrl] = useState('')
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>添加网址</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>网址</label>
          <input className={css.libraryInput} autoFocus placeholder="https://example.com" value={url} onChange={event => setUrl(event.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || url.trim() === ''}
            onClick={() => props.onAdd(url)}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}

function ContentEditDialog(props: {
  doc: DocumentSummary
  initialContent: string
  busy: boolean
  onClose: () => void
  onSave: (content: string) => void
}) {
  const [content, setContent] = useState(props.initialContent)
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>修改文档内容</div>
        <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 10 }}>
          {props.doc.title} · {props.doc.sourceType}
        </div>
        {['text', 'file'].includes(props.doc.sourceType) ? (
          <div style={fieldStyle}>
            <label style={labelStyle}>内容</label>
            <textarea
              className={css.libraryTextarea}
              placeholder="文档内容"
              autoFocus
              value={content}
              onChange={event => setContent(event.target.value)}
              style={{ minHeight: 260 }}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
            该文档为{props.doc.sourceType === 'file' ? '文件' : '网址'}，暂不支持直接编辑内容
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          {['text', 'file'].includes(props.doc.sourceType) && (
            <button
              type="button"
              className={css.libraryPrimaryButton}
              disabled={props.busy}
              onClick={() => props.onSave(content)}
            >
              保存
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RenameDialog(props: {
  doc: DocumentSummary
  initialTitle: string
  busy: boolean
  onClose: () => void
  onSave: (title: string) => void
}) {
  const [title, setTitle] = useState(props.initialTitle)
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>重命名文档</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} autoFocus placeholder="文档标题" value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || title.trim() === ''}
            onClick={() => props.onSave(title)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
