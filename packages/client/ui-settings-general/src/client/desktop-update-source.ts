/** Client-owned observation of the optional Desktop preload. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopUpdateBridge, DesktopUpdatePresentation, DesktopUpdateView } from '../types.ts'
import {
  checkForUpdate, getUpdateState, installUpdate, subscribeUpdateState,
} from './heightlab-update-store.ts'

/**
 * HeightLab（2026-10-22）：Tauri 壳的更新桥。
 *
 * 为什么需要：这个包的侧边栏「更新」指示器原本只认 `window.dshDesktop.updates`
 * —— 那是 Electron 风格的预加载桥。我们的桌面端是 Tauri，根本没有这个对象，
 * 于是 `DesktopUpdateSource` 拿到的 bridge 是 `undefined`，`presentation`
 * 永远是 `idle`，指示器直接 `return null`：**左下角从来不显示更新按钮**，
 * 用户只能自己进「设置 → 关于」点检查更新才知道有新版本（用户实测反馈）。
 *
 * 这里把 Tauri 侧的 `heightlab-update-store`（与「关于」页共用同一份状态，
 * 走 invoke('hl_check_update') / invoke('hl_install_update')）适配成
 * `DesktopUpdateBridge`，两个入口看到同一进度、不会重复下载。
 */
function tauriUpdateBridge(): DesktopUpdateBridge | undefined {
  const w = window as unknown as {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: { invoke?: (...args: unknown[]) => Promise<unknown> }
  }
  if (w.__TAURI__ === undefined && w.__TAURI_INTERNALS__?.invoke === undefined) return undefined

  const map = (): DesktopUpdatePresentation | undefined => {
    const s = getUpdateState()
    const version = s.info?.version
    switch (s.phase) {
      case 'checking':
        return { phase: 'checking' }
      case 'available':
        return { phase: 'available', ...(version === undefined ? {} : { version }) }
      case 'installing':
        return {
          phase: 'downloading', percent: s.progress,
          ...(version === undefined ? {} : { version }),
          ...(s.message === null ? {} : { message: s.message }),
        }
      case 'done':
        return { phase: 'ready', ...(version === undefined ? {} : { version }) }
      case 'error':
        // 带上壳返回的具体原因（磁盘不足/网络/签名），否则用户只看到「重试更新」
        return { phase: 'error', failure: 'check', ...(s.message === null ? {} : { message: s.message }) }
      // idle / current：没有可展示的状态，指示器应隐藏。
      default:
        return undefined
    }
  }

  return {
    status: async () => map() ?? { phase: 'idle' },
    subscribe(listener) {
      return subscribeUpdateState(() => {
        /* 必须**无条件**通知：`idle` / `current`（已是最新）时 map() 返回
         * undefined，表示「没有要展示的状态」。若这时跳过通知，指示器会
         * 停在最后一次可见的 phase —— 用户实测「检查更新一直在」正是
         * checking → current 之后再也没收到事件造成的。
         * 用 idle 覆盖，指示器按 idle 隐藏。 */
        listener(map() ?? { phase: 'idle' })
      })
    },
    async open() {
      if (getUpdateState().phase === 'available') await installUpdate()
      else await checkForUpdate()
    },
  }
}

/** 自动复查间隔：30 分钟。开着 App 也能发现新版本。 */
const AUTO_CHECK_MS = 30 * 60 * 1000
/** 首次检查延迟：等宿主就绪、界面稳定后再打网络，别和启动流程抢资源。 */
const FIRST_CHECK_DELAY_MS = 8000

/** Owns one preload subscription across both sidebar locations. */
export class DesktopUpdateSource {
  /** Framework-observed carrier status shared by both sidebar controls. */
  readonly store = createSnapshotStore<DesktopUpdateView>({ failed: false, opening: false })
  private live = true
  private received = false
  private readonly carrier: DesktopUpdateBridge | undefined
  private readonly unsubscribe: (() => void) | undefined
  private readonly autoCheckTimer: number | undefined
  private autoCheckInterval: number | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(bridge: DesktopUpdateBridge | undefined) {
    // 没有 Electron 桥时退到 Tauri 桥（网页预览两者都没有 → 保持原样不显示）。
    this.carrier = bridge ?? tauriUpdateBridge()
    const carrier = this.carrier
    this.unsubscribe = carrier?.subscribe((presentation) => {
      if (!this.live) return
      this.received = true
      this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    })
    void carrier?.status().then((presentation) => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), presentation })
    }, () => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
    /* 自动检查（2026-10-22）：只在走了 Tauri 桥时做。且只在状态还是
     * idle/current 时补检查，不覆盖「关于」页里正在进行的检查或下载。 */
    if (bridge === undefined && carrier !== undefined) {
      const tick = (): void => {
        if (!this.live) return
        const phase = getUpdateState().phase
        if (phase === 'idle' || phase === 'current') void checkForUpdate()
      }
      this.autoCheckTimer = window.setTimeout(() => {
        tick()
        this.autoCheckInterval = window.setInterval(tick, AUTO_CHECK_MS)
      }, FIRST_CHECK_DELAY_MS)
    }
  }

  /** Invoke one user action; subsequent clicks join the shell-owned operation. */
  open(): void {
    if (!this.live || this.carrier === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    this.store.set({ ...state, opening: true })
    void this.carrier.open().catch(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /** Detach the carrier and ignore any pending status or action completion. */
  dispose(): void {
    this.live = false
    this.unsubscribe?.()
    if (this.autoCheckTimer !== undefined) window.clearTimeout(this.autoCheckTimer)
    if (this.autoCheckInterval !== undefined) window.clearInterval(this.autoCheckInterval)
  }
}
