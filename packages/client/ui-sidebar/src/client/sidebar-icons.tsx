/** HeightLab：左侧边栏顶部按钮统一为右侧边栏同款描边图标（1.35px 描边（与 rc.2 原生 Outline 图标视觉一致））。 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 面板-左（折叠/展开左侧边栏），与右侧边栏的 panel-right 成对。 */
export function IconPanelLeftStroke16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.35" />
      <rect x="2.75" y="3.25" width="2.75" height="9.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 新建对话：描边圆角框 + 加号。 */
export function IconNewChatStroke16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8 5.25v5.5M5.25 8h5.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

/** 创意灵感：灯泡（灵感点亮），简约描边风格。 */
export function IconInspirationStroke16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 1.8a4.2 4.2 0 0 0-2.45 7.63c.5.4.82.93.94 1.67h3.02c.12-.74.44-1.27.94-1.67A4.2 4.2 0 0 0 8 1.8Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M6.6 13.1h2.8M7.2 14.9h1.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

/** 自动化：循环箭头（自动执行/定时任务）。 */
export function IconAutomationStroke16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12.7 5.6A4.9 4.9 0 1 0 13 9.4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M13.6 2.4v3.2h-3.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 资料库：数据库/档案库（素材 + 知识两类资源的统一入口）。 */
export function IconLibraryStroke16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="8" cy="3.7" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M2.5 3.7v8.6c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V3.7" stroke="currentColor" strokeWidth="1.35" />
      <path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}
