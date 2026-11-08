/**
 * HeightLab：素材管理原生面板。
 *
 * 与知识库同款左右布局：左侧分类，右侧素材列表；支持搜索、扫描已有素材、
 * 查看/修改/删除。纯黑白灰原生风格，不带图标。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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
  exists?: boolean
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
  /* 2026-11-09（用户拍板）：下载完成弹窗——「已下载，点击查看」，点击打开
   * 所在文件夹（Finder 揭示已下载副本）。样式对齐主页通知弹窗的原生卡片
   * 语言（白底/描边/圆角/阴影，黑白灰）。一次一张（新下载覆盖旧弹窗）。 */
  const [downloadToast, setDownloadToast] = useState<{ id: string; filename: string } | null>(null)
  const downloadToastTimer = useRef<number | undefined>(undefined)
  const showDownloadToast = (id: string, filename: string): void => {
    setDownloadToast({ id, filename })
    if (downloadToastTimer.current !== undefined) window.clearTimeout(downloadToastTimer.current)
    downloadToastTimer.current = window.setTimeout(() => { setDownloadToast(null) }, 8_000)
  }
  const revealDownloaded = async (id: string): Promise<void> => {
    try {
      await fetch('/hl/assets/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch { /* 揭示失败静默：文件可能被手动删了 */ }
    if (downloadToastTimer.current !== undefined) window.clearTimeout(downloadToastTimer.current)
    setDownloadToast(null)
  }

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
    /* 2026-11-09（用户拍板）：下载改走宿主端点——素材本体就在主机磁盘，
     * 宿主把源文件拷到 ~/Downloads（确定性位置）并回填弹窗；旧浏览器 blob
     * 下载降级保留（宿主端点缺失的旧 runtime 时兜底）。 */
    try {
      const res = await fetch('/hl/assets/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (res.ok) {
        const data = await res.json() as { ok?: boolean; filename?: unknown }
        if (data.ok === true) {
          showDownloadToast(item.id, typeof data.filename === 'string' && data.filename !== '' ? data.filename : (item.filename || item.title || '已下载'))
          return
        }
      }
      // 端点不可用（旧 runtime）：回退浏览器下载。
      const fileRes = await fetch(`/ext/artifacts/${item.id}/file`)
      if (!fileRes.ok) throw new Error('下载失败')
      const blob = await fileRes.blob()
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

  /* 卡片渲染（虚拟/非虚拟两分支共用；actionButtons 是本组件闭包）。
   * 2026-11-09（用户拍板）：点卡片任意处即「查看」（原查看钮删除腾位），
   * 操作按钮行 stopPropagation 不触发查看。 */
  const renderCard = (item: (typeof filtered)[number]): ReactNode => (
    <div
      key={item.id}
      className={css.libraryCard}
      style={{ cursor: 'pointer' }}
      onClick={() => setViewItem(item)}
    >
      <div className={css.libraryCardThumb}>
        {/* 2026-10-20 用户要求：图片和视频都要有缩略图，不要一片空白。
          · 图片：直接 <img>
          · 视频：<video preload="metadata"> + #t=0.1 让它解码首帧
            （服务端 /file 已支持 Range，否则浏览器不肯出首帧）
          · 音频/文档/代码：给一个带扩展名的文字标记（比纯类型名好认） */}
        {item.exists === false ? (
        /* 源文件被删/移动的记录：给明确失效标，不要再留一片空白 */
          <span style={{ fontSize: 11, letterSpacing: 0.4, opacity: 0.55 }}>文件已失效</span>
        ) : item.artifact_type === 'image' ? (
          <img src={`/ext/artifacts/${item.id}/file`} alt="" loading="lazy" />
        ) : item.artifact_type === 'video' ? (
          <video
            src={`/ext/artifacts/${item.id}/file#t=0.1`}
            preload="metadata"
            muted
            playsInline
            aria-label={item.title || item.filename}
          />
        ) : (
          <span style={{ fontSize: 11, letterSpacing: 0.4 }}>
            {(item.filename.split('.').pop() || '').toUpperCase().slice(0, 6) || (TYPE_MAP[item.artifact_type] ?? '素材')}
          </span>
        )}
      </div>
      <span className={css.libraryCardTitle}>{item.title || item.filename}</span>
      <span className={css.libraryCardMeta}>
        {TYPE_MAP[item.artifact_type] ?? '其他'} · {formatSize(item.size_bytes)}
        {item.tags.length > 0 ? ` · ${item.tags.join(' / ')}` : ''}
      </span>
      <span className={css.libraryCardActions}>{actionButtons(item)}</span>
    </div>
  )
  /* 2026-11-08（美观版）：分类从左侧 112px 窄栏改为顶部筛选 chips（与首页
   * 模板网格「精选/UGC广告」chips 同款）——工具行/网格/标题三者落同一竖线，
   * 且带上每个分类的真实数量（技能中心「官方精选（13）」同款）。 */
  const liveItems = items.filter(item => item.trashed_at === null)
  const countOf = (name: Category): number => {
    if (name === '回收站') return items.length - liveItems.length
    if (name === '全部') return liveItems.length
    return liveItems.filter(item => TYPE_MAP[item.artifact_type] === name).length
  }
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


  /* O44（2026-11-08 性能债根治·库版）：卡片视图行虚拟化——@tanstack/react-virtual
   * 与 ui-trajectory TrajectoryTable / ui-chat TurnNavigator 完全同库（用户拍板
   * 用原生路线，不手写）。素材网格此前全量渲染 281 卡 = 3372 DOM 节点（整页
   * 81%），每次切入整树重建，首次切换 500ms+。行虚拟化按 4 列切块，只渲染
   * 可见行 ± overscan；measureElement 动态实测行高（按钮 wrap 等不齐也正确）。 */
  const CARD_ROW_COLUMNS = 4
  const CARD_ROW_ESTIMATE_PX = 236
  const CARD_VIRTUAL_THRESHOLD = 10
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const cardRows = useMemo(() => {
    const rows: Array<typeof filtered> = []
    for (let i = 0; i < filtered.length; i += CARD_ROW_COLUMNS) rows.push(filtered.slice(i, i + CARD_ROW_COLUMNS))
    return rows
  }, [filtered])
  const virtualizationOn = viewMode === 'card' && cardRows.length > CARD_VIRTUAL_THRESHOLD
  const rowVirtualizer = useVirtualizer({
    count: virtualizationOn ? cardRows.length : 0,
    enabled: virtualizationOn,
    estimateSize: () => CARD_ROW_ESTIMATE_PX,
    overscan: 4,
    getScrollElement: () => gridScrollRef.current,
  })
  const measureRowRef = (el: HTMLElement | null): void => {
    if (el !== null && virtualizationOn) rowVirtualizer.measureElement(el)
  }

  const actionButtons = (item: ArtifactItem) => (
    /* 2026-11-09：查看钮删除（点卡即看）；行内按钮 stopPropagation 防
     * 冒泡触发卡片/行的查看。少一个按钮后四列网格不再把「删除」挤出卡外。 */
    <span
      style={{ display: 'flex', gap: 4, flexShrink: 0, paddingLeft: 8, flexWrap: 'wrap' }}
      onClick={(event) => { event.stopPropagation() }}
    >
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
        <div className={css.libraryRight}>
          <div className={css.libraryChips} role="tablist" aria-label="素材分类">
            {CATEGORIES.map(name => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={category === name}
                className={category === name ? `${css.libraryChip} ${css.libraryChipActive}` : css.libraryChip}
                onClick={() => setCategory(name)}
              >
                {name}（{countOf(name)}）
              </button>
            ))}
          </div>
          {error !== '' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{error}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'nowrap' }}>
            <input
              className={css.libraryInput}
              placeholder="搜索素材"
              value={search}
              onChange={event => setSearch(event.target.value)}
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
              onChange={event => setSort(event.target.value as typeof sort)}
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

          {/* 2026-11-08（用户拍板）：chips + 工具行**冻结**在顶部不跟随滚动——
           * 把滚动权从 libraryRight 整体改为只滚这里（libraryScroll）。 */}
          <div ref={gridScrollRef} className={css.libraryScroll}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
                暂无素材，新生成的图片/视频会自动入库，也可点击「扫描」补录
              </div>
            ) : viewMode === 'card' ? (
              virtualizationOn ? (
                /* 虚拟化（O44 性能债根治）：行容器 absolute 定位到 virtualRow.start，
                 * 行内 4 列网格；measureElement 动态实测行高（按钮行 wrap 会使
                 * 行高不齐）。只渲染可见行 ± overscan。 */
                <div style={{ position: 'relative', width: '100%', height: rowVirtualizer.getTotalSize() }}>
                  {rowVirtualizer.getVirtualItems().map(virtualRow => (
                    <div
                      key={String(virtualRow.key)}
                      ref={measureRowRef}
                      data-index={virtualRow.index}
                      className={css.libraryCardRow}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {cardRows[virtualRow.index]?.map(item => renderCard(item))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={css.libraryCardGrid}>
                  {filtered.map(item => renderCard(item))}
                </div>
              )
            ) : (
              filtered.map(item => (
                <div
                  key={item.id}
                  className={css.libraryDocRow}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setViewItem(item)}
                >
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
      </div>

      {viewItem !== null && (
        <MaterialViewDialog item={viewItem} onClose={() => setViewItem(null)} />
      )}
      {downloadToast !== null && (
        /* 下载完成弹窗（用户拍板「已下载，点击查看」）：原生通知卡片语言，
         * 右下角浮动，点击任意处 Finder 揭示已下载副本所在文件夹。 */
        <div
          role="status"
          onClick={() => { void revealDownloaded(downloadToast.id) }}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '12px 16px',
            minWidth: 240,
            maxWidth: 340,
            background: 'var(--dsw-alias-bg-base, #fff)',
            border: '1px solid var(--dsw-alias-border-l2, #e5e5e5)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
            <span aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: 'var(--dsw-alias-success, #10a37f)',
            }} />
            已下载
          </span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {downloadToast.filename}
          </span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 }}>
            点击查看（打开所在文件夹）
          </span>
        </div>
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
        <RegisterDialog
          busy={busy}
          onClose={() => setRegisterOpen(false)}
          onRegister={(path, title, type, tags) => { void registerItem(path, title, type, tags) }}
        />
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
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
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
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>修改素材</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} autoFocus placeholder="素材标题" value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>摘要</label>
          <textarea className={css.libraryTextarea} placeholder="素材摘要" value={summary} onChange={event => setSummary(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标签</label>
          <input className={css.libraryInput} placeholder="用逗号分隔" value={tags} onChange={event => setTags(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>星级</label>
          <select className={css.libraryInput} value={stars} onChange={event => setStars(Number(event.target.value))}>
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
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
        <div className={css.libraryDialogTitle}>登记素材</div>
        <div style={fieldStyle}>
          <label style={labelStyle}>本地路径</label>
          <input className={css.libraryInput} autoFocus placeholder="/Users/.../file.png" value={path} onChange={event => setPath(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>标题</label>
          <input className={css.libraryInput} placeholder="素材标题" value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>类型</label>
          <select className={css.libraryInput} value={type} onChange={event => setType(event.target.value)}>
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
          <input className={css.libraryInput} placeholder="用逗号分隔" value={tags} onChange={event => setTags(event.target.value)} />
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
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
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
      <div className={css.libraryDialog} onClick={event => event.stopPropagation()}>
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
