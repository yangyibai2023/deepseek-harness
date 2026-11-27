/**
 * O131（2026-11-27，用户拍板）：主页分类按钮条 + 类目模板大卡区。
 *
 * 结构（用户定稿）：
 *   轮播标题（跑完固定「HeightLab 高能实验室」）
 *   [全能创作|文案编写|图片生成|视频创作|账号运营|营销策略]  ← HeroCategoryBar
 *   （小灰条样式，参考用户截图①的横条卡形式，内容为我们自己的六类）
 *   输入框
 *   HeroCategoryCards ← 点按钮后展开该类目的大卡片横排
 *   （参考用户截图②「你想做什么？」大卡样式：缩略图+图标+名称+一句话；
 *    封面用我们自己的模板封面，不搬第三方素材）
 *
 * 类目→目录映射（VIDEO_CATALOG.category）：
 *   全能创作=全目录混排精选；文案编写=文案与SEO+品牌与人群；
 *   图片生成=电商图片创作+商品详情页；视频创作=UGC广告+视频创意模板；
 *   营销策略=创意洞察+广告投放；账号运营=占位（内容后续由用户补）。
 * 点击卡片=打开模板工作台（与场景创作整卡同款 hl:open-template-console）。
 */
import type { CSSProperties, ReactNode } from 'react'
import { useMemo } from 'react'
import { VIDEO_CATALOG } from './HeightLabVideoCatalog.ts'

export type HeroCategory = 'all' | 'copy' | 'image' | 'video' | 'ops' | 'marketing'

/* 2026-11-27（用户反馈「按钮太丑，要场景创作那种彩色 logo」）：六个渐变
 * SVG 图标，与 HeightLabHubPage 的 Art* 组件同款规范（36×36、linearGradient）。 */
const artSvg = { fill: 'none', viewBox: '0 0 36 36' } as const

const ArtAll = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <path d="M18 5l2.6 7.4L28 15l-7.4 2.6L18 25l-2.6-7.4L8 15l7.4-2.6L18 5Z" fill="url(#hlc-a)" />
    <circle cx="27" cy="26" r="3" fill="#FFC24A" />
    <defs><linearGradient id="hlc-a" x1="8" y1="5" x2="28" y2="25" gradientUnits="userSpaceOnUse">
      <stop stopColor="#A797FC" /><stop offset="1" stopColor="#E23AA0" />
    </linearGradient></defs>
  </svg>
)
const ArtCopy = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <rect x="7" y="5" width="22" height="26" rx="3" stroke="url(#hlc-c)" strokeWidth="2.6" />
    <path d="M12 12h12M12 17h12M12 22h8" stroke="#658EFF" strokeWidth="2.4" strokeLinecap="round" />
    <defs><linearGradient id="hlc-c" x1="7" y1="5" x2="29" y2="31" gradientUnits="userSpaceOnUse">
      <stop stopColor="#45C8E7" /><stop offset="1" stopColor="#3A5AE2" />
    </linearGradient></defs>
  </svg>
)
const ArtImage = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <rect x="5" y="8" width="26" height="20" rx="3" stroke="url(#hlc-i)" strokeWidth="2.6" />
    <circle cx="13" cy="15" r="2.6" fill="#FFC24A" />
    <path d="m9 24 6-5 5 4 4-3.5 6 5" stroke="#41E1AC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <defs><linearGradient id="hlc-i" x1="5" y1="8" x2="31" y2="28" gradientUnits="userSpaceOnUse">
      <stop stopColor="#41E1AC" /><stop offset="1" stopColor="#658EFF" />
    </linearGradient></defs>
  </svg>
)
const ArtVideo = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <rect x="5" y="8" width="26" height="20" rx="4" fill="url(#hlc-v)" fillOpacity="0.92" />
    <path d="m15 13.5 8 4.5-8 4.5v-9Z" fill="#FFFFFF" />
    <defs><linearGradient id="hlc-v" x1="5" y1="8" x2="31" y2="28" gradientUnits="userSpaceOnUse">
      <stop stopColor="#FF9E45" /><stop offset="1" stopColor="#F0503C" />
    </linearGradient></defs>
  </svg>
)
const ArtOps = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <circle cx="18" cy="18" r="12" stroke="url(#hlc-o)" strokeWidth="2.6" />
    <circle cx="18" cy="18" r="6.5" stroke="#45C8E7" strokeWidth="2.2" />
    <circle cx="18" cy="18" r="2.2" fill="#3A5AE2" />
    <path d="M18 6v4M30 18h-4" stroke="#45C8E7" strokeWidth="2.2" strokeLinecap="round" />
    <defs><linearGradient id="hlc-o" x1="6" y1="6" x2="30" y2="30" gradientUnits="userSpaceOnUse">
      <stop stopColor="#45E7A4" /><stop offset="1" stopColor="#0E9888" />
    </linearGradient></defs>
  </svg>
)
const ArtMarketing = (): ReactNode => (
  <svg {...artSvg} width={22} height={22} aria-hidden="true">
    <path d="M8 26V16M15 26V10M22 26v-9M29 26V14" stroke="url(#hlc-m)" strokeWidth="3" strokeLinecap="round" />
    <path d="m8 12 7-5 6 4 6-6" stroke="#FFC24A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <defs><linearGradient id="hlc-m" x1="8" y1="10" x2="29" y2="26" gradientUnits="userSpaceOnUse">
      <stop stopColor="#FF8FC7" /><stop offset="1" stopColor="#A23AE7" />
    </linearGradient></defs>
  </svg>
)

