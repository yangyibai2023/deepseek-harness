/** HeightLab：设置导航专用细描边图标（1.25px，与其它描边图标同风格）。 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 声音与形象：麦克风。 */
export function IconVoiceOutline16({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6.5" y="2.25" width="3" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4.5 8.5a3.5 3.5 0 0 0 7 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M8 12v2.25M5.75 14.25h4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

/** 形象与声音：人物 + 声波（与账户的纯人形图标区分）。 */
export function IconPersonVoiceOutline16({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.25" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.75 13.25c.5-2.25 2-3.25 3.5-3.25s3 1 3.5 3.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M10.75 5.25a2.5 2.5 0 0 1 0 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M12.25 3.75a5 5 0 0 1 0 6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

/** 关于：圆圈 + i。 */
export function IconInfoOutline16({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 7.25v3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M8 5.25h.01" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
