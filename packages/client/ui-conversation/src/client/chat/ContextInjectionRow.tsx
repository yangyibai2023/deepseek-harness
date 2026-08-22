import { useEffect, useState } from 'react'
import type { ContextMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { DisclosureRow, IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ReferenceIcon } from '../reference/ReferenceIcon.tsx'
import { contextBody } from './ContextBody.tsx'
import css from './ContextInjectionRow.module.css'

/** HeightLab：预设/智能体 id → 中文名（上下文注入行“谁已收到”动态显示）。 */
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
  provenance: ContextMessageNode['provenance']
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
export function ContextInjectionRow({ content, source, provenance, form, t }: ContextInjectionRowProps) {
  const [open, setOpen] = useState(false)
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
          const live = data?.ok === true && typeof data.id === 'string' && data.id !== '' ? data.id : null
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
  const mappedLabel = provenance.label !== null && HEIGHTLAB_FIXED_LABELS[provenance.label] !== undefined
    ? HEIGHTLAB_FIXED_LABELS[provenance.label]
    : provenance.label !== null && HEIGHTLAB_DYNAMIC_SOURCES.has(provenance.label)
      ? `${HEIGHTLAB_PRESET_NAMES[workingAgent ?? 'standard'] ?? 'Colin 指挥官'} 已收到`
      : undefined

  return (
    <DisclosureRow
      className={css.root}
      icon={provenance.role === 'recall'
        ? <span data-context-recall-icon><ReferenceIcon kind="session" /></span>
        : <IconBrowseOutline16 size={14} />}
      chevronClassName={css.chevron}
      title={mappedLabel ?? t(provenance.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection')}
      collapsedContent={provenance.label === null || mappedLabel !== undefined ? undefined : (
        /* ToolRow's separator shape: an aria-hidden dot, so the accessible name
           stays the two readable parts and the two disclosure rows expose one
           name shape. A source that names no producer drops the dot with it. */
        <>
          <span className={css.sep} aria-hidden />
          <span className={css.source} data-context-source>{provenance.label}</span>
          {summary !== null && (
            <>
              <span className={css.sep} aria-hidden />
              <span className={css.summary} data-context-summary>{summary}</span>
            </>
          )}
        </>
      )}
      keepContentWhenOpen
      open={open}
      expandable
      expandOnRowClick
      onToggle={() => { setOpen(value => !value) }}
    >
      <div className={css.body} data-context-injection-body data-context-form={rendered ?? undefined}>
        {body}
      </div>
    </DisclosureRow>
  )
}
