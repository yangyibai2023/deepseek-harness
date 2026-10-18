/** Composer context-occupancy meter: a ring and percentage below the card fed by the
 * `contextPressure` projection, with a click-open panel of the heuristic
 * `contextBreakdown` composition (system prompt, tools, conversation).
 * Renders nothing until a provider reports both pressure and a route
 * capacity. */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the `contextPressure` / `contextBreakdown` projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { Tooltip, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
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

/** HeightLab：积分余额采样间隔（与 QuotaNotice 同频，5 分钟）。 */
const BALANCE_POLL_MS = 5 * 60 * 1000

/** HeightLab：余额紧凑格式（1.14 亿 / 18.6 万），大数字不撑破弹层。 */
function formatCredits(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2).replace(/\.?0+$/, '')} 亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, '')} 万`
  return String(Math.round(value))
}

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

/** Throughput number only — the locale template already appends `tok/s`. */
function formatTps(tokensPerSecond: number): string {
  return tokensPerSecond >= 100
    ? String(Math.round(tokensPerSecond))
    : String(Math.round(tokensPerSecond * 10) / 10)
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

/** HeightLab：宿主 sessionStats 投影的形状（键类型未并入本包）。 */
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

export interface ContextMeterProps {
  useProjection: UseProjection
  /** The owning bar's locale seat, passed down as a plain prop. */
  t: ComposerBarProps['t']
}

export function ContextMeter({ useProjection, t }: ContextMeterProps) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  // HeightLab（0.4.1 定制回植，2026-10-17）：全部 hooks 必须在任何条件 return
  // 之前调用（React hooks 规则）——stats/usage 提前到这里。
  const stats = useProjection('sessionStats' as never) as SessionStatsLike | undefined
  const usage = useProjection('tokenUsage')
  const [open, setOpen] = useState(false)
  // HeightLab（2026-10-17 用户拍板）：积分余额收编进圆环弹层（ZCode 同款把
  // 余额放进圆环的形态）。数据源与 QuotaNotice 同源（/hl/balance），挂载 +
  // 每 5 分钟刷新；拉不到就不显示余额行，不干扰对话。
  const [balance, setBalance] = useState<{ balance: number; cny: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const context = contextOccupancy(pressure)
  // HeightLab（2026-10-17 用户拍板）：圆环常显（ZCode 同款）——新会话还没有
  // token 计量数据时渲染 0% 空环，不再整体隐藏；弹层恒可用（内含积分余额）。
  const shown = context ?? { percent: 0, usedTokens: 0, contextWindow: 0 }
  const position = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    gap: 8,
    margin: 12,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      fetch('/hl/balance', { cache: 'no-store' })
        .then(r => r.json())
        .then((data: { ok?: boolean; balance?: number; creditsPerCny?: number }) => {
          if (!alive) return
          if (!data?.ok || typeof data.balance !== 'number') {
            setBalance(null)
            return
          }
          const cny = typeof data.creditsPerCny === 'number' && data.creditsPerCny > 0
            ? data.balance / data.creditsPerCny
            : data.balance
          setBalance({ balance: data.balance, cny })
        })
        .catch(() => { /* 拉不到余额就保持上一态，不打断对话 */ })
    }
    refresh()
    const timer = window.setInterval(refresh, BALANCE_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])
  // HeightLab（0.4.1 定制回植，2026-10-17）：圆环面板收编 DSH 全部原生指标
  // （与 0.3.30 稳定线同口径）——会话统计（轮次/步骤/LLM 与工具耗时/首 token
  // 延迟/吞吐）+ token 账目（缓存命中/输入输出）。输入框下方不再展示这些
  // （0.3.17 起的产品设定），唯一显示通道就是这里。sessionStats 投影的键类型
  // 未并入本包（ui-conversation 未依赖 dsh-session-stats），受控断言取数；
  // 缺数据时统计区整体不渲染。
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
  const percent = shown.percent
  // 新会话尚无计量：显示空环 + 「—」，不谎报 0%。
  const reading = context === null ? '—' : `${percent}%`
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

  return (
    <span ref={rootRef} className={css.root}>
      <Tooltip label={context === null ? '上下文与积分余额' : t('context.aria', { percent: reading })} side="top" delayMs={200} disabled={open}>
        <button
          type="button"
          className={css.trigger}
          aria-label={context === null ? '上下文与积分余额' : t('context.aria', { percent: reading })}
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
          <span>{reading}</span>
        </button>
      </Tooltip>
      {open && createPortal(
        <div
          ref={panelRef}
          className={css.panel}
          style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
          role="dialog"
          aria-label={t('context.used')}
        >
          {/* HeightLab（2026-10-17 用户拍板）：积分余额收编进圆环弹层，
              与 ZCode 圆环承载账户信息同形态。两行布局：标题/充值一行，
              金额独占一行，避免 264px 弹层里被截断。 */}
          <div className={css.balanceRow}>
            <div className={css.balanceHead}>
              <span className={css.balanceLabel}>积分余额</span>
              <button
                type="button"
                className={css.recharge}
                onClick={() => {
                  setOpen(false)
                  window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
                }}
              >
                充值
              </button>
            </div>
            <div className={css.balanceValue}>
              {balance === null
                ? '—'
                : <>
                  <strong>{formatCredits(balance.balance)}</strong>
                  {' 积分'}
                  <span className={css.balanceCny}>{` ≈ ¥${balance.cny.toFixed(2)}`}</span>
                </>}
            </div>
          </div>
          <div className={css.statsDivider} aria-hidden />
          {context === null
            ? <div className={css.emptyHint}>首次对话后显示上下文占用与会话统计</div>
            : <>
              <div className={css.header}>
                {/* Empty sides collapse through `.headline:empty` so the locale that
                      needs no leading (or trailing) text spends no header gap. */}
                <span className={css.headline}>{headBefore}</span>
                <span className={css.percent}>{reading}</span>
                <span className={css.headline}>{headAfter}</span>
                {/* `~`: usedTokens prefers projectedTokens, whose surface delta is
                      heuristically repriced on top of the provider-anchored sample. */}
                <span className={css.figures}>
                  {`~${formatTokens(shown.usedTokens, t)} / ${formatTokens(shown.contextWindow, t)}`}
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
            </>}
          {/* HeightLab（0.4.1 定制回植）：会话统计区（轮次/步骤/耗时/吞吐+token 账单）。 */}
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
        </div>,
        document.body,
      )}
    </span>
  )
}
