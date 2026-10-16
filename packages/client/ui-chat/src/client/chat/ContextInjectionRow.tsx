import { useEffect, useState } from 'react'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { DisclosureRow, IconBrowseOutlineRegular, IconContextInjectionOutlineRegular, ReferenceIconRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ContextMessageNode } from '../contract/snapshot.ts'
import { contextBody } from './ContextBody.tsx'
import css from './ContextInjectionRow.module.css'

/** HeightLab（0.4.1 定制回植，2026-10-17）：预设/智能体 id → 中文名
 *  （上下文注入行“谁已收到”动态显示）。 */
const HEIGHTLAB_PRESET_NAMES: Readonly<Record<string, string>> = {
  standard: 'Colin 指挥官',
  'video-producer': '视频制作专家',
  'image-generator': '图片制作专家',
  'content-creator': '内容创作专家',
  'research-analyst': '研究分析专家',
  'general-assistant': '通用 AI 助手',
  minimal: '系统操作专家',
  cordis: '创造模式',
}

/** 内部注入来源：标题显示“{当前智能体} 已收到”（动态，随执行/选中变化）。 */
const HEIGHTLAB_DYNAMIC_SOURCES: ReadonlySet<string> = new Set([
  'system-prompt',
  '@deepseek-ai/dsh-system-prompt',
  'heightlab-dispatch',
])

const HEIGHTLAB_FIXED_LABELS: Readonly<Record<string, string>> = {
  'skill-catalog': '技能已加载',
}

/** Props for the logged non-user message presentation. */
export interface ContextInjectionRowProps {
  content: ContextMessageNode['content']
  source: ContextMessageNode['source']
  /** Role and producer name projected from the durable source. */
  producer: ContextMessageNode['producer']
  /** Producer-declared information form; null renders the opaque body. */
  form: ContextMessageNode['form']
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}

/**
 * Render logged context with the Tool calls disclosure chrome from Figma.
 *
 * The header names the role the context plays and, beside it, the producer the
 * durable source identifies, so a reader can tell an injected skill catalog
 * from a workspace instruction file or a recalled session without expanding.
 * The expanded body follows the producer-declared form; an absent or unknown
 * form renders the opaque body.
 * @param props - Durable content, its projected producer role/name and form, and the locale seat.
 * @returns A collapsed context row with a bounded, form-specific body.
 */
export function ContextInjectionRow({ content, source, producer, form, t }: ContextInjectionRowProps) {
  const [open, setOpen] = useState(false)
  // HeightLab：预设/智能体 id → 中文名（上下文注入行“谁已收到”动态显示）。
  const [workingAgent, setWorkingAgent] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const tick = (): void => {
      const staged = document.body.dataset.hlAgentPreset ?? null
      const working = document.body.dataset.hlWorkingAgent ?? null
      fetch('/hl/current-agent')
        .then(response => response.json().catch(() => ({})))
        .then((data: { ok?: boolean; id?: string | null }) => {
          if (cancelled) return
          const live = data.ok === true && typeof data.id === 'string' && data.id !== '' ? data.id : null
          setWorkingAgent(live ?? working ?? staged)
        })
        .catch(() => {
          if (!cancelled) setWorkingAgent(working ?? staged)
        })
    }
    tick()
    const timer = window.setInterval(tick, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  // Resolved rather than declared: a form whose fields are unreadable renders
  // the opaque body, and the marker must say what the row actually shows.
  const { rendered, summary, body } = contextBody(form, { content, source, t })
  // HeightLab：固定标签（技能已加载）与动态来源（{智能体} 已收到）映射。
  const producerLabel = producer.label
  const mappedLabel = producerLabel !== null && HEIGHTLAB_FIXED_LABELS[producerLabel] !== undefined
    ? HEIGHTLAB_FIXED_LABELS[producerLabel]
    : producerLabel !== null && HEIGHTLAB_DYNAMIC_SOURCES.has(producerLabel)
      ? `${HEIGHTLAB_PRESET_NAMES[workingAgent ?? 'standard'] ?? 'Colin 指挥官'} 已收到`
      : undefined

  const toolBlocks = content.length > 0
    && content.every(block => block.type === 'tool-addition' || block.type === 'tool-removal')
    ? content : undefined
  const added = toolBlocks?.flatMap(block => block.type === 'tool-addition' ? [block.toolName] : []) ?? []
  const removed = toolBlocks?.flatMap(block => block.type === 'tool-removal' ? [block.toolName] : []) ?? []
  const single = toolBlocks?.length === 1 ? toolBlocks[0] : undefined
  const toolSummary = toolBlocks === undefined || single !== undefined ? null
    : added.length > 0 && removed.length > 0
      ? t('message.toolsChanged', { added: added.length, removed: removed.length })
      : added.length > 0
        ? t('message.toolsAddedCount', { count: added.length })
        : t('message.toolsRemovedCount', { count: removed.length })

  return (
    <DisclosureRow
      className={css.root}
      icon={toolBlocks !== undefined ? <IconBrowseOutlineRegular size={14} /> : producer.role === 'recall'
        ? <span data-context-recall-icon><ReferenceIconRegular kind="session" /></span>
        : <IconContextInjectionOutlineRegular size={14} />}
      chevronClassName={css.chevron}
      title={single !== undefined ? t(single.type === 'tool-addition' ? 'message.toolAdded' : 'message.toolRemoved', { name: single.toolName }) : mappedLabel ?? t(toolBlocks !== undefined ? 'message.toolsUpdated' : producer.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection')}
      collapsedContent={toolSummary !== null ? (
        <>
          <span className={css.sep} aria-hidden />
          <span className={css.summary}>{toolSummary}</span>
        </>
      ) : toolBlocks !== undefined || producer.label === null || mappedLabel !== undefined ? undefined : (
        /* ToolRow's separator shape: an aria-hidden dot, so the accessible name
           stays the two readable parts and the two disclosure rows expose one
           name shape. A source that names no producer drops the dot with it. */
        <>
          <span className={css.sep} aria-hidden />
          <span className={css.source} data-context-source>{producer.label}</span>
          {summary !== null && (
            <>
              <span className={css.sep} aria-hidden />
              <span className={css.summary} data-context-summary>{summary}</span>
            </>
          )}
        </>
      )}
      keepContentWhenOpen
      open={open && single === undefined}
      expandable={single === undefined}
      expandOnRowClick
      onToggle={() => { setOpen(value => !value) }}
    >
      <div className={css.body} data-context-injection-body data-context-form={rendered ?? undefined}>
        {toolBlocks === undefined ? body : (
          <div className={css.toolChanges}>
            {added.length > 0 && <div>{t('message.toolsAdded', { names: added.join(', ') })}</div>}
            {removed.length > 0 && <div>{t('message.toolsRemoved', { names: removed.join(', ') })}</div>}
          </div>
        )}
      </div>
    </DisclosureRow>
  )
}