const CATEGORIES: Array<{ id: HeroCategory; label: string; Art: () => ReactNode }> = [
  { id: 'all', label: '全能创作', Art: ArtAll },
  { id: 'copy', label: '文案编写', Art: ArtCopy },
  { id: 'image', label: '图片生成', Art: ArtImage },
  { id: 'video', label: '视频创作', Art: ArtVideo },
  { id: 'ops', label: '账号运营', Art: ArtOps },
  { id: 'marketing', label: '营销策略', Art: ArtMarketing },
]

const CATEGORY_SOURCES: Record<Exclude<HeroCategory, 'all' | 'ops'>, string[]> = {
  copy: ['文案与 SEO', '品牌与人群'],
  image: ['电商图片创作', '商品详情页'],
  video: ['UGC 广告', '视频创意模板'],
  marketing: ['创意洞察', '广告投放'],
}

/** 全能创作：每个原生类目取前 1 个，凑齐混排精选（最多 8 张）。 */
function mixedSelection(): typeof VIDEO_CATALOG {
  const byCategory = new Map<string, typeof VIDEO_CATALOG>()
  for (const item of VIDEO_CATALOG) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }
  const picks: typeof VIDEO_CATALOG = []
  for (const list of byCategory.values()) {
    if (picks.length >= 9) break
    const first = list[0]
    if (first !== undefined) picks.push(first)
  }
  return picks
}

function itemsFor(category: HeroCategory): typeof VIDEO_CATALOG {
  if (category === 'all') return mixedSelection()
  if (category === 'ops') return []
  const sources = CATEGORY_SOURCES[category]
  return VIDEO_CATALOG.filter(item => sources.includes(item.category)).slice(0, 9)
}

/* ── 按钮条（输入框上方，小灰条横排） ─────────────────────────────────── */

const barStyle: CSSProperties = {
  display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
  margin: '14px 0 10px',
}

