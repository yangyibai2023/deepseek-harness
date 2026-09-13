/**
 * HeightLab 更新状态共享 store（0.3.8）
 *
 * 侧边栏「更新」胶囊与「关于」页共用同一份检查/下载/安装状态：
 * - 任一入口触发下载，另一入口看到同一进度，不会重复下载；
 * - 下载完成（done:true）统一显示 100%，随后显示「正在安装…」；
 * - 安装成功后由 Rust 侧自动重启应用，用户无需手动关闭再打开。
 */

interface UpdateInfo {
  currentVersion?: string
  version?: string
  body?: string
}

type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'done' | 'error'

export interface UpdateState {
  info: UpdateInfo | null
  busy: boolean
  progress: number
  phase: UpdatePhase
  message: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let state: UpdateState = {
  info: null,
  busy: false,
  progress: 0,
  phase: 'idle',
  message: null,
}

function emit(): void {
  for (const listener of [...listeners]) listener()
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  emit()
}

function tauriBridge(): {
  invoke: ((...args: unknown[]) => Promise<unknown>) | undefined
  listen: ((event: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void>) | undefined
} {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: (...args: unknown[]) => Promise<unknown> }; event?: { listen?: (event: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void> } } }).__TAURI__
  return {
    invoke: (api?.core?.invoke
      ?? (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (...args: unknown[]) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke) as ((...args: unknown[]) => Promise<unknown>) | undefined,
    listen: api?.event?.listen as ((event: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void>) | undefined,
  }
}

/** 诊断埋点：把更新检查各阶段写到宿主日志（~/.heightlab/update-debug.jsonl）。 */
function logStage(stage: string, extra?: unknown): void {
  try {
    fetch('/hl/update-debug', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ at: Date.now(), stage, ...(extra === undefined ? {} : { extra }) }),
    }).catch(() => { /* 非致命 */ })
  } catch { /* 非致命 */ }
}

export function subscribeUpdateState(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getUpdateState(): UpdateState {
  return state
}

export async function checkForUpdate(): Promise<void> {
  const { invoke } = tauriBridge()
  if (invoke === undefined) {
    setState({ phase: 'error', message: '桌面版支持在线检查更新（当前为网页预览）' })
    return
  }
  if (state.busy) return
  setState({ phase: 'checking', message: null })
  logStage('start')
  try {
    logStage('invoke-begin')
    const result = await invoke('hl_check_update') as UpdateInfo | null
    logStage('invoke-done', { result: result === null ? 'none' : 'update' })
    if (result === null || result === undefined || result.version === undefined) {
      setState({ info: null, phase: 'current', message: '当前已是最新版本' })
    } else {
      setState({ info: result, phase: 'available', message: `发现新版本 v${result.version}（当前 v${result.currentVersion}）` })
    }
  } catch (error) {
    logStage('native-error', { error: String(error) })
    // 原生命令失败时回退到官网清单（公开接口），保证用户能拿到正确结论。
    try {
      const response = await fetch('/hl/update-latest')
      const data = await response.json() as { version?: string }
      const current = state.info?.currentVersion ?? '0.3.0'
      if (data.version === current || data.version === undefined) {
        setState({ info: null, phase: 'current', message: '当前已是最新版本' })
      } else {
        setState({
          info: { version: data.version, currentVersion: current },
          phase: 'available',
          message: `发现新版本 v${data.version}（当前 v${current}）`,
        })
      }
    } catch {
      setState({ phase: 'error', message: `检查更新失败：${String(error)}` })
    }
  }
}

export async function installUpdate(): Promise<void> {
  const { invoke, listen } = tauriBridge()
  if (invoke === undefined) {
    setState({ phase: 'error', message: '桌面版支持在线更新（当前为网页预览）' })
    return
  }
  if (state.busy) return
  setState({ busy: true, progress: 0, phase: 'installing', message: '正在下载更新…' })
  let downloaded = 0
  let total: number | null = null
  let unlisten: (() => void) | undefined
  try {
    if (listen !== undefined) {
      unlisten = await listen('hl://update-progress', (event) => {
        const payload = (event.payload ?? {}) as { chunkLength?: number; contentLength?: number | null; done?: boolean }
        if (payload.done === true) {
          setState({ progress: 100, message: '下载完成，正在安装…' })
          return
        }
        if (typeof payload.chunkLength === 'number') downloaded += payload.chunkLength
        if (payload.contentLength != null) total = payload.contentLength
        if (total !== null && total > 0) setState({ progress: Math.min(100, Math.round((downloaded / total) * 100)) })
      })
    }
    await invoke('hl_install_update')
    setState({ progress: 100, phase: 'done', message: '更新完成，正在重启…' })
  } catch (error) {
    setState({ busy: false, phase: 'error', message: `更新失败：${String(error)}` })
  } finally {
    unlisten?.()
  }
}
