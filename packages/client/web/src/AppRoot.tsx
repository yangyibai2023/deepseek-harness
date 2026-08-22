/**
 * Shell root: boot loading → 登录校验 → 登录页/主界面。
 *
 * 胶囊动画在这里只挂载一次：boot 阶段按真实进度填充，登录校验阶段保持
 * 100%，校验完成后再散开进入页面——全程一次动画，不闪两下。
 * 失败分支保持 fail-loud（不播动画，直接显示错误报告）。
 *
 * rc.8 适配：boot.ts 渲染本门；插件树全部就绪后 settled=true，登录门
 * 通过后散开胶囊并调用 mountRealUI()（boot.ts 登记的 uiRenderer 挂载面），
 * 主界面由 rc.8 的 ui-renderer 挂载，替代旧版 renderApp 直出。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KernelSignal, LoaderStatus } from './loader-status.ts'
import css from './AppRoot.module.css'
import { HeightLabAuthGate, HeightLabLoginPage } from './HeightLabAuth.tsx'
import { CapsuleLoader } from './capsule-loader.tsx'

/** Tauri 桥（withGlobalTauri）的最小类型面，仅用于就绪信号。 */
interface TauriEventBridge {
  __TAURI__?: {
    event?: {
      emit: (event: string, payload?: unknown) => Promise<unknown>
    }
  }
}

/** AppRoot props: settled signal, fiber-state projection feed, boot failure report, real-UI mount face. */
export interface AppRootProps {
  /** True once the boot chain settled (loader quiesced + all entries ACTIVE); the boot closure flips it. */
  settled: KernelSignal<boolean>
  /** Per-entry fiber-state projection store (drives loading/failed rendering). */
  status: KernelSignal<LoaderStatus>
  /** Boot failure report (the settle rejection message); undefined while loading or after success. */
  error: KernelSignal<string | undefined>
  /**
   * Mounts the real UI (boot.ts registers the uiRenderer mount face); called
   * only after the login gate approves it and the capsule burst completes.
   */
  mountRealUI: () => void
}

type StartupPhase = 'boot' | 'checking' | 'bursting' | 'done'

/** 启动时间线诊断：只写宿主日志，不打扰用户。 */
function logBoot(extra: Record<string, unknown>): void {
  try {
    void fetch('/hl/boot-marker', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hlBootTimeline: true, ...extra }),
    }).catch(() => { /* 非致命 */ })
  } catch { /* 非致命 */ }
}

/** Boot + 登录门：胶囊动画全程只有一个实例。 */
export function AppRoot(props: AppRootProps) {
  const settled = useSyncExternalStore(props.settled.subscribe, props.settled.getSnapshot)
  const status = useSyncExternalStore(props.status.subscribe, props.status.getSnapshot)
  const error = useSyncExternalStore(props.error.subscribe, props.error.getSnapshot)
  const failed = Object.entries(status).filter(([, s]) => s === 'failed')

  const [phase, setPhase] = useState<StartupPhase>('boot')
  const [target, setTarget] = useState<'signed-in' | 'signed-out' | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (settled && phase === 'boot') {
      logBoot({ at: 'settled' })
      setPhase('checking')
    }
  }, [settled, phase])

  const handleReady = useCallback((
    next: 'signed-in' | 'signed-out',
    errorMessage?: string,
  ) => {
    setTarget(next)
    setLoginError(errorMessage ?? null)
    setPhase('bursting')
    logBoot({ at: 'ready', target: next })
  }, [])

  // 页面真正渲染完成（胶囊散开结束）后通知 Tauri 壳层：可以关闭启动小框、
  // 显示主窗口；壳层收不到该信号时会按超时兜底并自动重载。
  const handleBurstComplete = useCallback(() => {
    setPhase('done')
    try {
      document.body.dataset.hlBoot = 'ready'
    } catch { /* 非致命 */ }
    logBoot({ at: 'done', target })
    try {
      ;(window as unknown as TauriEventBridge).__TAURI__?.event?.emit('hl:web-ready', {})
    } catch {
      // 非 Tauri（纯浏览器预览）忽略
    }
    if (target === 'signed-in' && settled) {
      props.mountRealUI()
    }
  }, [props, settled, target])

  // 兜底：页面只要挂载并渲染了首帧，就通知壳层关闭启动小框。
  // 即使认证门/胶囊动画因某种原因没走完，也保证主窗口能弹出来。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        ;(window as unknown as TauriEventBridge).__TAURI__?.event?.emit('hl:web-ready', {})
      } catch {
        // 非 Tauri（纯浏览器预览）忽略
      }
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  // 启动卡住探针：只要胶囊未散开，每 3s 上报一次各 loader 条目状态，
  // 供定位“已登录但插件树未就绪/失败”的具体条目（仅日志，无用户可见行为）。
  const statusRef = useRef(status)
  statusRef.current = status
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const targetRef = useRef(target)
  targetRef.current = target
  const settledRef = useRef(settled)
  settledRef.current = settled

  useEffect(() => {
    if (phase === 'done') return
    const timer = window.setInterval(() => {
      const entries = Object.entries(statusRef.current)
      const counts: Record<string, number> = {}
      const loadingIds: string[] = []
      for (const [id, s] of entries) {
        counts[s] = (counts[s] ?? 0) + 1
        if (s === 'loading' || s === 'pending') {
          loadingIds.push(id)
        }
      }
      logBoot({
        at: 'stuck-probe',
        phase: phaseRef.current,
        target: targetRef.current,
        settled: settledRef.current,
        entryCount: entries.length,
        counts,
        loadingIds: loadingIds.slice(0, 8),
      })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [phase])

  // 真实 boot 进度：entry 状态加权（active/failed=1，loading=0.5，pending=0.15）。
  const statusEntries = Object.entries(status)
  const total = statusEntries.length
  let weight = 0
  for (const [, s] of statusEntries) {
    if (s === 'active' || s === 'failed') weight += 1
    else if (s === 'loading') weight += 0.5
    else if (s === 'pending') weight += 0.15
  }
  const bootProgress = total > 0 ? Math.min(1, weight / total) : 0

  const loud = error !== undefined || failed.length > 0
  if (!settled && loud && target === null) {
    return (
      <div className={css.boot}>
        <div className={css.card}>
          <div className={css.wordmark}>HEIGHTLAB</div>
          <div className={css.failed}>
            <div className={css.failedTitle}>插件加载失败</div>
            {failed.map(([id]) => <div key={id} className={css.failedItem}>{id}</div>)}
            {error !== undefined && <div className={css.failedItem}>{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  if (phase !== 'done') {
    const progress = phase === 'boot' ? bootProgress : 1
    const burst = phase === 'bursting'
    return (
      <>
        {/* 认证门立即挂载：登录页是产品自有界面，不能等整套插件 boot
            （某个插件在无登录态时可能永不就绪，loader 无超时会卡死胶囊）。
            登录后才需要完整插件树。 */}
        <HeightLabAuthGate onReady={handleReady} />
        <CapsuleLoader
          progress={progress}
          burst={burst}
          onBurstComplete={handleBurstComplete}
        />
      </>
    )
  }

  // 散开完成后 mountRealUI() 已卸载本根并挂载真实 UI；此处仅为防御。
  if (target === 'signed-in' && settled && phase === 'done') return null
  if (target === 'signed-in' && !settled) {
    // 登录成功但插件树还没就绪：保持胶囊，就绪后自动进入主界面。
    const progress = settled ? 1 : bootProgress
    return (
      <>
        <CapsuleLoader progress={progress} burst={false} />
      </>
    )
  }
  return <HeightLabLoginPage initialError={loginError} />
}
