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

/* 2026-11-28（用户六次修正）：去彩色 logo（太抢眼）——六个单色线性图标
 * （currentColor，与 DSH 原生 Outline 图标同视觉语言）。 */
const artSvg = { fill: 'none', viewBox: '0 0 36 36' } as const
const S = { stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ArtAll = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <path d="M18 6l2.4 6.8L27 15.2l-6.6 2.4L18 24.4l-2.4-6.8L9 15.2l6.6-2.4L18 6Z" {...S} />
  </svg>
)
const ArtCopy = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <rect x="8" y="5" width="20" height="26" rx="3" {...S} />
    <path d="M13 12h10M13 17h10M13 22h7" {...S} />
  </svg>
)
const ArtImage = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <rect x="5" y="8" width="26" height="20" rx="3" {...S} />
    <circle cx="13" cy="15" r="2.4" {...S} />
    <path d="m9 24 6-5 5 4 4-3.5 6 5" {...S} />
  </svg>
)
const ArtVideo = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <rect x="5" y="8" width="26" height="20" rx="4" {...S} />
    <path d="m15 13.5 8 4.5-8 4.5v-9Z" {...S} />
  </svg>
)
const ArtOps = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <circle cx="18" cy="18" r="12" {...S} />
    <circle cx="18" cy="18" r="6" {...S} />
    <circle cx="18" cy="18" r="1.6" fill="currentColor" />
  </svg>
)
const ArtMarketing = (): ReactNode => (
  <svg {...artSvg} width={16} height={16} aria-hidden="true">
    <path d="M8 27V17M15 27V11M22 27v-9M29 27V15" {...S} />
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

/* 2026-11-28（用户定稿）：全能创作=八个产品级入口（自定义名称/简介），
 * refId 指向目录里最接近的模板——取封面（叠图装饰）与 skill（点击打开
 * 对应工作台）；PPT 暂无模板，点击走插入指令（chatOnly）。 */
const HERO_ALL_ITEMS: Array<{ name: string; tagline: string; refId: string; chatOnly?: boolean }> = [
  { name: '爆款视频复刻', tagline: '对标爆款，逐镜复刻', refId: 'skill-test-41-baokuan-1bi1-duibiao-fuke' },
  { name: '口播视频制作', tagline: '真人感口播，一键成片', refId: 'skill-test-38-jimeng-zixuan-changjing-koubo' },
  { name: '带货视频制作', tagline: 'UGC 带货，脚本到成片', refId: 'yj-301-original-ugc' },
  { name: 'Vlog 视频制作', tagline: '生活记录，电影感剪辑', refId: 'skill-test-05-shenghuo-weijuchang' },
  { name: '小红书图文生成', tagline: '种草图文，爆款排版', refId: 'skill-test-03-tandian-daka-zhongcao' },
  { name: '电商图片制作', tagline: '主图详情，整套出图', refId: 'yj-401-original-main-detail' },
  { name: '海报图片制作', tagline: '营销海报，品牌质感', refId: 'yj-401-commercial-poster' },
  { name: 'PPT 一键生成', tagline: '一句话生成演示文稿', refId: 'yj-402-white-background-main', chatOnly: true },
]

type ResolvedHeroItem = typeof VIDEO_CATALOG[number] & {
  displayName: string
  displayTagline: string
  chatOnly?: boolean
}

function resolveHeroItem(entry: typeof HERO_ALL_ITEMS[number]): ResolvedHeroItem {
  const ref = VIDEO_CATALOG.find(item => item.id === entry.refId)
  const base = ref ?? VIDEO_CATALOG[0]
  if (base === undefined) throw new Error('VIDEO_CATALOG is empty')
  return entry.chatOnly === true
    ? { ...base, displayName: entry.name, displayTagline: entry.tagline, chatOnly: true }
    : { ...base, displayName: entry.name, displayTagline: entry.tagline }
}

function mixedSelection(): Array<ReturnType<typeof resolveHeroItem>> {
  return HERO_ALL_ITEMS.map(resolveHeroItem)
}

type HeroCardItem = typeof VIDEO_CATALOG[number] & { displayName?: string; displayTagline?: string; chatOnly?: boolean }

function itemsFor(category: HeroCategory): HeroCardItem[] {
  if (category === 'all') return mixedSelection()
  if (category === 'ops') return []
  const sources = CATEGORY_SOURCES[category]
  return VIDEO_CATALOG.filter(item => sources.includes(item.category)).slice(0, 8)
}

/* ── 按钮条（输入框上方，小灰条横排） ─────────────────────────────────── */

/* 2026-11-28（用户六次修正）：整体收进一个大胶囊容器（WorkBuddy 形态）——
 * 灰底长胶囊内嵌选项，选中项=白底小胶囊浮起+微阴影。 */
const barStyle: CSSProperties = {
  display: 'inline-flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center',
  margin: '14px auto 10px',
  /* O134（2026-11-28 用户六次拍板）：全页灰色统一——胶囊底/托盘底/侧栏底
   * 同一个 token（--dsw-specific-sidebar-fill），不再各调各的 rgba。 */
  background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
  /* 六次拍板：内边距收紧（4→3）——窄边框紧凑感，对齐 WorkBuddy 胶囊。 */
  borderRadius: 999, padding: 3,
}

export function HeroCategoryBar({ selected, onSelect }: {
  selected: HeroCategory
  onSelect: (category: HeroCategory) => void
}) {
  /* 2026-11-27（用户三次修正）：横排**胶囊**——彩色 logo 在左、文字在右
   * （第一版灰条胶囊形状 + 场景创作渐变 SVG 图标）。 */
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
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
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: 'none',
                background: active ? 'var(--dsw-alias-bg-layer-1, #fff)' : 'transparent',
                color: active ? 'var(--dsw-alias-label-primary, #1a1a1a)' : 'var(--dsw-alias-label-secondary, #666)',
                borderRadius: 999, padding: '5px 13px', fontSize: 13, cursor: 'pointer',
                transition: 'background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--dsw-alias-label-primary, #1a1a1a)' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--dsw-alias-label-secondary, #666)' }}
            >
              <Art />
              <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── 类目大卡区（输入框下方） ─────────────────────────────────────────── */

export function HeroCategoryCards({ category }: { category: HeroCategory }) {
  const items = useMemo(() => itemsFor(category), [category])
  const openTemplatePanel = (item: HeroCardItem): void => {
    /* PPT 等暂无模板的入口：插入通用创作指令（走输入框胶囊通道）。 */
    if (item.chatOnly === true) {
      window.dispatchEvent(new CustomEvent('hl:insert-template-chip', {
        detail: { label: item.displayName ?? item.name, prompt: `请帮我${item.displayName ?? item.name}：` },
      }))
      return
    }
    try {
      sessionStorage.setItem('hl-template-console', JSON.stringify({ id: item.id, template: item.name, skill: item.skill }))
    } catch { /* 非致命 */ }
    window.dispatchEvent(new CustomEvent('hl:open-template-console', { detail: { id: item.id, template: item.name, skill: item.skill } }))
  }

  if (category === 'ops') {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '8px 0 2px',
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
    /* 2026-11-28（用户定稿）：卡片区整体下移——离输入框远一些，居中于
     * 输入框与窗口底之间（不贴输入框也不贴底）。 */
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
      padding: '0 0 2px',
      width: 'min(var(--dsh-composer-card-max-width, 100%), 100%)',
      margin: '56px auto 0',
    }}>
      {items.map((item, index) => {
        /* 2026-11-28（用户六次修正，参考截图②）：横条卡——左侧文字为主，
         * 右侧 2 张同类目封面错落叠放（纯装饰，突出文字）。 */
        const stackMate = items[(index + 1) % items.length] ?? item
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => { openTemplatePanel(item) }}
            style={{
              height: 76, border: 'none', borderRadius: 14,
              /* O134（2026-11-28 用户拍板）：模板卡底色与全页灰统一
               * （--dsw-specific-sidebar-fill，同胶囊/托盘/侧栏）。 */
              background: 'var(--dsw-specific-sidebar-fill, #f9fafb)', cursor: 'pointer',
              padding: '0 10px 0 14px', textAlign: 'left', color: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-specific-sidebar-fill, #f9fafb)' }}
          >
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.displayName ?? item.name}</span>
              <span style={{
                fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #999)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.displayTagline ?? item.tagline}</span>
            </span>
            <span style={{ position: 'relative', width: 58, height: 52, flexShrink: 0 }} aria-hidden="true">
              <img
                src={stackMate.cover}
                alt=""
                loading="lazy"
                style={{
                  position: 'absolute', right: 0, top: 4, width: 40, height: 44,
                  borderRadius: 8, objectFit: 'cover', objectPosition: stackMate.pos,
                  transform: 'rotate(6deg)', border: '2px solid var(--dsw-alias-bg-layer-1, #fff)',
                }}
                onError={(event) => {
                  const fallback = (stackMate as { coverFallback?: string }).coverFallback
                  if (fallback !== undefined && event.currentTarget.src !== fallback) event.currentTarget.src = fallback
                }}
              />
              <img
                src={item.cover}
                alt=""
                loading="lazy"
                style={{
                  position: 'absolute', left: 0, top: 0, width: 40, height: 44,
                  borderRadius: 8, objectFit: 'cover', objectPosition: item.pos,
                  border: '2px solid var(--dsw-alias-bg-layer-1, #fff)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
                }}
                onError={(event) => {
                  const fallback = (item as { coverFallback?: string }).coverFallback
                  if (fallback !== undefined && event.currentTarget.src !== fallback) event.currentTarget.src = fallback
                }}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
