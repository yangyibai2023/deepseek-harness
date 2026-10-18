import type { IconProps } from './icons/props.ts'

/**
 * HeightLab 品牌标记（2026-10-20 用户拍板：替换 DSH 鲸鱼图标）。
 *
 * 造型 = 我们的产品 logo：一枚胶囊（capsule）穿过一道倾斜的轨道环。
 * 只用两个图元画（椭圆描边 + 圆角矩形），16px 下仍能认出轮廓；描边与填充
 * 都走 `currentColor`，深浅主题、按钮底色上都自适应。
 *
 * 历史：本文件原为 DeepSeek Harness 的鲸鱼剪影。ds-bot 的「添加原生会话」
 * 菜单、Agent 头像、命令面板三处都直接引用它 —— 换掉这里一次修完三处暴露。
 * 导出名与 viewBox 语义保持不变，避免破坏既有调用方。
 */

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 24, height: 24 }

/** 胶囊本体：24×24 画布内、**未旋转**的圆角矩形轮廓（组件里统一转 -30°）。 */
export const FISH_LOGO_PATH = 'M9.8 8.2h4.4a3.8 3.8 0 0 1 0 7.6H9.8a3.8 3.8 0 0 1 0-7.6Z'

/**
 * Render the HeightLab mark.
 * @param props.size - width in px (default 24; the mark is square).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g transform="rotate(-30 12 12)">
        <ellipse cx="12" cy="12" rx="10.8" ry="5.2" stroke="currentColor" strokeWidth="1.6" />
        <path d={FISH_LOGO_PATH} fill="currentColor" />
      </g>
    </svg>
  )
}
