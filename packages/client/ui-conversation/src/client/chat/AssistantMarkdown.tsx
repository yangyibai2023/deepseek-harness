// AssistantMarkdown: renders assistant blocks in order — markdown text body,
// reasoning as the figma Think summary row (expand = indented gray text),
// other-block JSON fallback. Tool-call heads are NOT rendered here: the chat
// view groups them into tool rows through its keyed toolview slot (figma
// step-summary flow). Shared by finalized nodes and the streaming partial;
// the turn-level loading dots live in the chat view's tail, not here.
// Finalized content (text) nodes append IconActions once their turn ends
// (`time` is omitted for mid-turn narration and while the turn still runs);
// their branch action is enabled only when the node is also the completed
// turn's transcript tail. Think / tool-head-only nodes stay chrome-free.

import { Fragment, memo, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import {
  IconDownloadOutline16, IconFullscreenOutline16, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../contract/slots.ts'
import { HEIGHTLAB_UNKNOWN_BLOCK_TEXT } from './heightlab-friendly.ts'
import { messageImageLabels } from '../image-labels.ts'
import { ReasoningRow } from './ReasoningRow.tsx'
import css from './AssistantMarkdown.module.css'

/** HeightLab avatar-preview marker: [数字人形象预览：<url>] → inline <img>. */
const AVATAR_PREVIEW_MARKER = /\[数字人形象预览：([^\]]+)\]/g
/** HeightLab avatar-video URL: any absolute mp4/webm/mov in the reply text
 *  (including inside dsh-ui fences) gets an inline player as a fallback, so
 *  the 成片 always renders even when the model formats it as a link/card.
 *  A trailing query (e.g. /hl/video-gen.mp4?src=…) is allowed after the
 *  extension so proxied playable URLs still match. */
const AVATAR_VIDEO_URL = /https?:\/\/[^\s"'`\])]+?\.(?:mp4|webm|mov)(?=[\s"'`\])?]|\?|$)/i

export interface AssistantMarkdownProps {
  blocks: readonly AssistantBlock[]
  streaming: boolean
  /** Frozen partial of an aborted turn: rendered with a stopped marker. */
  interrupted?: boolean | undefined
  /** Render consecutive image blocks through the attachment slot. */
  renderMessageImages: ChatNodeOwnerProps['renderMessageImages']
  /** Resolved prose file mentions for this Assistant's closing turn. */
  mentions?: MarkdownFileMentions | undefined
  /** Session workspace root（下载/保存目标）。 */
  cwd?: string | undefined
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}

/** Reasoning block as the Think variant summary row (figma 39:28304). */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks, streaming, interrupted, renderMessageImages, mentions, cwd, t,
}: AssistantMarkdownProps) {
  // Stable per locale revision (t identity changes on switch): a fresh object
  // per render would rebuild MarkdownText's component table every chunk.
  const codeLabels = useMemo(() => ({ copyLabel: t('copy'), copiedLabel: t('copied') }), [t])
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
    switch (block.kind) {
      case 'text':
        // Split on avatar-preview markers so the inline image is rendered
        // next to the text (the model cannot emit image blocks directly).
        rendered.push(
          <AssistantTextWithPreview
            key={i}
            text={block.text}
            streaming={streaming}
            codeLabels={codeLabels}
            mentions={mentions}
            cwd={cwd}
          />,
        )
        break
      case 'reasoning':
        rendered.push(<ReasoningRow key={i} text={block.text} running={streaming && i === last} t={t} />)
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
        rendered.push(
          <span key={i} className={css.unknownBlock}>{HEIGHTLAB_UNKNOWN_BLOCK_TEXT}</span>,
        )
    }
  }
  return (
    <div className={css.root} data-streaming={streaming || undefined}>
      <div className={css.body}>
        {rendered}
        {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})

/** Render assistant text, replacing [数字人形象预览：<url>] with inline <img>. */
/** Extract a playable video URL from markdown image syntax or plain text. */
function extractVideoUrl(text: string): { url: string; markdown?: string } | null {
  const md = /!\[[^\]]*\]\(([^)]*\.(?:mp4|webm|mov)[^)]*)\)/i.exec(text)
  if (md !== null) {
    return { url: (md[1] ?? '').trim(), markdown: md[0] }
  }
  const plain = AVATAR_VIDEO_URL.exec(text)?.[0]
  return plain ? { url: plain } : null
}

/** HeightLab 视频成片：缩略播放器 + 放大/下载/新窗口，图标均为 SVG。 */
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
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])
  const downloadVideo = async (): Promise<void> => {
    try {
      const saved = await saveToWorkspace(url, workspace)
      setDownloadMsg(`已保存到：${saved}`)
    } catch (err) {
      setDownloadMsg(`下载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    window.setTimeout(() => setDownloadMsg(null), 6000)
  }
  return (
    <div className={css.videoEmbed}>
      <video
        src={url}
        controls
        preload="metadata"
        className={css.videoThumb}
        onClick={() => setExpanded(true)}
      />
      <div className={css.videoActions}>
        <button type="button" className={css.videoAction} title="放大播放" onClick={() => setExpanded(true)}>
          <IconFullscreenOutline16 />
        </button>
        <button type="button" className={css.videoAction} title="下载视频" onClick={() => { void downloadVideo() }}>
          <IconDownloadOutline16 />
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
        <div className={css.videoOverlay} role="dialog" aria-modal="true" onClick={() => setExpanded(false)}>
          <video
            src={url}
            controls
            autoPlay
            className={css.videoExpanded}
            onClick={event => event.stopPropagation()}
          />
          <button type="button" className={css.videoClose} aria-label="关闭" onClick={() => setExpanded(false)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function AssistantTextWithPreview({
  text, streaming, codeLabels, mentions, cwd,
}: {
  text: string
  streaming: boolean
  codeLabels: { copyLabel: string; copiedLabel: string }
  mentions?: MarkdownFileMentions | undefined
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
      parts.push(<MarkdownText key={`text-${cursor}`} text={prefix} streaming={streaming} codeLabels={codeLabels} fileMentions={mentions} />)
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
    const markdown = <MarkdownText text={cleanText} streaming={streaming} codeLabels={codeLabels} fileMentions={mentions} />
    return video
      ? (<>{markdown}<VideoEmbed key="video" url={video.url} workspace={cwd} /></>)
      : markdown
  }
  if (cursor < cleanText.length) {
    parts.push(<MarkdownText key={`text-${cursor}`} text={cleanText.slice(cursor)} streaming={streaming} codeLabels={codeLabels} fileMentions={mentions} />)
  }
  if (video) {
    parts.push(<VideoEmbed key="video" url={video.url} workspace={cwd} />)
  }
  return <>{parts}</>
}
