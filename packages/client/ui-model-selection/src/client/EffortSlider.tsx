/**
 * 思考强度滑块（2026-10-22 用户要求「照 ZCode 那个彩色渐变滑块做」）。
 *
 * 为什么不用 `<input type="range">`：
 *   · 原生滑块的轨道无法做「绿→青→蓝」三色渐变（除了 Firefox 的私有伪元素）；
 *   · 档位是离散的（3~4 档），原生会把小块数挤成一团、吸附手感差；
 *   · 我们要的视觉是「整条轨道是渐变，圆点浮在上面」。
 *
 * 无障碍仍然是滑块语义：`role="slider"` + aria-valuemin/max/now/text + 方向键。
 * 这样键盘用户和我自己的测试都能按标准角色找到它。
 */
import { useCallback, useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import clsx from 'clsx'
import css from './EffortSlider.module.css'

export interface EffortSliderOption {
  /** 稳定 key（用于 aria 与选中比对）。 */
  readonly key: string
  /** 显示名（Off / High / Max…）。 */
  readonly label: string
}

export function EffortSlider({ options, value, onChange, disabled = false, ariaLabel }: {
  readonly options: readonly EffortSliderOption[]
  /** 当前选中的 key；不在 options 里时不显示圆点位置（保持最左）。 */
  readonly value: string | undefined
  readonly onChange: (key: string) => void
  readonly disabled?: boolean
  readonly ariaLabel: string
}): React.ReactNode {
  const trackRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const count = options.length
  const index = Math.max(0, options.findIndex(option => option.key === value))
  const current = options[index]

  /** 指针位置 → 最近的档位（拖动与点击轨道共用）。 */
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
    // 捕获指针：拖出轨道仍继续跟手，直到松手。
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
        aria-labelledby={ariaLabel === undefined ? labelId : undefined}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={index}
        aria-valuetext={current?.label}
        aria-disabled={disabled || undefined}
        className={css.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* 渐变轨道本身（圆点浮在它上面） */}
        <div className={css.rail} aria-hidden="true" />
        {/* 档位站点：视觉锚点，也让「有 3 档还是 4 档」一眼可见 */}
        {options.map((option, at) => (
          <span
            key={option.key}
            aria-hidden="true"
            className={css.tick}
            style={{ left: tickOffset(at, count) }}
            data-active={option.key === value || undefined}
          />
        ))}
        {/* 圆点：位置跟随档位 */}
        <span aria-hidden="true" className={css.thumb} style={{ left: tickOffset(index, count) }} />
      </div>
    </div>
  )
}

/**
 * 第 N 档在轨道上的位置。
 *
 * 不能用 `calc(8px + 50% * ...)`：CSS calc 不支持「百分比 × 百分比」这种
 * 二次运算。改用两个约束叠出目标位置 ——
 *   `left: calc(8px + (100% - 16px) * ratio)`
 * 展开成 `calc(8px + 100% * ratio - 16px * ratio)` 也不合法。
 * 最稳的写法是纯百分比，让首尾档的圆点各溢出 8px 到轨道外 ——
 * 轨道两端本来就有 8px 内边距（`.rail { inset: 0 8px }`），正好接住。
 */
function tickOffset(index: number, count: number): string {
  if (count <= 1) return '50%'
  return `${(index / (count - 1)) * 100}%`
}
