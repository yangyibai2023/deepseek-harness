import type { IconProps } from './icons/props.ts'

/**
 * HeightLab 品牌标记（2026-10-20 用户拍板：用**我们自己的 logo**）。
 *
 * 图形不是手绘近似，而是从 `services/desktop-dsh-bridge/assets/heightlab-logo.png`
 * （400×400 官方位图）**逐像素描摹**成矢量：marching squares 取 50% 等值线 →
 * Ramer–Douglas–Peucker 简化 → 归一到 100×100 画布。四条子路径分别对应
 * 轨道环外轮廓、环的内侧开口、环的远端、以及胶囊上的高光点划线；
 * `fill-rule="evenodd"` 让开口与高光自然镂空。
 *
 * 历史：本文件原为 DeepSeek Harness 的鲸鱼剪影。ds-bot 的「添加原生会话」
 * 菜单、Agent 头像、命令面板三处都直接引用它 —— 换掉这里一次修完三处暴露。
 * 导出名保持不变，避免破坏既有调用方；`FISH_LOGO_PATH` 现在是我们的路径。
 */

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 100, height: 100 }

/**
 * 官方 logo 的矢量轮廓（描摹自 heightlab-logo.png，见文件头）。
 * 四条子路径：轨道环主体、环内开口、环远端、胶囊高光。
 */
export const FISH_LOGO_PATH = 'M71.5,15 66.4,16.6 45.9,26.1 37.3,22.8 29.7,20.8 23,20.2 18,20.8 14.8,22.2 13,24.2 12.1,27 12.4,30.5 15.6,38.5 21.6,46.7 30.1,55.1 41.2,63.7 52.6,70.5 65.4,76.1 76.6,78.6 84.4,78.4 88.3,76.8 90.7,73.4 90.4,67.2 86.4,58.8 92.6,54.2 96.9,48 99.2,40.4 98.8,33.3 97.5,29.1 95.2,24.8 92.4,21.4 88.9,18.6 84.6,16.3 80.1,14.9 71.5,15Z M21.5,23.2 17.6,24 15.3,26 15.3,30.1 16.6,34 19.6,39.3 23.8,44.8 32,52.9 37.5,57.4 52.7,67.2 68,73.8 74.8,75.4 80.5,75.8 85.2,75.1 87.3,73.6 88,71.5 87.5,67.6 83.6,60.1 62.5,69.6 56.1,67.3 47.5,62.4 43.1,55.5 39.2,46.1 37.5,38.9 38,34.6 23.6,41 21.1,38.3 21.5,23.2Z M15.2,40.7 10.2,43.7 5.6,48.2 2.3,54.3 0.9,60 0.9,64.5 2.3,70.1 5.2,75.6 9.6,80.3 13.5,82.8 18.8,84.8 27.9,85.2 32.8,83.9 55.1,73.5 50.6,71.1 31.2,80 25.8,81.2 18.2,80.3 11.7,76.6 8.5,73 6.2,68.6 5.2,64.6 5.3,59.8 6.5,55.1 9.2,50.4 12.5,47.1 17.8,44.1 16.1,41 15.2,40.7Z M66,21.8 56.2,26.3 55.8,27.7 57.2,28.2 67.1,23.6 67.5,22.3 66,21.8Z'

/**
 * Render the HeightLab logo mark.
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
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path d={FISH_LOGO_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
