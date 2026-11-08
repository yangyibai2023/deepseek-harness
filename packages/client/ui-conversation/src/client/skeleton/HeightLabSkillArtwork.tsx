/**
 * 技能卡渐变图标（2026-11-09，用户拍板「技能页 UI 必须和场景创作/资产空间统一」）。
 *
 * 与 HeightLabHubPage 的 ArtFlame/ArtBag 系列 **同一套语言**：固定调色板
 * 线性渐变、36×36 viewBox、useId 生成唯一渐变 id（同卡重复渲染不串色）。
 * 这里按技能类别挑款式，未知技能走默认款。
 */
import { useId } from 'react'
import type { ReactNode } from 'react'

const useArtworkId = (): string => `hl_skill_art_${useId().replaceAll(':', '')}`
const artSvg = { viewBox: '0 0 36 36', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } as const

/** 视频/导演类：火焰（橙→玫红）。 */
const ArtFlame = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M18 5.5c4.4 5.5 8.6 8.8 8.6 15a8.6 8.6 0 1 1-17.2 0c0-3.3 1.7-5.5 3.3-7.7 1.1 3.3 2.2 4.4 3.8 5C16 13.8 16.5 9.5 18 5.5Z" fill={`url(#${uid}a)`} />
      <path d="M18 27.5a4.4 4.4 0 0 0 4.4-4.4c0-2.2-1.6-3.8-4.4-6.6-2.8 2.8-4.4 4.4-4.4 6.6a4.4 4.4 0 0 0 4.4 4.4Z" fill="#FFD9A0" fillOpacity="0.9" />
      <defs>
        <linearGradient id={`${uid}a`} x1="26.6" y1="5.5" x2="11.8" y2="28.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB020" />
          <stop offset="0.55" stopColor="#FF6B4A" />
          <stop offset="1" stopColor="#E23AA0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 文案/策略类：书页（紫→蓝）。 */
const ArtBook = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M6.5 9h9c1.6 0 2.5.9 2.5 2.4V29c0-2-1.1-3-3-3H6.5V9Z" fill={`url(#${uid}a)`} fillOpacity="0.9" />
      <path d="M29.5 9h-9C18.9 9 18 9.9 18 11.4V29c0-2 1.1-3 3-3h8.5V9Z" fill={`url(#${uid}b)`} fillOpacity="0.9" />
      <defs>
        <linearGradient id={`${uid}a`} x1="12" y1="9" x2="12" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A797FC" />
          <stop offset="1" stopColor="#5B6CF0" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="24" y1="9" x2="24" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69B9FF" />
          <stop offset="1" stopColor="#324DE2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 图片/视觉类：调色板（绿→青）。 */
const ArtPalette = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M18 5.5c7 0 12.5 5.3 12.5 11.9 0 4.3-3.3 6.5-6.6 6.5h-2.6c-1.8 0-3 1.3-3 3 0 .9.4 1.6.9 2.3.4.6.7 1.2.7 2 0 1.3-1 2.3-2.3 2.3C10.2 33.5 5.5 27.5 5.5 20 5.5 12.3 11 5.5 18 5.5Z" fill={`url(#${uid}a)`} />
      <circle cx="12.5" cy="14" r="2.4" fill="#fff" fillOpacity="0.85" />
      <circle cx="20" cy="10.8" r="2.4" fill="#fff" fillOpacity="0.7" />
      <circle cx="26" cy="15.5" r="2.4" fill="#fff" fillOpacity="0.55" />
      <defs>
        <linearGradient id={`${uid}a`} x1="28" y1="6" x2="9" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45E7A4" />
          <stop offset="1" stopColor="#05909D" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 研究/分析类：放大镜（蓝→紫）。 */
const ArtSearch = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <circle cx="16" cy="16" r="8.6" stroke={`url(#${uid}a)`} strokeWidth="3.4" />
      <path d="M22.4 22.4 29 29" stroke="#5B6CF0" strokeWidth="3.4" strokeLinecap="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="24.6" y1="7.4" x2="7.4" y2="24.6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69B9FF" />
          <stop offset="1" stopColor="#A797FC" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 增长/投放类：上升箭头（青→绿）。 */
const ArtGrowth = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M7 26.5 14 19l5 4.5L29 11" stroke={`url(#${uid}a)`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 11H29v6.5" stroke="#05909D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id={`${uid}a`} x1="29" y1="11" x2="7" y2="26.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45E7A4" />
          <stop offset="1" stopColor="#2BA3E8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** 默认款：四叶循环（与插件页 Agent 循环同语义）。 */
const ArtLoop = (): ReactNode => {
  const uid = useArtworkId()
  return (
    <svg {...artSvg} width={36} height={36} aria-hidden="true">
      <path d="M18.05 28.49C12.09 28.49 7.25 23.66 7.25 17.69c5.96 0 10.8 4.84 10.8 10.8Z" fill="#A797FC" />
      <path d="M18.05 6.9C12.09 6.9 7.25 11.73 7.25 17.69c5.96 0 10.8-4.83 10.8-10.79Z" fill={`url(#${uid}a)`} />
      <path d="M18.05 28.49c5.96 0 10.8-4.83 10.8-10.8-5.97 0-10.8 4.84-10.8 10.8Z" fill="#4561EE" />
      <path d="M18.05 6.9c5.96 0 10.8 4.83 10.8 10.79-5.97 0-10.8-4.83-10.8-10.79Z" fill="#658EFF" />
      <defs>
        <linearGradient id={`${uid}a`} x1="16.79" y1="16.17" x2="8.98" y2="8.74" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A23AE7" />
          <stop offset="1" stopColor="#E2E2E2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* 按技能名/描述挑款式。名字来自官方 13 个 + 用户自建，未知一律走默认款。 */
export function skillArtwork(name: string, description = ''): ReactNode {
  const key = `${name} ${description}`.toLowerCase()
  if (/video|prompt-director|replication|ugc|sd2|motion|视频/.test(key)) return <ArtFlame />
  if (/image|ecommerce|visual|design|图片|图匠/.test(key)) return <ArtPalette />
  if (/research|insight|customer|analyz|研究|洞察/.test(key)) return <ArtSearch />
  if (/meta|optimiz|growth|ads|投放|增长/.test(key)) return <ArtGrowth />
  if (/brand|copy|strategy|seo|文案|策略|口径/.test(key)) return <ArtBook />
  return <ArtLoop />
}

/** 卡内图标容器：与场景创作/资产空间卡同款 44px 描边圆角方框。 */
export const skillArtStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px solid var(--dsw-alias-border-l2, #e8e8e8)',
  background: 'var(--dsw-alias-bg-base, #fff)',
}