export function HeroCategoryBar({ selected, onSelect }: {
  selected: HeroCategory
  onSelect: (category: HeroCategory) => void
}) {
  /* 2026-11-27（用户三次修正）：横排**胶囊**——彩色 logo 在左、文字在右
   * （第一版灰条胶囊形状 + 场景创作渐变 SVG 图标）。 */
  return (
    <div style={barStyle} role="tablist" aria-label="创作分类">
      {CATEGORIES.map(({ id, label, Art }) => {
        const active = selected === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => { onSelect(id) }}
            style={{
              /* 2026-11-27（用户四次修正）：选中态去描边——灰底（比悬浮略深）
               * +微阴影+文字加粗；悬浮灰底保留。 */
              display: 'inline-flex', alignItems: 'center', gap: 7,
              border: 'none',
              background: active ? 'var(--dsw-alias-interactive-bg-hover, #e9e9e9)' : 'var(--dsw-alias-bg-layer-2, #f4f4f4)',
              color: 'inherit',
              borderRadius: 999, padding: '7px 16px 7px 10px', fontSize: 13, cursor: 'pointer',
              transition: 'background 0.15s ease, box-shadow 0.15s ease',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, #ececec)' }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-2, #f4f4f4)' }}
          >
            <Art />
            <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── 类目大卡区（输入框下方） ─────────────────────────────────────────── */

export function HeroCategoryCards({ category }: { category: HeroCategory }) {
  const items = useMemo(() => itemsFor(category), [category])
  const openTemplatePanel = (item: typeof VIDEO_CATALOG[number]): void => {
    try {
      sessionStorage.setItem('hl-template-console', JSON.stringify({ id: item.id, template: item.name, skill: item.skill }))
    } catch { /* 非致命 */ }
    window.dispatchEvent(new CustomEvent('hl:open-template-console', { detail: { id: item.id, template: item.name, skill: item.skill } }))
  }

  if (category === 'ops') {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '8px 0 2px',
        width: 'min(var(--dsh-composer-card-max-width, 100%), 100%)', margin: '0 auto',
      }}>
        {['对标监控', '选题池', '发布排期'].map(label => (
          <div key={label} style={{
            height: 88, borderRadius: 12, border: '1px dashed var(--dsw-alias-border-l1, #ddd)',
            padding: '0 14px', color: 'var(--dsw-alias-label-tertiary, #999)', fontSize: 12,
            display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #666)' }}>{label}</span>
            <span>内容筹备中——先在「运营面板」使用</span>
          </div>
        ))}
      </div>
    )
  }

  /* 2026-11-27（用户三次修正）：竖版卡=参考站「你想做什么」样式（上图片、
   * 底部一行：图标+标题粗+简介灰截断），比第一版缩小——宽 218px，容器
   * 960px 一排 4 个。 */
  return (
    /* 2026-11-27（用户五次修正）：容器宽=输入框卡片宽（--dsh-composer-card-
     * max-width，stack 全宽比它每侧宽 16px 实锤超出）；grid 3 列×3 排，
     * 卡片压矮（图 56px+底行）保证 3 排在输入框下方一屏内直出。 */
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
      padding: '8px 0 2px',
      width: 'min(var(--dsh-composer-card-max-width, 100%), 100%)',
      margin: '0 auto',
    }}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => { openTemplatePanel(item) }}
          style={{
            border: '1px solid var(--dsw-alias-border-l1, #ececec)', borderRadius: 12,
            background: 'var(--dsw-alias-bg-layer-1, #fff)', cursor: 'pointer', padding: 0,
            overflow: 'hidden', textAlign: 'left', color: 'inherit',
            transition: 'box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
        >
          <img
            src={item.cover}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: 56, objectFit: 'cover', display: 'block', objectPosition: item.pos }}
            onError={(event) => {
              const fallback = (item as { coverFallback?: string }).coverFallback
              if (fallback !== undefined && event.currentTarget.src !== fallback) event.currentTarget.src = fallback
            }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 9px' }}>
            <span aria-hidden style={{ fontSize: 12, flexShrink: 0 }}>✦</span>
            <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 118, flexShrink: 0 }}>{item.name}</span>
            <span style={{
              fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary, #999)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}>{item.tagline}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
