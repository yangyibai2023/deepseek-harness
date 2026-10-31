import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconApiOutlineRegular, IconBrowseOutlineRegular, IconCodeOutlineRegular, IconEditOutlineRegular, IconSearchOutlineRegular,
  IconSparkleRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallOwnerProps, ToolTreeProps } from '../../contract/slots.ts'
import { readCardModel } from '../models/read-card-model.ts'
import { diffCardModel } from '../models/diff-card-model.ts'
import { searchCardModel } from '../models/search-card-model.ts'
import { terminalCardModel, terminalFailed } from '../models/terminal-card-model.ts'
import { webCardModel } from '../models/web-card-model.ts'
import { toolRowModel, type ToolRowVariant } from '../models/tool-call-model.ts'
import { localizeAutoReviewDenial } from '../models/auto-review-denial.ts'
import { ToolRow } from '../components/ToolRow.tsx'

/** Variant leading icons (figma table); all glyphs render at 14 inside the 16px leading box. */
const VARIANT_ICONS: Record<ToolRowVariant, ReactNode> = {
  search: <IconSearchOutlineRegular size={14} />,
  read: <IconBrowseOutlineRegular size={14} />,
  bash: <IconApiOutlineRegular size={14} />,
  write: <IconEditOutlineRegular size={14} />,
  edit: <IconEditOutlineRegular size={14} />,
  code: <IconCodeOutlineRegular size={14} />,
  others: <IconSparkleRegular size={14} />,
}

/** Card props: the owner payload plus the render site's locale seat (plain prop). */
export type GenericToolCardProps = ToolCallOwnerProps & {
  t: ToolTreeProps['t']
}

