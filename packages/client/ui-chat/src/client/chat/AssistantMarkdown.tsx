import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import {
  IconDownloadOutlineRegular, IconFullscreenOutlineRegular, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFileMentions, MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeOwnerProps, ChatViewSlotProps, UseDisclosure, UsePresentation, UseGroupAction } from '../contract/slots.ts'
import type { AssistantBlock } from '../contract/snapshot.ts'
import { markdownLabels } from '../markdown-labels.ts'
import { HEIGHTLAB_UNKNOWN_BLOCK_TEXT } from './heightlab-friendly.ts'
import { ReasoningRow } from './ReasoningRow.tsx'
import css from './AssistantMarkdown.module.css'

/** HeightLab：avatar-preview marker：`[数字人形象预览：<url>]` → 内联图。 */
const AVATAR_PREVIEW_MARKER = /\[数字人形象预览：([^\]]+)\]/g
/** HeightLab：回复正文中的成片 URL（含 dsh-ui 围栏内）→ 内联播放器兜底，
 *  链接/卡片格式也总能播放；允许扩展名后带查询串（如 /hl/video-gen.mp4?src=…）。 */
const AVATAR_VIDEO_URL = /https?:\/\/[^\s"'`\])]+?\.(?:mp4|webm|mov)(?=[\s"'`\])?]|\?|$)/i

/**
 * Standalone fallback for image destinations (query/fragment suffixes are ignored).
 * Chat fileImages resolves decoded file references against cwd; pathImages also
 * serves this component outside that provider and accepts legacy image URL suffixes.
 * Resolve an authored absolute image path against the document's file API.
 * @param base - canonical `document.baseURI` at render time.
 * @param value - authored Markdown destination; URL escapes are decoded once.
 * @returns an absolute Web or Desktop file-API URL, or undefined for unsupported
 * protocols and non-local paths.
 */
export function localPathMediaUrl(base: string, value: string): string | undefined {
  let path: string
  try { path = decodeURIComponent(value.split(/[?#]/u)[0] ?? '') }
  catch { return undefined } // Malformed URL escapes cannot identify a file.
  return fileMediaUrl(base, path)
}

/** POSIX join for a session workspace root and a model-authored relative path. */
function joinWorkspacePath(cwd: string, rel: string): string {
  const out: string[] = []
  for (const part of `${cwd.replace(/\/+$/u, '')}/${rel}`.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

/**
 * HeightLab（2026-10-17 媒体链路修复）：把模型给的媒体引用归一为可直接加载的
 * 同源 URL。0.2.1 合并后三种形态断了两种——本地绝对路径曾被裸拼到 origin 后
 * （404），工作区相对路径完全无法解析（只显示 alt 文本）。本地文件统一走
 * 宿主 /hl/local-media（Range 206 分段 + 主目录沙箱）；/hl/ 同源路径原样补全。
 */
function heightlabMediaUrl(raw: string, cwd: string | undefined): string | undefined {
  const value = raw.trim().replace(/^<|>$/gu, '')
  if (value === '') return undefined
  if (/^https?:\/\//iu.test(value)) return value
  if (/^\/hl\//iu.test(value)) return new URL(value, document.baseURI).href
  let abs: string
  if (value.startsWith('/')) abs = value
  else if (cwd !== undefined && cwd !== '') abs = joinWorkspacePath(cwd, value)
  else return undefined
  return `/hl/local-media?path=${encodeURIComponent(abs)}`
}

/** 从已渲染媒体的 src（api/file?path= 或 /hl/local-media?path=）还原本地绝对路径。 */
function localPathFromMediaSrc(src: string): string | undefined {
  try {
    const path = new URL(src, document.baseURI).searchParams.get('path')
    if (path !== null && path.startsWith('/')) return path
  } catch { /* 相对 src 解析失败按非本地处理 */ }
  return undefined
}

/** 保存到工作区用的引用：http(s) 与 /hl/ 原样，本地路径解析为绝对路径。 */
function heightlabDownloadRef(raw: string, cwd: string | undefined): string {
  const value = raw.trim()
  if (/^https?:\/\//iu.test(value) || /^\/hl\//iu.test(value)) return value
  if (value.startsWith('/')) return value
  if (cwd !== undefined && cwd !== '') return joinWorkspacePath(cwd, value)
  return value
}

/** 媒体显示名（标签标题用）：取引用末段文件名，剥查询串并解码。 */
function mediaDisplayName(ref: string): string {
  try {
    const bare = decodeURIComponent(ref.split(/[?#]/u)[0] ?? '')
    const base = bare.split('/').pop() ?? ''
    return base === '' ? '媒体' : base
  } catch { return '媒体' }
}

/** HeightLab：请求右侧边栏媒体标签预览（apply 层桥接 sidebarRight.openResource，
 * heightlab-media-tab 插件原生渲染）。name 用于标签标题。 */
function openInSidebarPreview(playable: string, name?: string): void {
  const absolute = new URL(playable, document.baseURI).href
  window.dispatchEvent(new CustomEvent('hl:sidebar-open-url', {
    detail: { url: absolute, name: name ?? '' },
  }))
}

/** HeightLab：打开侧栏/弹层播放面前，暂停页面全部 video——同源媒体多处同时
 * 出声会叠加成重音/重复播放（用户实测反馈）。 */
function pauseAllVideos(): void {
  document.querySelectorAll('video').forEach((v) => { try { v.pause() } catch { /* 已停止 */ } })
}

/** HeightLab：经宿主在系统默认浏览器打开同源媒体（壳内 window.open 同源地址无反应）。 */
async function openInSystemBrowser(playable: string): Promise<void> {
  await fetch('/hl/open-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: new URL(playable, document.baseURI).href }),
  }).catch(() => undefined)
}

export interface AssistantMarkdownProps extends Pick<PropsRenderSlots<'conversation.chat.reasoning.body'>, 'renderSlot'> {
  /** Render only the requested business portion, preserving original block indexes. */
  groupPart?: string | undefined
  /** Stable Hook forwarded to each independently expandable reasoning block. */
  useDisclosure: UseDisclosure
  blocks: readonly AssistantBlock[]
  streaming: boolean
  /** Frozen partial of an aborted turn: rendered with a stopped marker. */
  interrupted?: boolean | undefined
  /** Render consecutive image blocks through the attachment slot. */
  renderMessageImages: ChatNodeOwnerProps['renderMessageImages']
  /** Hide reasoning that belongs to the Turn-level process disclosure. */
  reasoningHidden?: boolean | undefined
  /** Process hiding bound by the node slot to its current viewport. */
  useGroupAction: UseGroupAction
  /** Live display policy for reasoning summaries. */
  usePresentation: UsePresentation
  /** Reveal the disclosure that hides this reasoning. */
  revealProcess?: (() => void) | undefined
  /** Resolved prose file mentions for this Assistant's closing turn. */
  mentions?: MarkdownFileMentions | undefined
  /** Session workspace root（下载/保存目标）。 */
  cwd?: string | undefined
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}

/** Reasoning block as the Think variant summary row (figma 39:28304). */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks, streaming, interrupted, renderMessageImages, groupPart, useDisclosure,
  reasoningHidden = false, usePresentation, revealProcess, mentions, cwd, renderSlot, useGroupAction, t,
}: AssistantMarkdownProps) {
  // Stable per locale revision (t identity changes on switch): a fresh object
  // per render would rebuild MarkdownText's component table every chunk.
  const labels = useMemo(() => markdownLabels(t), [t])
  // HeightLab：图片 destination 归一（http(s)/同源 /hl//本地绝对/工作区相对）。
  // cwd 随会话切换，经 ref 读取保持 resolve 身份稳定（MarkdownText 依赖其 memo）。
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  // MarkdownText memoizes its vocabulary; keep its identity stable across renders.
  const pathImages = useMemo<MarkdownPathImages>(() => {
    return { resolve: value => heightlabMediaUrl(value, cwdRef.current) }
  }, [])
  // HeightLab：点击本地媒体图片 → 右侧边栏预览（替代原地 lightbox，用户拍板
  // 「点击后能在右侧边栏直接预览或播放」）；远程图片保持原 lightbox 行为。
  const onMediaClickCapture = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const img = target?.closest('img') ?? null
    if (img === null) return
    const src = img.getAttribute('src') ?? ''
    const path = localPathFromMediaSrc(src)
    if (path === undefined) return
    event.preventDefault()
    event.stopPropagation()
    openInSidebarPreview(heightlabMediaUrl(path, cwdRef.current) ?? src, mediaDisplayName(path))
  }
  const last = blocks.length - 1
  // Tool-call heads render as tool rows in the chat view's grouping pass, so
  // a node that is only those heads (or empty) would paint an empty root
  // between tool groups — skip the shell unless something visible remains.
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null
  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block === undefined) continue
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue
    if (groupPart === 'response' && block.kind === 'reasoning') continue
    switch (block.kind) {
      case 'text':
        // HeightLab（0.4.1 定制回植 2026-10-17）：avatar-preview 标记拆出内联图；
        // 正文里的成片 URL 附缩略播放器兜底。
        rendered.push(
          <AssistantTextWithPreview
            key={i}
            text={block.text}
            streaming={streaming}
            labels={labels}
            fileMentions={mentions}
            pathImages={pathImages}
            cwd={cwd}
          />,
        )
        break
      case 'reasoning':
        rendered.push(
          <ProcessReasoning
            key={i}
            hidden={reasoningHidden}
            reveal={revealProcess}
            useGroupAction={useGroupAction}
          >
            <ReasoningRow text={block.text} running={streaming && i === last} usePresentation={usePresentation}
              useDisclosure={useDisclosure} renderSlot={renderSlot} t={t} />
          </ProcessReasoning>,
        )
        break
      case 'image': {
        // Consecutive image blocks share one gallery so several images tile
        // into rows instead of each opening a one-image group of its own.
        // Keyed by the group's FIRST block index: a streaming append that
        // extends the group then only grows `images` instead of remounting
        // the gallery under a shifted key.
        const start = i
        const group = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          i += 1
        }
        rendered.push(
          <Fragment key={start}>
            {renderMessageImages({
              images: group.map(({ attachment }) => ({ attachment })),
              align: 'start',
            })}
          </Fragment>,
        )
        break
      }
      // Grouped into tool rows by ChatView; hasVisible above skips an empty shell.
      case 'tool-call':
        break
      default:
        // HeightLab（0.4.1 定制回植）：未知/内部内容块不暴露原始 JSON 与内部类型名。
        rendered.push(
          <span key={i} className={css.unknownBlock}>{HEIGHTLAB_UNKNOWN_BLOCK_TEXT}</span>,
        )
    }
  }
  return (
    <div className={css.root} data-streaming={streaming || undefined} onClickCapture={onMediaClickCapture}>
      <div className={css.body}>
        {rendered}
        {interrupted && (groupPart === undefined || groupPart === 'response'
          || !blocks.some(block => block.kind !== 'reasoning' && block.kind !== 'tool-call'))
          && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})

/** Extract a playable video URL from markdown image syntax or plain text. */
function extractVideoUrl(text: string): { url: string; markdown?: string } | null {
  const md = /!\[[^\]]*\]\(([^)]*\.(?:mp4|webm|mov)[^)]*)\)/i.exec(text)
  if (md !== null) {
    return { url: (md[1] ?? '').trim(), markdown: md[0] }
  }
  const plain = AVATAR_VIDEO_URL.exec(text)?.[0]
  return plain ? { url: plain } : null
}

/** HeightLab：把聊天里的资源保存到当前工作区根目录（宿主 /hl/download）。 */
async function saveToWorkspace(url: string, workspace: string | undefined): Promise<string> {
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

/** HeightLab 视频成片：缩略播放器 + 侧栏播放/下载/新窗口，图标均为 SVG。 */
function VideoEmbed({ url, downloadUrl, workspace }: {
  url: string
  /** 保存到工作区用的原始引用（本地绝对路径或 http(s) 直链），可与播放 url 不同。 */
  downloadUrl: string
  workspace?: string | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [expanded])
  const downloadVideo = async (): Promise<void> => {
    try {
      const saved = await saveToWorkspace(downloadUrl, workspace)
      setDownloadMsg(`已保存到：${saved}`)
    } catch (err) {
      setDownloadMsg(`下载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    window.setTimeout(() => { setDownloadMsg(null) }, 6000)
  }
  return (
    <div className={css.videoEmbed}>
      <video
        src={url}
        controls
        preload="metadata"
        className={css.videoThumb}
        onClick={(event) => {
          event.preventDefault()
          pauseAllVideos()
          openInSidebarPreview(url, mediaDisplayName(downloadUrl))
        }}
      />
      <div className={css.videoActions}>
        <button type="button" className={css.videoAction} title="在侧栏播放"
          onClick={() => { pauseAllVideos(); openInSidebarPreview(url, mediaDisplayName(downloadUrl)) }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1.5" y="2.5" width="9" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M13 5.5v5M15 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={css.videoAction} title="放大播放"
          onClick={() => { pauseAllVideos(); setExpanded(true) }}>
          <IconFullscreenOutlineRegular size={14} />
        </button>
        <button type="button" className={css.videoAction} title="下载视频" onClick={() => { void downloadVideo() }}>
          <IconDownloadOutlineRegular size={14} />
        </button>
        <button
          type="button"
          className={css.videoAction}
          title="在浏览器中打开"
          onClick={() => { void openInSystemBrowser(url) }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M6 3H3v10h10v-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 2h5v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {downloadMsg !== null && (
        <div className={css.downloadMsg} role="status">{downloadMsg}</div>
      )}
      {expanded && (
        <div className={css.videoOverlay} role="dialog" aria-modal="true" onClick={() => { setExpanded(false) }}>
          <video
            src={url}
            controls
            autoPlay
            className={css.videoExpanded}
            onClick={(event) => { event.stopPropagation() }}
          />
          <button type="button" className={css.videoClose} aria-label="关闭" onClick={() => { setExpanded(false) }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

/** Render assistant text, replacing [数字人形象预览：<url>] with inline <img>. */
function AssistantTextWithPreview({
  text, streaming, labels, fileMentions, pathImages, cwd,
}: {
  text: string
  streaming: boolean
  labels: ReturnType<typeof markdownLabels>
  fileMentions?: MarkdownFileMentions | undefined
  pathImages: MarkdownPathImages
  cwd?: string | undefined
}): ReactNode {
  const video = extractVideoUrl(text)
  const playable = video !== null ? heightlabMediaUrl(video.url, cwd) : undefined
  const cleanText = video?.markdown !== undefined ? text.replace(video.markdown, '') : text
  const parts: ReactNode[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  AVATAR_PREVIEW_MARKER.lastIndex = 0
  while ((m = AVATAR_PREVIEW_MARKER.exec(cleanText)) !== null) {
    const prefix = cleanText.slice(cursor, m.index)
    if (prefix) {
      parts.push(<MarkdownText key={`text-${cursor}`} text={prefix} streaming={streaming} labels={labels} fileMentions={fileMentions} pathImages={pathImages} />)
    }
    const url = (m[1] ?? '').trim()
    parts.push(
      <img
        key={`avatar-${m.index}`}
        src={url}
        alt="数字人形象预览"
        className={css.avatarPreview}
      />,
    )
    cursor = m.index + m[0].length
  }
  if (parts.length === 0) {
    const markdown = (
      <MarkdownText text={cleanText} streaming={streaming} labels={labels} fileMentions={fileMentions} pathImages={pathImages} />
    )
    return video !== null && playable !== undefined
      ? (<>{markdown}<VideoEmbed key="video" url={playable} downloadUrl={heightlabDownloadRef(video.url, cwd)} workspace={cwd} /></>)
      : markdown
  }
  if (cursor < cleanText.length) {
    parts.push(<MarkdownText key={`text-${cursor}`} text={cleanText.slice(cursor)} streaming={streaming} labels={labels} fileMentions={fileMentions} pathImages={pathImages} />)
  }
  if (video !== null && playable !== undefined) {
    parts.push(<VideoEmbed key="video" url={playable} downloadUrl={heightlabDownloadRef(video.url, cwd)} workspace={cwd} />)
  }
  return <>{parts}</>
}

function ProcessReasoning({ hidden, reveal, useGroupAction, children }: {
  hidden: boolean
  reveal?: (() => void) | undefined
  useGroupAction: UseGroupAction
  children: ReactNode
}) {
  const ref = useGroupAction(hidden, reveal ?? NOOP)
  return <div ref={ref} data-turn-process-inline={hidden || undefined}>{children}</div>
}

const NOOP = (): void => {}
