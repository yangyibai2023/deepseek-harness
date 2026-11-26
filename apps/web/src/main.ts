/** Browser entry for the Web client. */
import '@deepseek-ai/dsh-client-ui-theme/brand-font.css'
import { AppWebEntry, applyIndexInjections } from '@deepseek-ai/dsh-client-web'

/**
 * HeightLab 运营遥测（T3 前端半环，2026-11-26 断链取证后补）：
 * 壳内 WebView 此前没有任何错误上报——「重连循环」类故障被 catch 不抛未捕获异常，
 * window.error 抓不到；console.error 与 unhandledrejection 是唯一通用信号源。
 * 这里内联最小实现（与主仓 apps/web/src/telemetry.ts 同口径）：
 * - 只采版本/错误类型/消息摘要（≤500 字符），不采对话内容与提示词；
 * - 匿名可写（网关限速覆盖），localStorage 有 heightlab-token 时附带身份由服务端关联；
 * - 限流 10 条/分钟，防故障风暴刷爆端点；所有失败静默（遥测永不影响主功能）。
 * 上报目标与桥端心跳同源（HEIGHTLAB_CLOUD_URL 语义）：默认 https://www.heightlabai.com。
 */
const HL_CLOUD_BASE = (globalThis as { __HL_CLOUD_BASE__?: string }).__HL_CLOUD_BASE__
  ?? 'https://www.heightlabai.com'
const HL_APP_VERSION = '0.5.12'
let hlErrWindowStart = 0
let hlErrWindowCount = 0

function hlAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('heightlab-token') || ''
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

function hlReportError(kind: string, message: string): void {
  try {
    const now = Date.now()
    if (now - hlErrWindowStart > 60_000) {
      hlErrWindowStart = now
      hlErrWindowCount = 0
    }
    if (hlErrWindowCount >= 10) return
    hlErrWindowCount += 1
    void fetch(`${HL_CLOUD_BASE}/api/telemetry/errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...hlAuthHeaders() },
      body: JSON.stringify({ version: HL_APP_VERSION, kind, message: message.slice(0, 500) }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 非致命 */
  }
}

function hlInstallErrorCapture(): void {
  window.addEventListener('error', (event) => {
    hlReportError('window.error', event.message || 'unknown')
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'unknown')
    hlReportError('unhandledrejection', reason)
  })
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    try {
      hlReportError('console.error', args.map(a => (typeof a === 'string' ? a : (a as Error)?.message ?? String(a))).join(' | '))
    } catch {
      /* 非致命 */
    }
    originalConsoleError.apply(console, args)
  }
  // 心跳（5min）：心跳体带 sessionOk=false 时由桥端覆盖为功能级信号（T4 联动）。
  const hlBeat = (): void => {
    try {
      void fetch(`${HL_CLOUD_BASE}/api/telemetry/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...hlAuthHeaders() },
        body: JSON.stringify({ version: HL_APP_VERSION, platform: 'desktop-web' }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* 非致命 */
    }
  }
  hlBeat()
  setInterval(hlBeat, 5 * 60_000)
}
hlInstallErrorCapture()

interface DesktopBootGlobal {
  dshDesktopBoot?: {
    failed(message: string): Promise<void>
    ready(): Promise<{ injections: Parameters<typeof applyIndexInjections>[0]; streamBaseUrl: string }>
  }
}
const desktop = (globalThis as DesktopBootGlobal).dshDesktopBoot
const reportFailure = (reason: unknown): void => {
  if (desktop === undefined) throw reason
  void desktop.failed(reason instanceof Error ? reason.message : String(reason)).catch(console.error)
}

try {
  const el = document.getElementById('root')
  if (el === null) throw new Error('web app: missing #root')
  const entry = new AppWebEntry(el)
  if (desktop !== undefined) {
    const gate = (globalThis as { __DSH_BOOT_READY__?: PromiseWithResolvers<void> }).__DSH_BOOT_READY__
    if (gate === undefined) throw new Error('desktop web: boot readiness is missing')
    void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
      const transport = globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
      transport.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }
      await applyIndexInjections(injections, src => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => { resolve() }
        script.onerror = () => { reject(new Error(`desktop web: failed to load ${src}`)) }
        document.head.append(script)
      }))
      gate.resolve()
    }).catch((error: unknown) => { gate.reject(error) })
  }
  void entry.run()
} catch (reason) {
  reportFailure(reason)
}
