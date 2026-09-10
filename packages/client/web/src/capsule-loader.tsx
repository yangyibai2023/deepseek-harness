/**
 * 启动胶囊动画（shell 自足，零插件依赖）。
 *
 * 直接复用官网 CTA「胶囊」粒子点阵（`cta-capsule-data.ts`，原站
 * assets/js/cta-data.js，另一 AI 的实现），不重新制作造型：
 * 粒子从底部按真实进度填充，progress=1 且 burst 时放大散开，进入页面。
 * 背景透明（跟随应用页面），颜色用已确认的克莱因蓝 #3551C4 +
 * 高光 #679EFE。
 */
import { useEffect, useRef } from 'react'
import { CTA_CAPSULE_POINTS } from './cta-capsule-data.ts'
import css from './capsule-loader.module.css'

const BODY_COLOR = [0x35, 0x51, 0xc4]
const GLOW_COLOR = [0x67, 0x9e, 0xfe]
const MIN_PAGE_RATIO = 0.62 // 胶囊尺寸约为页面短边的 62%

interface Particle {
  x: number // 归一化 -0.5..0.5
  y: number // 归一化 -0.5..0.5（上负下正）
  r: number
  glow: boolean
  phase: number
  opacity: number
}

interface CapsuleLoaderProps {
  /** 真实进度 0..1（boot entry 加权投影） */
  progress?: number
  /** 进度已满且允许散开时置 true */
  burst?: boolean
  /** 散开动画结束后回调 */
  onBurstComplete?: () => void
}

/** 官网 CTA 点阵归一化（保持竖向胶囊比例，中心居中）。 */
function buildParticles(): Particle[] {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of CTA_CAPSULE_POINTS) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const span = Math.max(maxX - minX + 1, maxY - minY + 1)
  return CTA_CAPSULE_POINTS.map(([x, y, a], i) => ({
    x: (x - cx) / span,
    y: (y - cy) / span,
    r: 0.9 + a * 1.4,
    glow: i % 7 === 0,
    phase: ((x * 7 + y * 13) % 100) / 100,
    opacity: 0.45 + a * 0.5,
  }))
}

const PARTICLES = buildParticles()

export function CapsuleLoader({ progress = 0, burst = false, onBurstComplete }: CapsuleLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const progressRef = useRef(progress)
  const burstRef = useRef(false)
  const completeRef = useRef(false)
  const callbackRef = useRef(onBurstComplete)
  const rafRef = useRef(0)

  progressRef.current = progress
  burstRef.current = burst
  callbackRef.current = onBurstComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    let burstStartedAt = 0

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (cw === 0 || ch === 0) return
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)

      const t = now / 1000
      const targetProgress = Math.max(0, Math.min(1, progressRef.current))
      const size = Math.min(cw, ch) * MIN_PAGE_RATIO
      const cx = cw / 2
      const cy = ch / 2

      const shouldBurst = burstRef.current && !reduced
      if (shouldBurst && burstStartedAt === 0) {
        burstStartedAt = now
      }
      // 散开放慢到约 1s，让“冲入页面”更平滑（用户要求“慢慢打开散开”）。
      const burstT = burstStartedAt > 0 ? Math.min(1, (now - burstStartedAt) / 1000) : 0

      for (const p of PARTICLES) {
        if (p.y > targetProgress - 0.05) continue
        const wave = reduced ? 0 : Math.sin(t * 0.9 + p.phase * Math.PI * 2) * 0.012 * size
        let px = cx + p.x * size + wave
        let py = cy + p.y * size + Math.cos(t * 0.7 + p.phase * Math.PI * 2) * 0.012 * size
        let alpha = p.opacity
        let radius = p.r * (size / 460)
        if (burstT > 0) {
          const e = burstT * burstT * (3 - 2 * burstT)
          const dx = px - cx
          const dy = py - cy
          const dist = Math.max(1, Math.hypot(dx, dy))
          const spread = 1 + e * (1.5 + dist / (size * 0.7))
          px = cx + dx * spread
          py = cy + dy * spread
          radius = radius * (1 + e * 1.8)
          alpha *= 1 - e
        }
        const [cr, cg, cb] = p.glow ? GLOW_COLOR : BODY_COLOR
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.6, radius), 0, Math.PI * 2)
        ctx.fill()
      }

      const finished = reduced
        ? burstRef.current
        : (burstStartedAt > 0 && burstT >= 1)
      if (finished && !completeRef.current) {
        completeRef.current = true
        callbackRef.current?.()
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className={css.root}>
      <canvas ref={canvasRef} className={css.canvas} />
    </div>
  )
}
