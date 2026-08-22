/** HeightLab：聊天页左侧的会话步骤导航条（Codex/ZCode 风格）。 */

import { useMemo, useRef, useState } from 'react'
import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '../contract/chat-nodes.ts'
import type { ConversationRootProps } from './ConversationRoot.tsx'
import css from './ConversationRail.module.css'

/** Rows that never carry a visible flow footprint are not worth a rail mark. */
const SKIPPED_KINDS: ReadonlySet<string> = new Set(['turn-tail'])

interface RailItem {
  readonly key: string
  readonly tooltip: string
}

/** Collect every text block (core ContentBlock or UI AssistantBlock). */
function contentText(blocks: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown; kind?: unknown; text?: unknown }
    if ((candidate.type === 'text' || candidate.kind === 'text')
      && typeof candidate.text === 'string') {
      parts.push(candidate.text)
    }
  }
  return parts.join('\n')
}

/** Bound one step's content to a short tooltip preview. */
function preview(raw: string): string {
  const compact = extractMarkdownPlainText(raw).replace(/\s+/g, ' ').trim()
  const head = compact.slice(0, 180).trimEnd()
  return head.length < compact.length ? `${head}…` : head
}

/** Human-readable text for the floating tooltip of one chat row. */
function nodeTooltip(node: ChatConversationViewNode): string {
  const typed = node as ChatNode
  switch (typed.kind) {
    case 'user':
    case 'steering':
    case 'context': {
      const text = preview(contentText(typed.data.content))
      if (text !== '') return text
      return typed.kind === 'user' ? '用户消息' : typed.kind === 'steering' ? '插话' : '上下文注入'
    }
    case 'assistant-step': {
      const text = preview(contentText(typed.data.blocks))
      if (text !== '') return text
      return typed.data.status === 'running' ? 'AI 回复中…' : 'AI 回复'
    }
    case 'tool-call': {
      const root = typed.data.root
      const name = 'name' in root ? root.name : root.call?.name ?? '工具'
      const result = 'content' in root ? preview(contentText(root.content)) : ''
      return result === '' ? `工具：${name}` : `工具：${name} — ${result}`
    }
    case 'command': {
      const name = typed.data.name ?? '命令'
      const args = typed.data.args?.trim() ?? ''
      return args === '' ? `命令：${name}` : `命令：${name} ${args}`
    }
    case 'manual-compaction':
      return '手动压缩上下文'
    case 'compaction':
      return typed.data.summary === null ? '上下文已压缩' : preview(typed.data.summary)
    case 'model-retry':
      return '模型请求重试'
    case 'turn-error':
      return typed.data.message
    case 'turn-max-tokens':
      return '输出长度达到上限'
    case 'unknown':
      return '未知步骤'
    default:
      return '会话步骤'
  }
}

/** Middle bars stay stronger; both ends fade toward very light gray. */
function railFade(index: number, count: number): number {
  const center = (count - 1) / 2
  const maxDistance = Math.max(1, center)
  const distance = Math.abs(index - center) / maxDistance
  return Math.max(0.16, 0.9 - 0.62 * distance)
}

/** Proximity bulge: the hovered bar grows most; closer neighbors grow more. */
function hoverScale(distance: number): number {
  return 1 + 0.9 * Math.exp(-distance / 1.6)
}

/** Scroll the conversation viewport so the selected row sits below the header. */
function jumpTo(key: string): void {
  const rows = document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')
  let row: HTMLElement | null = null
  let scrollport: HTMLElement | null = null
  for (const candidate of rows) {
    if (candidate.dataset.chatAnchorKey !== key) continue
    const port = candidate.closest<HTMLElement>('[data-conversation-scroll]')
    if (port !== null && port.getBoundingClientRect().height > 0) {
      row = candidate
      scrollport = port
      break
    }
  }
  if (row === null || scrollport === null) return
  const flowTop = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
  scrollport.scrollTo({ top: Math.max(0, scrollport.scrollTop + flowTop - 24), behavior: 'smooth' })
}

interface TooltipState {
  readonly x: number
  readonly y: number
  readonly text: string
}

/** Vertical rail of thin gray bars filling the full height; hover shows content. */
export function ConversationRail({
  useSession, t,
}: Pick<ConversationRootProps, 'useSession' | 't'>) {
  const order = useSession(snapshot => snapshot.chat.order)
  const nodes = useSession(snapshot => snapshot.chat.nodes.values())
  const railRef = useRef<HTMLElement | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const items = useMemo<RailItem[]>(() => {
    if (order === undefined || nodes === undefined) return []
    const byKey = new Map<string, ChatConversationViewNode>()
    for (const node of nodes) byKey.set(node.key, node)
    const out: RailItem[] = []
    for (const key of order) {
      const node = byKey.get(key)
      if (node === undefined || node.visibility !== 'visible') continue
      if (SKIPPED_KINDS.has(node.kind)) continue
      out.push({ key: node.key, tooltip: nodeTooltip(node) })
    }
    return out
  }, [order, nodes])
  if (items.length === 0) return null
  return (
    <nav
      ref={railRef}
      className={css.rail}
      aria-label={t('rail.aria')}
      data-hl-conversation-rail=""
      onMouseLeave={() => {
        setTooltip(null)
        setHoverIndex(null)
      }}
    >
      <div className={css.inner}>
        {items.map((item, index) => {
          const distance = hoverIndex === null ? null : Math.abs(index - hoverIndex)
          return (
            <button
              key={item.key}
              type="button"
              className={css.bar}
              style={{
                opacity: railFade(index, items.length),
                ...(distance === null ? {} : { transform: `scale(${hoverScale(distance)})` }),
              }}
              aria-label={t('rail.step', { n: index + 1 })}
              title={item.tooltip}
              onMouseEnter={(event) => {
                setHoverIndex(index)
                const railRect = railRef.current?.getBoundingClientRect()
                const barRect = event.currentTarget.getBoundingClientRect()
                setTooltip({
                  x: (railRect?.right ?? barRect.right) + 10,
                  y: barRect.top + barRect.height / 2,
                  text: item.tooltip,
                })
              }}
              onClick={() => { jumpTo(item.key) }}
            />
          )
        })}
      </div>
      {tooltip !== null && (
        <div className={css.tooltip} style={{ top: tooltip.y, left: tooltip.x }}>
          {tooltip.text}
        </div>
      )}
    </nav>
  )
}
