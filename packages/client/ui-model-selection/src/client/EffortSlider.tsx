/**
 * 思考强度滑块（2026-10-22 用户要求·三次校准）。
 *
 * 视觉规则（照 ZCode 截图逐档对齐）：
 *   · 轨道底层是**恒定浅灰**（未选中部分）
 *   · 轨道上层是**绿→青→蓝完整渐变**，宽度只揭示到当前档位
 *     关闭 → 全灰；低 → 一小段绿；高 → 绿到青；最高 → 整条彩带
 *   · **最高档额外加流动动效**：渐变横向平移 + 光点漂浮（用户点名要的）
 *
 * 不用 `<input type="range">`：原生做不了双色分层揭示与流动渐变，
 * 且档位离散（3~4 档）时吸附手感差。无障碍仍按标准滑块语义给。
 */
import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import clsx from 'clsx'
import css from './EffortSlider.module.css'

export interface EffortSliderOption {
  readonly key: string
  readonly label: string
}

export function EffortSlider({ options, value, levelIndex, onChange, disabled = false, ariaLabel }: {
  readonly options: readonly EffortSliderOption[]
  readonly value: string | undefined
  /** 当前档位序号（0 = 关闭/最低），驱动揭示比例与配色。 */
  readonly levelIndex: number
  readonly onChange: (key: string) => void
  readonly disabled?: boolean
  readonly ariaLabel: string
}): React.ReactNode {
  const trackRef = useRef<HTMLDivElement>(null)
  const count = options.length
  const index = Math.min(Math.max(0, levelIndex), Math.max(0, count - 1))
  const ratio = count <= 1 ? 1 : index / (count - 1)
  const current = options[index]
  /** 最高档才播放流动动效（用户只对「最高」提到流动）。 */
  const atMax = count > 1 && index === count - 1

  const pickAt = useCallback((clientX: number): void => {
    const track = trackRef.current
    if (track === null || count === 0) return
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return
    const at = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const next = count <= 1 ? 0 : Math.round(at * (count - 1))
    const option = options[next]
    if (option !== undefined && option.key !== value) onChange(option.key)
  }, [count, onChange, options, value])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pickAt(event.clientX)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    pickAt(event.clientX)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1
        : event.key === 'Home' ? -count
          : event.key === 'End' ? count
            : 0
    if (step === 0) return
    event.preventDefault()
    const next = Math.min(count - 1, Math.max(0, index + step))
    const option = options[next]
    if (option !== undefined && option.key !== value) onChange(option.key)
  }

  return (
    <div className={clsx(css.root, disabled && css.disabled)} data-hl-effort-slider="">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={index}
        aria-valuetext={current?.label}
        aria-disabled={disabled || undefined}
        className={css.track}
        data-level={index}
        data-at-max={atMax || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className={css.railBase} aria-hidden="true" />
        <div
          className={css.railFill}
          aria-hidden="true"
          style={{
            // 0~1 的揭示比例，由 CSS 的 clip-path 换算成裁切量。
            ['--hl-reveal' as string]: String(ratio),
          }}
        >
          <div className={css.railFlow} />
          {atMax && (
            <div className={css.sparkles}>
              <i /><i /><i /><i /><i />
            </div>
          )}
        </div>
        {options.map((option, at) => (
          <span
            key={option.key}
            aria-hidden="true"
            className={css.tick}
            style={{ left: tickOffset(at, count) }}
            data-passed={at <= index || undefined}
          />
        ))}
        <span className={css.thumb} style={{ left: tickOffset(index, count) }} aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * 第 N 档的水平位置（百分比）。
 *
 * 不能用 `calc(8px + 100% * ratio - 16px * ratio)` —— CSS calc 不支持
 * 百分比 × 百分比。轨道两端有 8px 内边距正好接住圆点溢出，纯百分比即可。
 */
function tickOffset(index: number, count: number): string {
  if (count <= 1) return '50%'
  return `${(index / (count - 1)) * 100}%`
}
