/**
 * HeightLab：素材管理原生面板。
 *
 * 与知识库同款左右布局：左侧分类，右侧素材列表；支持搜索、扫描已有素材、
 * 查看/修改/删除。纯黑白灰原生风格，不带图标。
 */

import { useEffect, useState, type CSSProperties } from 'react'
import css from './ConversationRoot.module.css'

interface ArtifactItem {
  id: string
  title: string
  filename: string
  path: string
  summary: string
  artifact_type: string
  tags: string[]
  size_bytes: number
  stars?: number
  references?: string[]
  created_at: number
  trashed_at: number | null
}

const CATEGORIES = ['全部', '图片', '视频', '音频', '文档', '代码', '其他', '回收站'] as const
type Category = typeof CATEGORIES[number]

const TYPE_MAP: Record<string, Category> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  code: '代码',
  archive: '其他',
  other: '其他',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const fieldStyle: CSSProperties = { marginBottom: 12 }

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function HeightLabMaterialPanel() {
  const [items, setItems] = useState<ArtifactItem[]>([])
  const [category, setCategory] = useState<Category>('全部')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card')
  const [sort, setSort] = useState<'new' | 'old' | 'sizeDesc' | 'sizeAsc'>('new')
  const [viewItem, setViewItem] = useState<ArtifactItem | null>(null)
  const [editItem, setEditItem] = useState<ArtifactItem | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [cleanupText, setCleanupText] = useState('')
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [linkItem, setLinkItem] = useState<ArtifactItem | null>(null)
  const [linkSuggestions, setLinkSuggestions] = useState<Array<{ id: string; title?: string; reason?: string; score?: number }>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = async (): Promise<void> => {
    try {
      const data = await (await fetch('/ext/artifacts?limit=500')).json()
      setItems(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载素材失败')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const flash = (text: string): void => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const scanExisting = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/ext/artifacts/scan-existing', { method: 'POST' })
      const data = await res.json() as { added?: number; skipped?: number }
      await refresh()
      flash(`已扫描：新增 ${data.added ?? 0} 个，跳过 ${data.skipped ?? 0} 个`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描已有素材失败')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (title: string, summary: string, tags: string, stars: number): Promise<void> => {
    if (editItem === null || !title.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/ext/artifacts/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          tags: tags.split(/[,，]/).map(item => item.trim()).filter(Boolean),
          stars,
        }),
      })
      if (!res.ok) throw new Error('保存失败')
      setEditItem(null)
      await refresh()
      flash('已保存修改')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存修改失败')
    } finally {
      setBusy(false)
    }
  }

  const registerItem = async (path: string, title: string, artifactType: string, tags: string): Promise<void> => {
    if (!path.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/ext/artifacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: path.trim(),
          title: title.trim() || undefined,
          artifact_type: artifactType,
          tags: tags.split(/[,，]/).map(item => item.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error('登记失败')
      setRegisterOpen(false)
      await refresh()
      flash('已登记素材')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登记素材失败')
    } finally {
      setBusy(false)
    }
  }

  const restoreItem = async (item: ArtifactItem): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await fetch(`/ext/artifacts/${item.id}/restore`, { method: 'POST' })
      await refresh()
      flash(`已恢复「${item.title}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复素材失败')
    } finally {
      setBusy(false)
    }
  }

  const hardDeleteItem = async (item: ArtifactItem): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await fetch(`/ext/artifacts/${item.id}`, { method: 'DELETE' })
      await refresh()
      flash(`已永久删除「${item.title}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除素材失败')
    } finally {
      setBusy(false)
    }
  }

  const loadCleanup = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/ext/artifacts/suggest-cleanup')
      const data = await res.json() as Record<string, unknown>
      setCleanupText(JSON.stringify(data, null, 2))
      setCleanupOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取整理建议失败')
    } finally {
      setBusy(false)
    }
  }

  const runRefine = (): void => {
    // 回到聊天页，让当前对话的 Colin/专家直接调用素材库工具精化，
    // 避免 apiProxy 独立会话的 agent-busy/序列化问题。
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hl:send-template', {
        detail: {
          text: '请用素材库工具精化所有待精化素材：先 artifact_list refine=1 查看，再逐条 artifact_update 补全摘要、标签、项目、标题，最后用 artifact_list refine=1 复核是否全部完成。',
        },
      }))
    }, 200)
  }

  const openLinks = async (item: ArtifactItem): Promise<void> => {
    try {
      const data = await (await fetch(`/ext/artifacts/${item.id}/related?limit=8`)).json() as { links?: Array<{ id: string; title?: string; reason?: string; score?: number }> }
      setLinkSuggestions(data.links ?? [])
      setLinkItem(item)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取连线建议失败')
    }
  }

  const applyLink = async (targetId: string): Promise<void> => {
    if (linkItem === null || busy) return
    setBusy(true)
    try {
      const current = [...(linkItem.references ?? [])]
      if (!current.includes(targetId)) current.push(targetId)
      const res = await fetch(`/ext/artifacts/${linkItem.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ references: current }),
      })
      if (!res.ok) throw new Error('应用关联失败')
      setLinkItem(null)
      await refresh()
      flash('已应用关联')
    } catch (err) {
      setError(err instanceof Error ? err.message : '应用关联失败')
    } finally {
      setBusy(false)
    }
  }

  const downloadItem = async (item: ArtifactItem): Promise<void> => {
    try {
      const res = await fetch(`/ext/artifacts/${item.id}/file`)
      if (!res.ok) throw new Error('下载失败')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.filename || item.title || 'download'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载素材失败')
    }
  }

  const trashItem = async (item: ArtifactItem): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await fetch(`/ext/artifacts/${item.id}/trash`, { method: 'POST' })
      await refresh()
      flash(`已删除「${item.title}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除素材失败')
    } finally {
      setBusy(false)
    }
  }

  const showTrash = category === '回收站'
  const filtered = items
    .filter(item => showTrash ? item.trashed_at !== null : item.trashed_at === null)
    .filter(item => category === '全部' || TYPE_MAP[item.artifact_type] === category)
    .filter(item => search.trim() === ''
      || item.title.toLowerCase().includes(search.trim().toLowerCase())
      || item.filename.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => {
      if (sort === 'old') return left.created_at - right.created_at
      if (sort === 'sizeDesc') return right.size_bytes - left.size_bytes
      if (sort === 'sizeAsc') return left.size_bytes - right.size_bytes
      return right.created_at - left.created_at
    })

  const actionButtons = (item: ArtifactItem) => (
    <span style={{ display: 'flex', gap: 4, flexShrink: 0, paddingLeft: 8, flexWrap: 'wrap' }}>
      {showTrash ? (
        <>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => { void restoreItem(item) }}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            恢复
          </button>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => { void hardDeleteItem(item) }}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            永久删除
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => setViewItem(item)}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            查看
          </button>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => { void downloadItem(item) }}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            下载
          </button>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => { void openLinks(item) }}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            连线
          </button>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => setEditItem(item)}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            修改
          </button>
          <button
            type="button"
            className={css.libraryActionButton}
            onClick={() => { void trashItem(item) }}
            style={{ height: 22, padding: '0 5px', fontSize: 11 }}
          >
            删除
          </button>
        </>
      )}
    </span>
  )

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={css.libraryBody}>
        <div className={css.libraryLeft}>
          {CATEGORIES.map(name => (
            <button
              key={name}
              type="button"
              className={category === name ? `${css.libraryGroupRow} ${css.libraryGroupRowActive}` : css.libraryGroupRow}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className={css.libraryRight}>
          {error !== '' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{error}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'nowrap' }}>
            <input
              className={css.libraryInput}
              placeholder="搜索素材"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 150, flexShrink: 0 }}
            />
            <button type="button" className={css.libraryPrimaryButton} onClick={() => { void scanExisting() }} style={{ height: 26, padding: '0 10px', fontSize: 12 }}>
              扫描
            </button>
            <button type="button" className={css.libraryActionButton} onClick={() => setRegisterOpen(true)} style={{ height: 26, padding: '0 10px', fontSize: 12 }}>
              登记
            </button>
            <a className={css.libraryActionButton} href="/ext/artifacts/export" download style={{ textDecoration: 'none', height: 26, padding: '0 10px', fontSize: 12, lineHeight: '26px' }}>
              导出
            </a>
            <button type="button" className={css.libraryActionButton} onClick={() => { void loadCleanup() }} style={{ height: 26, padding: '0 10px', fontSize: 12 }}>
              整理
            </button>
            <button type="button" className={css.libraryActionButton} onClick={() => { void runRefine() }} style={{ height: 26, padding: '0 10px', fontSize: 12 }}>
              精化
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? `${css.libraryActionButton} ${css.libraryGroupRowActive}` : css.libraryActionButton}
              onClick={() => setViewMode('list')}
              style={{ height: 26, padding: '0 10px', fontSize: 12 }}
            >
              列表
            </button>
            <button
              type="button"
              className={viewMode === 'card' ? `${css.libraryActionButton} ${css.libraryGroupRowActive}` : css.libraryActionButton}
              onClick={() => setViewMode('card')}
              style={{ height: 26, padding: '0 10px', fontSize: 12 }}
            >
              卡片
            </button>
            <select
              className={css.libraryInput}
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              style={{ width: 120, flexShrink: 0, height: 26, padding: '0 4px', fontSize: 12 }}
            >
              <option value="new">时间 新→旧</option>
              <option value="old">时间 旧→新</option>
              <option value="sizeDesc">大小 大→小</option>
              <option value="sizeAsc">大小 小→大</option>
            </select>
            <span style={{ flex: 1 }} />
            {notice !== '' && <span style={{ display: 'none' }}>{notice}</span>}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
              暂无素材，新生成的图片/视频会自动入库，也可点击「扫描」补录
            </div>
          ) : viewMode === 'card' ? (
            <div className={css.libraryCardGrid}>
              {filtered.map(item => (
                <div key={item.id} className={css.libraryCard}>
                  <div className={css.libraryCardThumb}>
                    {item.artifact_type === 'image' ? (
                      <img src={`/ext/artifacts/${item.id}/file`} alt="" loading="lazy" />
                    ) : (
                      TYPE_MAP[item.artifact_type] ?? '素材'
                    )}
                  </div>
                  <span className={css.libraryCardTitle}>{item.title || item.filename}</span>
                  <span className={css.libraryCardMeta}>
                    {TYPE_MAP[item.artifact_type] ?? '其他'} · {formatSize(item.size_bytes)}
                    {item.tags.length > 0 ? ` · ${item.tags.join(' / ')}` : ''}
                  </span>
                  <span className={css.libraryCardActions}>{actionButtons(item)}</span>
                </div>
              ))}
            </div>
          ) : (
            filtered.map(item => (
              <div key={item.id} className={css.libraryDocRow}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title || item.filename}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                    {TYPE_MAP[item.artifact_type] ?? '其他'} · {formatSize(item.size_bytes)}
                    {item.tags.length > 0 ? ` · ${item.tags.join(' / ')}` : ''}
                  </span>
                </span>
                {actionButtons(item)}
              </div>
            ))
          )}
        </div>
      </div>

      {viewItem !== null && (
        <MaterialViewDialog item={viewItem} onClose={() => setViewItem(null)} />
      )}
      {editItem !== null && (
        <MaterialEditDialog
          item={editItem}
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={(title, summary, tags, stars) => { void saveEdit(title, summary, tags, stars) }}
        />
      )}
      {registerOpen && (
        <RegisterDialog busy={busy} onClose={() => setRegisterOpen(false)} onRegister={(path, title, type, tags) => { void registerItem(path, title, type, tags) }} />
      )}
      {cleanupOpen && (
        <CleanupDialog text={cleanupText} onClose={() => setCleanupOpen(false)} />
      )}
      {linkItem !== null && (
        <LinkDialog
          item={linkItem}
          suggestions={linkSuggestions}
          busy={busy}
          onClose={() => setLinkItem(null)}
          onApply={(id) => { void applyLink(id) }}
        />
      )}
    </div>
  )
}

