/**
 * HeightLab 剪辑台（2026-10-20，基于 OpenFilm 0.2.0）。
 *
 * 形态：主内容区的一个工作台页，里面是 Studio 的 iframe。它**不是**第三套模式，
 * 而是个人模式里的一个工具视图——聊天仍然是聊天，切回去会话不中断。
 *
 * 三个关键设计：
 *
 * 1. **iframe 而不是内联组件**：Studio 是 React 应用，内联进我们的树会跨 React
 *    实例（Invalid hook call）。iframe 天然隔离，还能让它按自己的 origin/鉴权跑。
 *
 * 2. **引用桥**：用户点「引用当前选中」时，我们用 postMessage 向 iframe 索取
 *    当前选中信息（Studio 侧由注入脚本响应），再转成可读标记写进草稿——
 *    走 `hl:insert-reference`，落点是用户正在用的输入框，不是另开一个聊天框。
 *
 * 3. **降级明确**：运行时未就绪时给出可执行提示（而不是空白 iframe）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface FilmProject {
  id: string
  name: string
  path: string
  hasFilm: boolean
  updatedAt: number
}

interface FilmBoot {
  ok: boolean
  url?: string
  projects?: FilmProject[]
  message?: string
  error?: string
}

/** Studio 侧注入脚本回传的选中信息。 */
interface StudioSelection {
  time: number
  refs: Array<{ kind: string; label: string; start?: number; end?: number; track?: number }>
}

const FRAME_ID = 'hl-film-frame'

/** 秒 → `mm:ss.s`，用于引用标记。 */
function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`
}

/** 把命中测试结果转成输入框里的可读标记。 */
function describeSelection(selection: StudioSelection | null): string {
  const time = selection === null ? 0 : selection.time
  if (selection === null || selection.refs.length === 0) {
    return `【剪辑台：当前时间 ${formatTime(time)}】`
  }
  const first = selection.refs[0]
  if (first === undefined) return `【剪辑台：当前时间 ${formatTime(time)}】`
  const span = typeof first.start === 'number' && typeof first.end === 'number'
    ? `${formatTime(first.start)}–${formatTime(first.end)}`
    : formatTime(time)
  const where = typeof first.track === 'number' ? `（轨道 ${first.track + 1}）` : ''
  return `【剪辑台：${first.label}${where} · ${span}】`
}

export function HeightLabFilmStudio({ onClose }: { onClose: () => void }) {
  const [boot, setBoot] = useState<FilmBoot | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [selection, setSelection] = useState<StudioSelection | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const requestId = useRef(0)

  // 拉 Studio 地址（宿主扩展负责托管进程；首次会稍慢）。
  useEffect(() => {
    let alive = true
    void fetch('/hl/film', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as FilmBoot
        if (alive) setBoot(data)
      })
      .catch(() => { if (alive) setError('剪辑运行时无法连接') })
    return () => { alive = false }
  }, [])

  // 接收 Studio 的选中回传（它由注入脚本 postMessage 上来）。
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const frame = frameRef.current
      if (frame === null || event.source !== frame.contentWindow) return
      const data = event.data as { hl?: string; selection?: StudioSelection } | null
      if (data?.hl === 'film-selection' && data.selection !== undefined) {
        setSelection(data.selection)
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [])

  // 引用当前选中：向 iframe 要一次快照，再写进草稿。
  const referSelection = useCallback((): void => {
    const frame = frameRef.current
    if (frame === null) return
    requestId.current += 1
    const id = requestId.current
    frame.contentWindow?.postMessage({ hl: 'film-get-selection', id }, '*')
    // 用最近一次已知的选中先写一次，避免用户点了没反应；随后由后续选择刷新。
    const marker = describeSelection(selection)
    window.dispatchEvent(new CustomEvent('hl:insert-reference', { detail: { marker } }))
  }, [selection])

  const openProject = useCallback((project: FilmProject): void => {
    const frame = frameRef.current
    if (frame === null || boot?.url === undefined) return
    // 让 Studio 切到这部片子：扩展提供的地址里 `to` 参数就是项目路由。
    const url = new URL(boot.url)
    const origin = url.origin
    // project.id 是扩展算出来的稳定哈希，Studio 的路由也用它，直接改 to。
    url.searchParams.set('to', `/projects/${encodeURIComponent(project.id)}`)
    frame.src = url.toString()
    try { window.localStorage.setItem('hl.film.lastProject', project.name) } catch { /* 隐私模式 */ }
    void origin
  }, [boot])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 'none',
          height: 44, padding: '0 12px 0 16px', boxSizing: 'border-box',
          borderBottom: '1px solid var(--dsw-alias-border-l2)',
        }}
        data-tauri-drag-region="deep"
      >
        <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '20px' }}>剪辑台</span>
        {boot?.projects !== undefined && boot.projects.length > 0 && (
          <select
            aria-label="切换影片"
            defaultValue=""
            onChange={(event) => {
              const hit = boot.projects?.find(p => p.name === event.target.value)
              if (hit !== undefined) openProject(hit)
            }}
            style={{
              height: 26, maxWidth: 220, border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8, background: 'transparent', fontFamily: 'inherit',
              fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
            }}
          >
            <option value="">选择影片…</option>
            {boot.projects.map(p => (
              <option key={p.id} value={p.name}>{p.name}{p.hasFilm ? '' : '（空）'}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={referSelection}
          disabled={boot?.url === undefined}
          style={{
            height: 26, padding: '0 12px', marginLeft: 'auto',
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999,
            background: 'transparent', color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'inherit', fontSize: 12, cursor: boot?.url === undefined ? 'default' : 'pointer',
            opacity: boot?.url === undefined ? 0.5 : 1,
          }}
        >
          引用到对话
        </button>
        <button
          type="button"
          style={{
            width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 8, background: 'transparent',
            color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
          }}
          aria-label="关闭"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {error !== undefined && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{error}</div>
      )}

      {boot === null && error === undefined && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>正在启动剪辑运行时……（首次约需 30 秒）</div>
      )}

      {boot !== null && !boot.ok && (
        <div style={{ padding: 16, fontSize: 13, lineHeight: '22px', color: 'var(--dsw-alias-label-secondary)' }}>
          {boot.message ?? '剪辑运行时尚未就绪。'}
        </div>
      )}

      {boot?.url !== undefined && (
        <iframe
          ref={frameRef}
          id={FRAME_ID}
          src={boot.url}
          title="剪辑台"
          allow="clipboard-read; clipboard-write; fullscreen"
          style={{ flex: 1, width: '100%', border: 'none', background: 'transparent' }}
        />
      )}
    </div>
  )
}
