/** Card-aware output body for the selected Tool call in details. */
import type { ReactNode } from 'react'
import { DiffBlock, ReadBlock, SearchBlock, TerminalBlock, WebBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolDetailsProps } from '../contract/slots.ts'
import { diffCardModel } from './models/diff-card-model.ts'
import { readCardModel } from './models/read-card-model.ts'
import { searchCardModel } from './models/search-card-model.ts'
import { terminalBlockLabels, terminalCardModel } from './models/terminal-card-model.ts'
import { resultText } from './models/tool-call-model.ts'
import { webCardModel } from './models/web-card-model.ts'
import css from './ToolDetails.module.css'

/** Pure details-body inputs; framework session seats stay at the slot boundary. */
interface ToolDetailsContentProps {
  block: ToolDetailsProps['block']
  cwd?: ToolDetailsProps['cwd']
  t: ToolDetailsProps['t']
}

/** Render tool-result content blocks: text inline, image blocks as <img>. */
function renderContentBlocks(block: ToolDetailsProps['block']): ReactNode {
  if (!('kind' in block) || !Array.isArray(block.content)) return null
  const nodes: ReactNode[] = []
  for (let i = 0; i < block.content.length; i++) {
    const b = block.content[i]
    if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'image') {
      const data = (b as { data?: unknown }).data
      if (typeof data === 'string' && data.length > 0) {
        const mime = typeof (b as { mimeType?: unknown }).mimeType === 'string'
          ? (b as { mimeType: string }).mimeType
          : 'image/png'
        nodes.push(
          <img
            key={i}
            src={`data:${mime};base64,${data}`}
            alt="tool result image"
            style={{ maxWidth: '100%', borderRadius: 8, display: 'block', margin: '8px 0' }}
          />,
        )
      }
    } else if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text') {
      const text = (b as { text?: unknown }).text
      if (typeof text === 'string') nodes.push(<span key={i}>{text}</span>)
    }
  }
  if (nodes.length === 0) return null
  return nodes
}

/**
 * Render the selected Tool call's structured output when its presentation
 * intent is known, otherwise preserve the flattened result text.
 * @param props - selected call slice, workspace root, host home, and locale seat.
 * @returns the details output body.
 */
export function ToolDetails({
  block, cwd, useHostDescription, t,
}: Pick<ToolDetailsProps, 'block' | 'cwd' | 'useHostDescription' | 't'>) {
  const home = useHostDescription(description => description?.home)
  const terminal = terminalCardModel(block, cwd)
  if (terminal !== null) {
    return (
      <>
        {terminal.description !== undefined ? (
          <div className={css.description}>{terminal.description}</div>
        ) : null}
        <TerminalBlock {...terminal.card} labels={terminalBlockLabels(t)} className={css.cardBody} />
      </>
    )
  }
  const read = readCardModel(block, cwd, home)
  if (read !== null) return <ReadBlock {...read} className={css.read} />
  const diff = diffCardModel(block)
  if (diff !== null) return <DiffBlock {...diff.card} className={css.cardBody} />
  const search = searchCardModel(block)
  if (search !== null) {
    return (
      <>
        <SearchBlock {...search.card} className={css.cardBody} />
        {search.recovery !== undefined ? <div className={css.recovery}>{search.recovery}</div> : null}
      </>
    )
  }
  const web = webCardModel(block)
  if (web !== null) {
    const body = 'kind' in block ? resultText(block) : ''
    return (
      <>
        <WebBlock {...web} className={css.web} />
        {body !== '' ? <pre className={css.code}>{body}</pre> : null}
      </>
    )
  }
  if (!('kind' in block)) return <div className={css.empty}>{t('details.running')}</div>
  return (
    <div className={css.code} data-error={block.isError || undefined}>
      {renderContentBlocks(block) ?? resultText(block)}
    </div>
  )
}
