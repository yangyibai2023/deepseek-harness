/** Composer context-occupancy meter: a ring beside the send button fed by the
 * `contextPressure` projection, with a click-open panel of the heuristic
 * `contextBreakdown` composition (system prompt, tools, conversation).
 * HeightLab：面板同时收编 DSH 全部原生会话指标（轮次/步骤/耗时/首 token/
 * 吞吐/缓存命中/输入输出 token）—— 稳定线 0.3.30 的 ContextMeter 同款口径，
 * 输入框下方不再单独展示（0.3.17 起的产品设定）。
 * Renders nothing until a provider reports both pressure and a route
 * capacity. */

import { useEffect, useRef, useState } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the `contextPressure` / `contextBreakdown` projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: merges the sessionStats key into SessionProjectionMap for useProjection.
// session-stats 的投影键类型未并入本包（无依赖链接），键以受控断言使用，见 stats 处。
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposerBarProps } from '../contract/slots.ts'
import { contextOccupancy } from '../context-occupancy.ts'
import css from './ContextMeter.module.css'

/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = '\u0000'

/** Panel legend rows, in bar-segment order; each color class carries the shared swatch/segment tint. */
const ROWS = [
  { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
  { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
  { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
] as const

/**
 * Format a token count for the compact context panel.
 * @param value - token count.
 * @param t - Conversation locale seat with shared compact-number templates.
 * @returns Compact localized count using K or M when needed.
 */
function formatTokens(value: number, t: ComposerBarProps['t']): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('number.thousand', { value: scaled(value / 1_000) })
  return t('number.million', { value: scaled(value / 1_000_000) })
}

export interface ContextMeterProps {
  useProjection: UseProjection
  /** The owning bar's locale seat, passed down as a plain prop. */
  t: ComposerBarProps['t']
}

/** Duration like `1.2s` / `3m21s` (stable-line formatDuration). */
function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1_000
  if (totalSeconds < 60) {
    const rounded = Math.round(totalSeconds * 10) / 10
    return `${rounded}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - minutes * 60)
  return `${minutes}m${seconds}s`
}

/** Throughput like `118 tok/s` (stable-line formatTokensPerSecond). */
function formatTps(tokensPerSecond: number): string {
  const rounded = tokensPerSecond >= 100
    ? String(Math.round(tokensPerSecond))
    : String(Math.round(tokensPerSecond * 10) / 10)
  return `${rounded} tok/s`
}

/** Billed input = uncached input + cache reads + cache writes. */
function billedInputTokens(usage: {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Cache-hit percent with the stable-line precision ladder: integer first, and
 * extra decimal digits only while the value would otherwise round to 100. */
function cacheHitPercent(usage: {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): string | null {
  const denominator = billedInputTokens(usage)
  if (denominator === 0) return null
  const missedInputTokens = usage.uncachedInputTokens + usage.cacheWriteTokens
  if (missedInputTokens === 0) return '100'
  const exact = usage.cacheReadTokens / denominator * 100
  const integer = Math.floor(exact)
  if (integer < 100) return String(integer)
  let scale = 10
  while (scale < 100_000) {
    const value = Math.floor(exact * scale) / scale
    if (value < 100) return value.toFixed(String(scale).length - 1)
    scale *= 10
  }
  return '99.999'
}

export function ContextMeter({ useProjection, t }: ContextMeterProps) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  // HeightLab 2026-09-15：圆环面板收编 DSH **全部**原生指标（与 0.3.30 稳定线
  // ContextMeter 同口径）：会话统计（轮次/步骤/LLM 与工具耗时/首 token 延迟/
  // 吞吐）+ token 账目（缓存命中/输入输出）。输入框下方不再展示这些
  // （0.3.17 起的产品设定），它们的唯一显示通道就是这里。
  const usage = useProjection('tokenUsage')
  // 会话统计（轮次/步骤/耗时/首 token/吞吐）来自宿主侧 sessionStats 投影。
  // 该投影的键类型未并入本包（ui-conversation 未依赖 dsh-session-stats），
  // 受控断言取数；缺数据时统计区整体不渲染，与稳定线口径一致。
  interface SessionStatsLike {
    turns: number
    steps: number
    llmMs: number
    toolMs: number
    ttftMs: number
    ttftSteps: number
    decodeMs: number
    decodeTokens: number
  }
  const stats = useProjection('sessionStats' as never) as SessionStatsLike | undefined
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const context = contextOccupancy(pressure)
  const available = context !== null

  // A model switch can temporarily remove capacity while this component stays
  // mounted. Close the now-unavailable panel instead of preserving stale UI.
  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  // Outside click / Escape close, one document listener while open (Menu's pattern).
  useEffect(() => {
    if (!open || !available) return
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [available, open])

  if (context === null) return null
  const percent = context.percent
  const reading = `${percent}%`
  const [headBefore = '', headAfter = ''] = t('context.aria', { percent: READING_SLOT })
    .split(READING_SLOT)
    .map(part => part.trim())

  // The bar's overall length stays the provider-exact percent; the heuristic
  // breakdown only proportions its colored parts. A zero-width part is dropped
  // instead of rendered: `.segment`'s min-width keeps a hairline part visible,
  // which at 0% occupancy would draw a filled bar over an empty context.
  const breakdownTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const parts = breakdown === undefined || breakdownTotal === 0
    ? [{ key: 'total', color: undefined, width: percent }]
    : ROWS.map(row => ({ key: row.key, color: row.color, width: percent * breakdown[row.key] / breakdownTotal }))
  const segments = parts.filter(part => part.width > 0)

  // Secondary session stats: same ledger the stable-line StatsLine fed —
  // counts, wall times, latency/throughput, then the token bill.
  const groups: string[] = []
  if (stats !== undefined && stats.steps > 0) {
    groups.push(t('stats.counts', { turns: stats.turns, steps: stats.steps }))
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(t('stats.llm', { duration: formatDuration(stats.llmMs) }))
    if (stats.toolMs > 0) durations.push(t('stats.toolCall', { duration: formatDuration(stats.toolMs) }))
    if (durations.length > 0) groups.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) {
      speeds.push(t('stats.ttftAverage', { duration: formatDuration(stats.ttftMs / stats.ttftSteps) }))
    }
    if (stats.decodeMs > 0) {
      speeds.push(t('stats.tokensPerSecond', {
        throughput: formatTps(stats.decodeTokens / (stats.decodeMs / 1_000)),
      }))
    }
    if (speeds.length > 0) groups.push(speeds.join(' · '))
  }
  if (usage !== undefined
    && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const cacheHit = cacheHitPercent(usage)
    if (cacheHit !== null) groups.push(t('stats.cacheHit', { percent: cacheHit }))
    groups.push(t('stats.tokens', {
      input: formatTokens(billedInputTokens(usage), t),
      output: formatTokens(usage.outputTokens, t),
    }))
  }

  return (
    <span ref={rootRef} className={css.root}>
      <Tooltip label={t('context.aria', { percent: reading })} side="top" delayMs={200} disabled={open}>
        <button
          type="button"
          className={css.trigger}
          aria-label={t('context.aria', { percent: reading })}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
            <circle className={css.track} cx="7" cy="7" r={RADIUS} />
            <circle
              className={css.fill}
              cx="7"
              cy="7"
              r={RADIUS}
              strokeDasharray={`${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`}
              transform="rotate(-90 7 7)"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className={css.panel} role="dialog" aria-label={t('context.used')}>
          <div className={css.header}>
            {/* Empty sides collapse through `.headline:empty` so the locale that
                needs no leading (or trailing) text spends no header gap. */}
            <span className={css.headline}>{headBefore}</span>
            <span className={css.percent}>{reading}</span>
            <span className={css.headline}>{headAfter}</span>
            {/* `~`: usedTokens prefers projectedTokens, whose surface delta is
                heuristically repriced on top of the provider-anchored sample. */}
            <span className={css.figures}>
              {`~${formatTokens(context.usedTokens, t)} / ${formatTokens(context.contextWindow, t)}`}
            </span>
          </div>
          <div className={css.bar}>
            {segments.map(segment => (
              <div
                key={segment.key}
                className={segment.color === undefined ? css.segment : `${css.segment} ${segment.color}`}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </div>
          {breakdown !== undefined && (
            <dl className={css.rows}>
              {ROWS.map(row => (
                <div key={row.key} className={css.row}>
                  <dt>
                    <span className={`${css.swatch} ${row.color}`} aria-hidden />
                    {t(row.label)}
                  </dt>
                  <dd>{`~${formatTokens(breakdown[row.key], t)}`}</dd>
                </div>
              ))}
            </dl>
          )}
          {groups.length > 0 && (
            <>
              <div className={css.statsDivider} aria-hidden />
              <div className={css.statsTitle}>会话统计</div>
              <div className={css.statsRows}>
                {groups.map(group => (
                  <div key={group} className={css.statsRow}>
                    <span className={css.statsDot} aria-hidden />
                    <span>{group}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  )
}
