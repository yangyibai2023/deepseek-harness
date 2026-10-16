import { Fragment, memo, useEffect, useMemo, useState } from 'react'
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
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
  // MarkdownText memoizes its vocabulary; keep its identity stable across renders.
  const pathImages = useMemo<MarkdownPathImages>(() => {
    return { resolve: value => localPathMediaUrl(document.baseURI, value) }
  }, [])
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
    <div className={css.root} data-streaming={streaming || undefined}>
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

/** HeightLab 视频成片：缩略播放器 + 放大/下载/新窗口，图标均为 SVG。 */
function VideoEmbed({ url, workspace }: { url: string; workspace?: string | undefined }) {
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
      const saved = await saveToWorkspace(url, workspace)
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
        onClick={() => { setExpanded(true) }}
      />
      <div className={css.videoActions}>
        <button type="button" className={css.videoAction} title="放大播放" onClick={() => { setExpanded(true) }}>
          <IconFullscreenOutlineRegular size={14} />
        </button>
        <button type="button" className={css.videoAction} title="下载视频" onClick={() => { void downloadVideo() }}>
          <IconDownloadOutlineRegular size={14} />
        </button>
        <button
          type="button"
          className={css.videoAction}
          title="在浏览器中打开"
          onClick={() => { window.open(url, '_blank', 'noopener') }}
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
    return video
      ? (<>{markdown}<VideoEmbed key="video" url={video.url} workspace={cwd} /></>)
      : markdown
  }
  if (cursor < cleanText.length) {
    parts.push(<MarkdownText key={`text-${cursor}`} text={cleanText.slice(cursor)} streaming={streaming} labels={labels} fileMentions={fileMentions} pathImages={pathImages} />)
  }
  if (video) {
    parts.push(<VideoEmbed key="video" url={video.url} workspace={cwd} />)
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
