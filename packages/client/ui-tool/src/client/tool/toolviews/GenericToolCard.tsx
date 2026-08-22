// GenericToolCard: the default tool row — classifies the tool into a visual
// variant and renders the summary row. Supplied by the Tool call tree as the
// keyed atomic-view slot's render-site fallback (an
// unregistered tool name lands here); registrants may also compose it as a
// base, feeding the same owner payload through.

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconApiOutline14, IconBrowseOutline16, IconCodeOutline16, IconEditOutline16, IconSearchOutline16, IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallOwnerProps, ToolTreeProps } from '../../contract/slots.ts'
import { readCardModel } from '../models/read-card-model.ts'
import { diffCardModel } from '../models/diff-card-model.ts'
import { searchCardModel } from '../models/search-card-model.ts'
import { terminalCardModel, terminalFailed } from '../models/terminal-card-model.ts'
import { webCardModel } from '../models/web-card-model.ts'
import { toolRowModel, type ToolRowVariant } from '../models/tool-call-model.ts'
import { ToolRow } from '../components/ToolRow.tsx'

/** Variant leading icons (figma table); all glyphs render at 14 inside the 16px leading box. */
const VARIANT_ICONS: Record<ToolRowVariant, ReactNode> = {
  search: <IconSearchOutline16 size={14} />,
  read: <IconBrowseOutline16 size={14} />,
  bash: <IconApiOutline14 size={14} />,
  write: <IconEditOutline16 size={14} />,
  edit: <IconEditOutline16 size={14} />,
  code: <IconCodeOutline16 size={14} />,
  others: <IconSparkle16 size={14} />,
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

/** Card props: the owner payload plus the render site's locale seat (plain prop). */
export interface GenericToolCardProps extends ToolCallOwnerProps {
  t: ToolTreeProps['t']
}

export function GenericToolCard({ toolName, block, cwd, home, openFile, inspect, t }: GenericToolCardProps) {
  const [viewer, setViewer] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<string | null>(null)
  const model = toolRowModel(toolName, block, cwd, home)
  const terminal = terminalCardModel(block, cwd)
  const read = readCardModel(block, cwd, home)
  const diff = diffCardModel(block)
  const search = searchCardModel(block)
  const web = webCardModel(block)
  // A failing exit status is the terminal card's own error signal (the call
  // itself settles isError:false), surfaced as the row's red state dot.
  const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
    ? 'error'
    : model.state
  const singleFile = model.filePath !== undefined
  const images = extractImageUrls(model.output ?? '')

  const downloadCurrent = async (): Promise<void> => {
    if (viewer === null) return
    try {
      const saved = await downloadToWorkspace(viewer, cwd)
      setDownloadState(`已保存到：${saved}`)
    } catch (err) {
      setDownloadState(`下载失败：${err instanceof Error ? err.message : String(err)}`)
    }
    window.setTimeout(() => setDownloadState(null), 6000)
  }

  return (
    <>
      <ToolRow
        t={t}
        variant={model.variant}
        toolName={toolName}
        icon={VARIANT_ICONS[model.variant]}
        title={model.title}
        summary={terminal?.description ?? search?.title ?? model.summary}
        body={singleFile ? null : model.body}
        output={model.output}
        errorSummary={model.errorSummary}
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
              onClick={() => setViewer(img)}
              style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, objectFit: 'contain', cursor: 'zoom-in' }}
            />
          ))}
        </div>
      )}
      {viewer !== null && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setViewer(null)}
        >
          <img
            src={viewer}
            alt="preview"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '92%', maxHeight: '88%', objectFit: 'contain', borderRadius: 4 }}
          />
          <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); window.open(viewer, '_blank', 'noopener') }}
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
            <button type="button" style={viewerButtonStyle} onClick={() => setViewer(null)}>
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
      )}
    </>
  )
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

/** Pull image URLs (png/jpg/webp/gif) out of tool-result text. */
function extractImageUrls(text: string): string[] {
  if (!text) return []
  const re = /(https?:\/\/[^\s)）"'<>]+?\.(?:png|jpe?g|webp|gif))/gi
  const out: string[] = []
  for (const match of text.matchAll(re)) {
    if (match[1] && !out.includes(match[1])) out.push(match[1])
  }
  return out
}
