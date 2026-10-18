/**
 * 运行中状态的前导标记。
 *
 * 2026-10-20：原实现是 DeepSeek 的鲸鱼尾巴（APNG 遮罩 + 静态 SVG 兜底）。
 * 用户要求换成**我们自己的 logo**（`heightlab-logo.png` 的矢量描摹）。
 * 这里用 SVG 内联同一份轮廓，并让整体缓慢自转 —— 视觉上仍然是「在工作」
 * 的动效，但不含任何第三方品牌资产，也不需要额外图片。
 *
 * 可访问性沿用原口径：`prefers-reduced-motion` 下停转。
 */
import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/**
 * Render the decorative running mark.
 * @returns an inline SVG copy of the HeightLab logo with a reduced-motion fallback.
 */
export function RunningWhaleTail() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <svg className={css.runningMark} width="100%" height="100%" viewBox="0 0 100 100" fill="none">
        <path className={css.runningMarkOrbit} d={FISH_LOGO_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  )
}
