/** HeightLab：工作区文件夹图标换成细描边版本（1.25px，黑色跟随 currentColor）。 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 关闭状态的细描边文件夹。 */
export function IconFolderCloseStroke16({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5V11A1.5 1.5 0 0 0 4 12.5h8A1.5 1.5 0 0 0 13.5 11V6A1.5 1.5 0 0 0 12 4.5H7.8L6.7 3.1A1.5 1.5 0 0 0 5.5 2.5H4A1.5 1.5 0 0 0 2.5 4Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 打开状态的细描边文件夹。 */
export function IconFolderOpenStroke16({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 5.5v5A1.5 1.5 0 0 0 4 12h8.1a1.5 1.5 0 0 0 1.42-1.02l1.2-3.6A1.5 1.5 0 0 0 13.3 5.5H7.8L6.7 4.1A1.5 1.5 0 0 0 5.5 3.5H4A1.5 1.5 0 0 0 2.5 5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}
