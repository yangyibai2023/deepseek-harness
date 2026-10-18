/**
 * 运行中状态的前导标记。
 *
 * 2026-10-20：原实现是 DeepSeek 的鲸鱼尾巴（一张 APNG 遮罩 + 静态 SVG 兜底）。
 * 用户要求「项目里全部图标排查，暴露的换成胶囊或 SVG」。这里改成我们的品牌
 * 标记（胶囊穿过轨道环）的 SVG 版本，并让轨道环缓慢自转——视觉上仍然是
 * 「在工作」的动效，但不再出现任何第三方品牌资产。
 *
 * 可访问性沿用原口径：`prefers-reduced-motion` 下停转。
 */
import css from './ChatView.module.css'

/**
 * Render the decorative running mark.
 * @returns an inline SVG capsule-orbit mark with a reduced-motion fallback.
 */
export function RunningWhaleTail() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <svg className={css.runningMark} width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <ellipse
          className={css.runningMarkOrbit}
          cx="12"
          cy="12"
          rx="10.8"
          ry="5.2"
          stroke="currentColor"
          strokeWidth="1.7"
          transform="rotate(-30 12 12)"
        />
        <rect
          x="9.6"
          y="8"
          width="4.8"
          height="8"
          rx="2.4"
          fill="currentColor"
          transform="rotate(-30 12 12)"
        />
      </svg>
    </span>
  )
}
