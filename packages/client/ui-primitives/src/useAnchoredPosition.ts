/**
 * Keep a fixed-position floating element anchored to a trigger.
 *
 * A portaled panel is positioned from its anchor's viewport rect, which stops
 * being true the moment anything scrolls or the window resizes. This owns that
 * one concern: measure the anchor, offset the panel below or above it, clamp
 * the result inside the viewport, and re-run on scroll (capture phase, so
 * scrollers nested inside the page are caught too), on resize, and on the
 * panel's own size changes while the element is open.
 * @module @deepseek-ai/dsh-client-ui-primitives/useAnchoredPosition
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { overlayTopMargin } from './overlay-top-margin.ts'

/** Inputs for {@link useAnchoredPosition}. */
export interface AnchoredPositionOptions {
  /** Whether the floating element is mounted and should track its anchor. */
  open: boolean
  /** The element the panel is placed from. */
  anchorRef: RefObject<HTMLElement | null>
  /** The floating element, measured so the clamp uses real dimensions. */
  panelRef: RefObject<HTMLElement | null>
  /** Which anchor edge the panel hangs from: below it (`bottom`, the default) or above it (`top`). */
  side?: 'top' | 'bottom'
  /** Which anchor edge the panel lines up with: its left edge (`start`, the default) or its right edge (`end`). */
  align?: 'start' | 'end'
  /** Distance kept between the anchor edge named by `side` and the panel. */
  gap: number
  /** Distance kept between the panel and each viewport edge; the frame's overlay inset widens the top margin. */
  margin: number
}

/**
 * Track an anchor and return the panel's fixed coordinates.
 * @param options - the open state, the two refs, the placement side and alignment, and the gap/margin distances.
 * @returns `left`/`top` for the panel, or `null` before the first measurement.
 */
export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null {
  const { open, anchorRef, panelRef, side = 'bottom', align = 'start', gap, margin } = options
  const [position, setPosition] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = () => {
      /* v8 ignore start -- geometry read from real layout: jsdom reports zero
         offset sizes, so the positive-size clamp arms are exercised by browser
         scenarios rather than unit tests. */
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const panel = panelRef.current
      const width = panel?.offsetWidth ?? 0
      const height = panel?.offsetHeight ?? 0
      const topLimit = overlayTopMargin(margin)
      const bottomLimit = window.innerHeight - margin

      /* HeightLab（2026-10-22）：真正的 flip，而不是只把位置压回视口。
       *
       * 原实现只用 clamp：面板放在触发器的 `side` 一侧，溢出就硬压回边界。
       * 触发器等在屏幕下半部时（Windows 上输入框里的模型选择器就是），
       * 压回来会让面板盖住触发器、或仍探出视口，用户看到的就是「向下弹出、
       * 溢出屏幕」。
       *
       * 这里按业界通行规则（等价 Floating UI 的 flip + shift）分两步：
       *   1) flip —— 首选侧放不下、而另一侧放得下时，翻到另一侧；
       *   2) shift —— 两侧都放不下时，保留首选侧并整体平移进视口。
       * 只在真有测量值时判定（height/width > 0），首帧量与 jsdom 都不受影响。 */
      const fitsBelow = height > 0 ? rect.bottom + gap + height <= bottomLimit : true
      const fitsAbove = height > 0 ? rect.top - gap - height >= topLimit : true
      let resolved = side
      if (side === 'bottom' && !fitsBelow && fitsAbove) resolved = 'top'
      else if (side === 'top' && !fitsAbove && fitsBelow) resolved = 'bottom'

      let left = align === 'end' ? rect.right - width : rect.left
      let top = resolved === 'top' ? rect.top - gap - height : rect.bottom + gap
      if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin)
      if (height > 0) top = Math.min(Math.max(top, topLimit), bottomLimit - height)
      /* v8 ignore stop */
      setPosition({ left, top })
    }
    // The first run measures the panel in the same commit that opened it, so
    // the clamp uses real dimensions before anything paints.
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    // The panel's own height changes without either event — a status line
    // appearing inside it, or a `resize: vertical` textarea dragged taller —
    // and a stale clamp would let a panel near the bottom edge cross the
    // margin it is supposed to respect. The guard keeps the hook usable where
    // `ResizeObserver` is absent, which is how jsdom runs.
    const panel = panelRef.current
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && panel !== null) {
      observer = new ResizeObserver(place)
      observer.observe(panel)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, panelRef, side, align, gap, margin])
  return position
}
