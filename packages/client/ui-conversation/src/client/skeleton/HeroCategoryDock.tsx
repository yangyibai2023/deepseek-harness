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
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { VIDEO_CATALOG } from './HeightLabVideoCatalog.ts'

export type HeroCategory = 'all' | 'copy' | 'image' | 'video' | 'ops' | 'marketing'

const CATEGORIES: Array<{ id: HeroCategory; label: string; icon: string }> = [
  { id: 'all', label: '全能创作', icon: '✦' },
  { id: 'copy', label: '文案编写', icon: '✎' },
  { id: 'image', label: '图片生成', icon: '❑' },
  { id: 'video', label: '视频创作', icon: '▶' },
  { id: 'ops', label: '账号运营', icon: '◉' },
  { id: 'marketing', label: '营销策略', icon: '◈' },
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
    if (picks.length >= 8) break
    const first = list[0]
    if (first !== undefined) picks.push(first)
  }
  return picks
}

function itemsFor(category: HeroCategory): typeof VIDEO_CATALOG {
  if (category === 'all') return mixedSelection()
  if (category === 'ops') return []
  const sources = CATEGORY_SOURCES[category]
  return VIDEO_CATALOG.filter(item => sources.includes(item.category)).slice(0, 8)
}

/* ── 按钮条（输入框上方，小灰条横排） ─────────────────────────────────── */

const barStyle: CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
  margin: '18px 0 14px',
}

export function HeroCategoryBar({ selected, onSelect }: {
  selected: HeroCategory
  onSelect: (category: HeroCategory) => void
}) {
  return (
    <div style={barStyle} role="tablist" aria-label="创作分类">
      {CATEGORIES.map(({ id, label, icon }) => {
        const active = selected === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => { onSelect(id) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: active ? '1px solid transparent' : '1px solid var(--dsw-alias-border-l1, #e5e5e5)',
              background: active ? 'var(--dsw-alias-label-primary, #1a1a1a)' : 'var(--dsw-alias-bg-layer-2, #f5f5f5)',
              color: active ? 'var(--dsw-alias-bg-layer-1, #fff)' : 'inherit',
              borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{icon}</span>
            {label}
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
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '8px 0 4px', flexWrap: 'wrap' }}>
        {['对标监控', '选题池', '发布排期'].map(label => (
          <div key={label} style={{
            width: 200, borderRadius: 14, border: '1px dashed var(--dsw-alias-border-l1, #ddd)',
            padding: '18px 16px', color: 'var(--dsw-alias-label-tertiary, #999)', fontSize: 13,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--dsw-alias-label-secondary, #666)' }}>{label}</span>
            <span>内容筹备中——先在「运营面板」使用完整能力</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '8px 0 4px', flexWrap: 'wrap' }}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => { openTemplatePanel(item) }}
          style={{
            width: 200, border: '1px solid var(--dsw-alias-border-l1, #ececec)', borderRadius: 14,
            background: 'var(--dsw-alias-bg-layer-1, #fff)', cursor: 'pointer', padding: 0,
            overflow: 'hidden', textAlign: 'left', color: 'inherit',
          }}
        >
          <img
            src={item.cover}
            alt=""
            loading="lazy"
            style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', objectPosition: item.pos }}
            onError={(event) => {
              const fallback = (item as { coverFallback?: string }).coverFallback
              if (fallback !== undefined && event.currentTarget.src !== fallback) event.currentTarget.src = fallback
            }}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px' }}>
            <span aria-hidden style={{ fontSize: 13 }}>✦</span>
            <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{item.name}</span>
            <span style={{
              fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #999)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{item.tagline}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
