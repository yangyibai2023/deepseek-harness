/**
 * Viewport-fit hook for **bottom-anchored** overlays: the element's bottom edge
 * is laid out independent of its height, so it grows upward and only the top
 * edge can collide with the viewport — clamp the design cap to the space
 * between that edge and the viewport top.
 *
 * @deprecated 2026-10-22：**不再有生产代码使用**，且它是「浮层溢出」那类
 * bug 的根源 —— 它把「浮层向上展开」写死成前提。浮层一旦改成向下展开，
 * 元素底边会随高度一起增长，可用空间算出来恒等于视口高，maxHeight 永远
 * 等于设计上限（实测菜单因此溢出 327px）。
 *
 * 改用 {@link placeOverlay}：它按实际方向计算可用空间，并给出 flip/shift/
 * 限高三件套。这个 hook 仅保留给「确定向上生长」的静态面板，新代码勿用。
 */
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { overlayTopMargin } from './overlay-top-margin.ts'

/**
 * Safe distance kept between the overlay and the viewport top edge (mirrors
 * the Menu portal margin); the frame's overlay inset widens it.
 */
const MARGIN = 12

/**
 * Clamp a bottom-anchored overlay's max-height to the viewport.
 * @param ref - the overlay element; a null current (overlay closed) skips measuring.
 * @param cap - design max-height in px (the clamp never exceeds it).
 * @param signal - re-measure trigger: pass the overlay's render state so anchor
 *   moves (composer growth) re-fit; resize/scroll re-fit while mounted.
 * @param margin - viewport top margin floor in px; the frame's overlay
 *   inset widens it. Callers under fixed chrome (the conversation header)
 *   raise it past their chrome's height.
 * @returns the max-height to apply inline, in px.
 */
export function useAnchoredMaxHeight(ref: RefObject<HTMLElement>, cap: number, signal: unknown, margin: number = MARGIN): number {
  const [maxHeight, setMaxHeight] = useState(cap)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const fit = () => {
      setMaxHeight(Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - overlayTopMargin(margin))))
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, true)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', fit, true)
    }
  }, [ref, cap, signal, margin])
  return maxHeight
}
