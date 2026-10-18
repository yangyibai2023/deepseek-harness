/**
 * HeightLab 剪辑台（2026-10-20，基于 OpenFilm 0.2.0）。
 *
 * 两种入口，两种形态（用户拍板）：
 *
 *   (a) 一级菜单「剪辑台」→ 主区满幅是 Studio，右侧自动开一段**新对话**
 *       （better-sidebar 的侧边对话：独立子会话、有事件日志、从 0 开始）。
 *       调用方传 `opensChat`，组件挂载时派发 `hl:film-open-chat`。
 *
 *   (b) 对话里点「剪辑台」→ Studio 出现在**右侧边栏**，主区仍是当前对话。
 *       这条路径由 `heightlab-film-tab` 插件承载（它把同样的 iframe 放进
 *       better-sidebar 的标签里），不经过本文件。
 *
 * 布局说明（踩过的坑）：Studio 内部有硬性最小宽度（预览 280 / Inspector 240 /
 * 官方 studioMin 640）。**不要用 CSS 去压缩它**——压到 640 以下它会把面板判定
 * "放不下"而隐藏，弹层也会因坐标系被外层裁切而点不到。所以这里只负责
 * 「给它足够的宽度」，可用性判断交给调用方的容器。
 */
import { useEffect, useRef, useState } from 'react'

interface FilmBoot {
  ok: boolean
  url?: string
  message?: string
  error?: string
}

/** Studio 注入脚本回传的选中信息。 */
interface StudioSelection {
  time: number
  refs: Array<{ kind: string; label: string; start?: number; end?: number; track?: number }>
}

/** 秒 → `m:ss.s`，用于引用标记。 */
function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/** 把选中信息转成输入框里的可读标记。 */
function describeSelection(selection: StudioSelection | null): string {
  const time = selection === null ? 0 : selection.time
  const first = selection?.refs[0]
  if (selection === null || first === undefined) return `【剪辑台：当前时间 ${formatTime(time)}】`
  const span = typeof first.start === 'number' && typeof first.end === 'number'
    ? `${formatTime(first.start)}–${formatTime(first.end)}`
    : formatTime(time)
  const where = typeof first.track === 'number' ? `（轨道 ${first.track + 1}）` : ''
  return `【剪辑台：${first.label}${where} · ${span}】`
}

/**
 * @param onClose - 关闭回调。
 * @param opensChat - true 时挂载后请宿主在右侧开一段新对话（入口 a）。
 */
export function HeightLabFilmStudio({ onClose, opensChat = false }: {
  onClose: () => void
  opensChat?: boolean
}) {
  const [boot, setBoot] = useState<FilmBoot | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [selection, setSelection] = useState<StudioSelection | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  // 入口 (a)：按 OpenFilm 原生桌面版的形态摆位——
  //   ① 左侧主导航折叠（把宽度让给剪辑台）
  //   ② 右侧边栏打开并给到对话列（约 400px，可窄一点）
  //   ③ 里面起一段全新会话（从 0 开始）
  // 三者都是事件驱动的，各自由所属插件处理，这里不直接改别人的 DOM。
  useEffect(() => {
    if (!opensChat) return
    window.dispatchEvent(new CustomEvent('hl:film-enter-native'))
  }, [opensChat])

  // 地址选择（2026-10-20 用户拍板「一模一样还原」）：
  //   · 入口 (a) 一级菜单 → 用 **OpenFilm 原生 shell**（它自己的 Studio +
  //     自己的聊天栏，见 /hl/film/native/），这就是截图里那个样子。
  //   · 否则 → 我们拼装的 Studio（右侧是我们的对话）。
  useEffect(() => {
    let alive = true
    if (opensChat) {
      // 原生 shell 需要 Studio 服务在跑，先预热一下再挂 iframe（失败也让
      // shell 自己显示错误，而不是我们这里白屏）。
      void fetch('/hl/film', { cache: 'no-store' }).catch(() => null)
      setBoot({ ok: true, url: '/hl/film/native/' })
      return () => { alive = false }
    }
    void fetch('/hl/film', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as FilmBoot
        if (alive) setBoot(data)
      })
      .catch(() => { if (alive) setError('剪辑运行时无法连接') })
    return () => { alive = false }
  }, [opensChat])

  // 接收 Studio 的选中回传（注入脚本 postMessage 上来）。
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const frame = frameRef.current
      if (frame === null || event.source !== frame.contentWindow) return
      const data = event.data as { hl?: string; selection?: StudioSelection } | null
      if (data?.hl === 'film-selection' && data.selection !== undefined) setSelection(data.selection)
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [])

  const referSelection = (): void => {
    window.dispatchEvent(new CustomEvent('hl:insert-reference', { detail: { marker: describeSelection(selection) } }))
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', minWidth: 0 }}>
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
          id="hl-film-frame"
          /* 外层容器已经用真实 DOM 分好栏，Studio 拿满即可。
             再通过 panel 通道传宽度会让它二次收缩（右侧出现空白阴影）。 */
          src={boot.url}
          title="剪辑台"
          allow="clipboard-read; clipboard-write; fullscreen"
          style={{ flex: 1, width: '100%', border: 'none', background: 'transparent' }}
        />
      )}

      {/* 浮层控件：只有这两个，不占布局。原生 shell 形态下它自己有完整界面，不叠。 */}
      <div style={{ position: 'absolute', top: 8, right: 10, zIndex: 2, display: opensChat ? 'none' : 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={referSelection}
          disabled={boot?.url === undefined}
          style={{
            height: 24, padding: '0 10px',
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999,
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'inherit', fontSize: 11.5, cursor: 'pointer', opacity: boot?.url === undefined ? 0.5 : 0.92,
          }}
        >
          引用到对话
        </button>
        <button
          type="button"
          aria-label="关闭剪辑台"
          onClick={onClose}
          style={{
            width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999,
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer', opacity: 0.92,
          }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