function MaterialViewDialog(props: { item: ArtifactItem; onClose: () => void }) {
  const { item } = props
  const src = `/ext/artifacts/${item.id}/file`
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={(event) => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>{item.title || item.filename}</div>
        {item.artifact_type === 'image' && (
          <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '52vh', objectFit: 'contain', borderRadius: 8, display: 'block', margin: '0 auto' }} />
        )}
        {item.artifact_type === 'video' && (
          <video src={src} controls style={{ width: '100%', maxHeight: '52vh', borderRadius: 8, background: '#000' }} />
        )}
        {item.artifact_type === 'audio' && (
          <audio src={src} controls style={{ width: '100%' }} />
        )}
        {!['image', 'video', 'audio'].includes(item.artifact_type) && (
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
            {item.summary || '无摘要'}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' }}>
          {item.filename} · {formatSize(item.size_bytes)} · {item.path}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

function MaterialEditDialog(props: {
  item: ArtifactItem
  busy: boolean
  onClose: () => void
  onSave: (title: string, summary: string, tags: string, stars: number) => void
}) {
  const [title, setTitle] = useState(props.item.title)
  const [summary, setSummary] = useState(props.item.summary)
  const [tags, setTags] = useState(props.item.tags.join('，'))
  const [stars, setStars] = useState(props.item.stars ?? 0)
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={(event) => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>修改素材</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} autoFocus placeholder="素材标题" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>摘要</label>
          <textarea className={css.libraryTextarea} placeholder="素材摘要" value={summary} onChange={(event) => setSummary(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标签</label>
          <input className={css.libraryInput} placeholder="用逗号分隔" value={tags} onChange={(event) => setTags(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>星级</label>
          <select className={css.libraryInput} value={stars} onChange={(event) => setStars(Number(event.target.value))}>
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || title.trim() === ''}
            onClick={() => props.onSave(title, summary, tags, stars)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function RegisterDialog(props: {
  busy: boolean
  onClose: () => void
  onRegister: (path: string, title: string, type: string, tags: string) => void
}) {
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('other')
  const [tags, setTags] = useState('')
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={(event) => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>登记素材</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>本地路径</label>
          <input className={css.libraryInput} autoFocus placeholder="/Users/.../file.png" value={path} onChange={(event) => setPath(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} placeholder="素材标题" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>类型</label>
          <select className={css.libraryInput} value={type} onChange={(event) => setType(event.target.value)}>
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="audio">音频</option>
            <option value="document">文档</option>
            <option value="code">代码</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标签</label>
          <input className={css.libraryInput} placeholder="用逗号分隔" value={tags} onChange={(event) => setTags(event.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>取消</button>
          <button
            type="button"
            className={css.libraryPrimaryButton}
            disabled={props.busy || path.trim() === ''}
            onClick={() => props.onRegister(path, title, type, tags)}
          >
            登记
          </button>
        </div>
      </div>
    </div>
  )
}

function CleanupDialog(props: { text: string; onClose: () => void }) {
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={(event) => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>整理建议</div>
        <pre
          style={{
            margin: 0,
            maxHeight: '50vh',
            overflow: 'auto',
            padding: 10,
            borderRadius: 8,
            background: 'var(--dsw-alias-bg-layer-2)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {props.text}
        </pre>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

function LinkDialog(props: {
  item: ArtifactItem
  suggestions: Array<{ id: string; title?: string; reason?: string; score?: number }>
  busy: boolean
  onClose: () => void
  onApply: (id: string) => void
}) {
  return (
    <div className={css.libraryDialogBackdrop} onClick={props.onClose}>
      <div className={css.libraryDialog} onClick={(event) => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>连线建议 · {props.item.title}</div>
        {props.suggestions.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>暂无相关条目</div>
        ) : (
          props.suggestions.map(suggestion => (
            <div key={suggestion.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13 }}>{suggestion.title ?? suggestion.id}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                  {suggestion.reason ?? ''}{suggestion.score !== undefined ? ` · 相关度 ${suggestion.score}` : ''}
                </span>
              </span>
              <button
                type="button"
                className={css.libraryActionButton}
                disabled={props.busy}
                onClick={() => props.onApply(suggestion.id)}
                style={{ height: 26, padding: '0 10px', fontSize: 12 }}
              >
                应用
              </button>
            </div>
          ))
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className={css.libraryActionButton} onClick={props.onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