/** @param props - current tool stage and locale. @returns its preparation or dispatched card. */
export function GenericToolCard({ toolName, block, cwd, home, openFile, inspect, useDisclosure, t }: GenericToolCardProps) {
  const [viewer, setViewer] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<string | null>(null)
  const model = toolRowModel(toolName, block, cwd, home)
  const autoReview = model.autoReviewDenial === null
    ? null
    : localizeAutoReviewDenial(model.autoReviewDenial, t)
  const terminal = terminalCardModel(block, cwd)
  const read = readCardModel(block, cwd, home)
  const diff = diffCardModel(block)
  const search = searchCardModel(block)
  const web = webCardModel(block)
  // A failing exit status is the terminal card's own error signal (the call
  // itself settles isError:false), surfaced through the row's error summary.
  const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
    ? 'error'
    : model.state
  const singleFile = model.filePath !== undefined
  const images = extractImageUrls(model.output ?? '')
  const deliverables = extractDeliverables(model.output ?? '', cwd)
  const downloadCurrent = async (): Promise<void> => {
    if (viewer === null) return
    try {
      const saved = await downloadToWorkspace(viewer, cwd)
      setDownloadState(`已保存到：${saved}`)
    } catch (err) {
      setDownloadState(`下载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    window.setTimeout(() => { setDownloadState(null) }, 6000)
  }
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-call -- react-dom 类型未解析（宿主提供同一实例）
  const overlay = viewer === null ? null : createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => { setViewer(null) }}
    >
      <img
        src={viewer}
        alt="preview"
        onClick={(e) => { e.stopPropagation() }}
        style={{ maxWidth: '92%', maxHeight: '88%', objectFit: 'contain', borderRadius: 4 }}
      />
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void window.open(viewer, '_blank', 'noopener') }}
          style={viewerButtonStyle}
        >
          在浏览器中打开
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void downloadCurrent() }}
          style={viewerButtonStyle}
        >
          下载
        </button>
        <button type="button" style={viewerButtonStyle} onClick={() => { setViewer(null) }}>
          关闭
        </button>
      </div>
      {downloadState !== null && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 14px',
            borderRadius: 8, fontSize: 13, maxWidth: '80%', textAlign: 'center',
          }}
        >
          {downloadState}
        </div>
      )}
    </div>,
    document.body,
  )
  return (
    <>
      <ToolRow
        useDisclosure={useDisclosure}
        t={t}
        variant={model.variant}
        toolName={toolName}
        icon={VARIANT_ICONS[model.variant]}
        title={t(model.titleKey)}
        summary={model.summary}
        // Single-file tools never expose an args body — the path link is the only
        // args interaction. A card is not an args body: a read/write/edit row is
        // single-file AND carries a card, so the card expands under the path link.
        bodyRaw={singleFile || autoReview !== null ? null : model.bodyRaw}
        output={autoReview?.output ?? model.output}
        errorSummary={autoReview?.summary ?? model.errorSummary}
        terminal={terminal}
        diff={diff}
        read={read}
        search={search}
        web={web}
        state={state}
        filePath={model.filePath}
        onOpenFile={singleFile ? openFile : undefined}
        inspect={inspect}
      />
      {images.length > 0 && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt="tool result image"
              onClick={() => { setViewer(img) }}
              style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, objectFit: 'contain', cursor: 'zoom-in' }}
            />
          ))}
        </div>
      )}
      {/* HeightLab（2026-10-31 交付确定性）：工具产出文件（图/视频/音频/文档/压缩包）
       * 强制渲染成交付卡片——不依赖模型在正文里自发写链接（那是随机行为）。 */}
      {deliverables.length > 0 && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deliverables.map((item, i) => (
            <DeliverableRow
              key={`${item.url}-${i}`}
              item={item}
              workspace={cwd}
              onPreviewImage={() => { setViewer(item.url) }}
            />
          ))}
        </div>
      )}
      {overlay}
    </>
  )
}

/** HeightLab：把聊天里的资源保存到当前工作区根目录（宿主 /hl/download）。 */
async function downloadToWorkspace(url: string, workspace: string | undefined): Promise<string> {
  const res = await fetch('/hl/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, workspace }),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; path?: string; message?: string }
  if (!res.ok || data.ok !== true || typeof data.path !== 'string') {
    throw new Error(data.message ?? '保存失败')
  }
  return data.path
}

function extractImageUrls(text: string): string[] {
  if (!text) return []
  // 2026-09-19：允许 .jpg 后带查询串（local-media 的 ?path=URL 形态）——
  // 此前非贪婪匹配截断在 image.jpg 丢掉 ?path=，工具卡 <img> 404 显示问号破图。
  const re = /(https?:\/\/[^\s)）"'<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)）"'<>]*)?)/gi
  const out: string[] = []
  for (const match of text.matchAll(re)) {
    if (match[1] && !out.includes(match[1])) out.push(match[1])
  }
  return out
}

/* =====================================================================
 * HeightLab 交付确定性（2026-10-31，用户实测「生成内容有时没有交付按钮」）：
 * 根因 = 交付卡片依赖模型在正文自发写链接（随机行为）。改为在工具结果渲染层
 * 扫描产出路径，凡媒体/文档/压缩包一律强制渲染成交付卡片——工具如实返回
 * 路径就有卡片，与模型话术无关。代码/配置文件不算交付物（bash 读文件时
 * 会输出大量路径，全渲染会噪音爆炸），媒体/文档/压缩包才出。
 * ===================================================================== */

/** 交付物类型：渲染形态与操作按钮组按此分流。 */
type DeliverableKind = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'file'

interface Deliverable {
  /** 直接可加载/可下发的 URL（本地路径已归一为 /hl/local-media）。 */
  url: string
  /** 原始引用（下载到工作区用：本地绝对路径或 http(s)/hl 直链）。 */
  ref: string
  name: string
  kind: DeliverableKind
}

const DELIVERABLE_EXTS: Record<string, DeliverableKind> = {}
for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico']) DELIVERABLE_EXTS[ext] = 'image'
for (const ext of ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']) DELIVERABLE_EXTS[ext] = 'video'
for (const ext of ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']) DELIVERABLE_EXTS[ext] = 'audio'
for (const ext of ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md', 'rtf', 'srt', 'vtt', 'json', 'html']) DELIVERABLE_EXTS[ext] = 'document'
for (const ext of ['zip', '7z', 'rar', 'tar', 'gz']) DELIVERABLE_EXTS[ext] = 'archive'

function kindOfPath(path: string): DeliverableKind | null {
  const bare = path.split(/[?#]/u)[0] ?? ''
  const dot = bare.lastIndexOf('.')
  if (dot < 0) return null
  return DELIVERABLE_EXTS[bare.slice(dot + 1).toLowerCase()] ?? null
}

/** 本地路径 → /hl/local-media（主目录沙箱在服务端）；http(s)/hl 原样。 */
function deliverableUrl(ref: string, cwd: string | undefined): string {
  const value = ref.trim().replace(/^<|>$/gu, '')
  if (/^https?:\/\//iu.test(value)) return value
  if (/^\/hl\//iu.test(value)) return new URL(value, document.baseURI).href
  // Windows 盘符（含 0.4.23 的 CommonMark 吃 `\.` 转义后的损坏形态补回）。
  let abs = value.replace(/\\/gu, '/')
  if (!/^[A-Za-z]:\//u.test(abs)) {
    if (abs.startsWith('/')) {
      // POSIX 绝对路径原样
    } else if (abs.startsWith('~/')) {
      abs = abs.slice(1)
    } else if (cwd !== undefined && cwd !== '') {
      const parts: string[] = []
      for (const part of `${cwd.replace(/\/+$/u, '')}/${abs}`.split('/')) {
        if (part === '' || part === '.') continue
        if (part === '..') parts.pop()
        else parts.push(part)
      }
      abs = `/${parts.join('/')}`
    } else {
      return value
    }
  }
  return `/hl/local-media?path=${encodeURIComponent(abs)}`
}

function deliverableDownloadRef(ref: string, cwd: string | undefined): string {
  const value = ref.trim().replace(/^<|>$/gu, '')
  if (/^https?:\/\//iu.test(value) || /^\/hl\//iu.test(value) || /^[A-Za-z]:[\\/]/u.test(value)) return value
  if (value.startsWith('/') || value.startsWith('~/')) return value.replace(/^~/u, '')
  if (cwd !== undefined && cwd !== '') {
    const parts: string[] = []
    for (const part of `${cwd.replace(/\/+$/u, '')}/${value}`.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') parts.pop()
      else parts.push(part)
    }
    return `/${parts.join('/')}`
  }
  return value
}

/** 从工具输出文本提取交付物（URL + 本地绝对/相对路径），去重保序。 */
function extractDeliverables(text: string, cwd: string | undefined): Deliverable[] {
  if (!text) return []
  // 路径字符集：排除空格/括号/引号/书名号等边界；Windows 盘符反斜杠先归一。
  const normalized = text.replace(/\\(?=[^\s])/gu, '/')
  const P = String.raw`[^\s()（）"'<>，。；：]+`
  const re = new RegExp(
    `(?:https?:\\/\\/${P}` // http(s) 直链
    + `|\\/hl\\/${P}` // 宿主同源媒体
    + `|~\\/${P}` // 主目录相对
    + `|\\.\\/${P}` // 工作区相对
    + `|[A-Za-z]:\\/${P}` // Windows 盘符绝对
    + `|(?:\\/${P})*\\/[^\\s/()（）"'<>，。；：]+\\.[A-Za-z0-9]{1,6})`, // POSIX 绝对路径兜底
    'giu',
  )
  const out: Deliverable[] = []
  const seen = new Set<string>()
  for (const match of normalized.matchAll(re)) {
    const raw = match[0]
    if (raw.length < 5) continue
    const kind = kindOfPath(raw)
    if (kind === null) continue
    // 本地媒体限定在用户主目录形态（~/.heightlab、/Users|/home 下 .heightlab 或
    // 工作区相对路径），避免把普通文本里偶发的 URL 之外的东西当交付。
    const isLocal = !/^https?:\/\//iu.test(raw)
    if (isLocal && !raw.includes('.heightlab') && !raw.startsWith('~/') && !raw.startsWith('./')
      && !raw.startsWith('/') && !/^[A-Za-z]:\//u.test(raw)) continue
    if (isLocal && raw.startsWith('/') && !raw.includes('/hl/') && !raw.includes('.heightlab')
      && cwd !== undefined && !raw.startsWith(cwd)) {
      // 工作区外且非 .heightlab 的散落路径：保守跳过（bash 输出噪音）。
      continue
    }
    const url = deliverableUrl(raw, cwd)
    if (seen.has(url)) continue
    seen.add(url)
    const bare = decodeURIComponent(raw.split(/[?#]/u)[0] ?? raw)
    out.push({
      url,
      ref: deliverableDownloadRef(raw, cwd),
      name: (bare.split('/').pop() ?? '').replace(/\\u/gu, '') || '交付文件',
      kind,
    })
  }
  return out
}

const KIND_LABEL: Record<DeliverableKind, string> = {
  image: '图片', video: '视频', audio: '音频', document: '文档', archive: '压缩包', file: '文件',
}

/** 经宿主在系统默认应用打开（PDF/Office/文本走系统阅读器）。 */
async function openInSystemApp(url: string): Promise<void> {
  await fetch('/hl/open-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: new URL(url, document.baseURI).href }),
  }).catch(() => undefined)
}

/** 请求右侧边栏媒体标签预览（与 ui-chat AssistantMarkdown 同一全局事件桥）。 */
function openInSidebarPreview(playable: string, name: string): void {
  document.querySelectorAll('video').forEach((v) => { try { v.pause() } catch { /* 已停止 */ } })
  window.dispatchEvent(new CustomEvent('hl:sidebar-open-url', {
    detail: { url: new URL(playable, document.baseURI).href, name },
  }))
}

/** 单个交付物卡片行：类型徽标 + 文件名 + 打开/播放 + 下载。 */
function DeliverableRow({ item, workspace, onPreviewImage }: {
  item: Deliverable
  workspace: string | undefined
  onPreviewImage: () => void
}): ReactNode {
  const [thumbError, setThumbError] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const download = async (): Promise<void> => {
    try {
      const saved = await downloadToWorkspace(item.ref, workspace)
      setMsg(`已保存到：${saved}`)
    } catch (err) {
      setMsg(`下载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    window.setTimeout(() => { setMsg(null) }, 6000)
  }
  const isMedia = item.kind === 'image' || item.kind === 'video' || item.kind === 'audio'
  const openLabel = item.kind === 'video' ? '播放'
    : item.kind === 'audio' ? '播放'
      : item.kind === 'image' ? '查看' : '打开'
  const openAction = (): void => {
    if (item.kind === 'image') { onPreviewImage(); return }
    if (isMedia) { openInSidebarPreview(item.url, item.name); return }
    void openInSystemApp(item.url)
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      border: '1px solid rgba(127,127,127,0.25)', borderRadius: 10, background: 'rgba(127,127,127,0.06)',
    }}>
      {item.kind === 'image' && !thumbError
        ? (
          <img
            src={item.url} alt={item.name} onError={() => { setThumbError(true) }}
            onClick={openAction}
            style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', cursor: 'zoom-in', flexShrink: 0 }}
          />
        )
        : (
          <span style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(127,127,127,0.14)', fontSize: 15,
          }} aria-hidden>{item.kind === 'video' ? '🎬' : item.kind === 'audio' ? '🎧' : item.kind === 'archive' ? '🗜️' : '📄'}</span>
        )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 11, color: 'rgba(127,127,127,0.9)', marginTop: 2 }}>{KIND_LABEL[item.kind]} · 交付文件</div>
      </div>
      <button type="button" onClick={openAction} style={deliverableButtonStyle}>{openLabel}</button>
      <button type="button" onClick={() => { void download() }} style={deliverableButtonStyle}>下载</button>
      {msg !== null && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
          background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13,
        }} role="status">{msg}</div>
      )}
    </div>
  )
}

const deliverableButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(127,127,127,0.35)', borderRadius: 8, padding: '5px 12px',
  fontSize: 12, cursor: 'pointer', background: 'transparent', flexShrink: 0,
}

const viewerButtonStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.16)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 8,
  padding: '7px 14px',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
}
