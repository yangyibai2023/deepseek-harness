/**
 * HeightLab：创意灵感 / 自动化页面。
 *
 * 由 ConversationRoot 直接渲染在主内容区（替换聊天页，类似 Z Code 的
 * 页面跳转，侧边栏保留）：标题 + 无边框 × 关闭图标；「创意灵感」按分类
 * 展示输入框下方的模板卡片（推荐/文案/图片/视频/办公），整页可滚动。
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { TEMPLATE_CARDS, TEMPLATE_ORDER, loadTemplateCatalog, templateThumb, type Recommendation, type TemplateCategory } from './HeightLabTemplates.ts'
import { VIDEO_CATALOG } from './HeightLabVideoCatalog.ts'
import { TemplatePreview } from './TemplatePreview.tsx'
import { HeightLabLibraryPage } from './HeightLabLibraryPage.tsx'
import { HeightLabFilmStudio } from './HeightLabFilmStudio.tsx'
import css from './ConversationRoot.module.css'

export type HubPage = 'inspiration' | 'library' | 'automation' | 'video-studio' | 'skill-hub' | 'film-studio'

/** HeightLab V24b：视频创作一级页的 8 个模块卡片（第一排流量转化/第二排人设内容）。
 * 0.5.7 模块创作台（2026-11-08 用户拍板「一个功能驾驭多个模板」）：8 模块全部
 * 上线——爆款复刻走专属 FY1 链（hl:start-replication），其余七模块走
 * hl:start-module（新建会话 + 右栏先选模板再进模板工作台）。 */
type StudioCard = { name: string; desc: string; icon: string; moduleId: string }
const STUDIO_CARDS: StudioCard[] = [
  { name: '爆款复刻', desc: '上传对标视频，AI 拆脚本、分镜与钩子，换品换人换文案重生成', icon: '🔥', moduleId: 'replication' },
  { name: '达人带货', desc: '达人形象 + 商品图，按卖点直接生成种草带货视频', icon: '🛍️', moduleId: 'influencer-selling' },
  { name: '产品评测', desc: '开箱、对比、试用与参数解读的真实体验向测评', icon: '🔍', moduleId: 'product-review' },
  { name: '直播切片', desc: '直播回放自动切金句高光，加字幕标题二次创作', icon: '📺', moduleId: 'live-clip' },
  { name: 'IP 口播', desc: '固定形象 + 文案生成单人主讲，人设统一、不强制挂品', icon: '🎙️', moduleId: 'ip-talk' },
  { name: '知识讲解', desc: '文档知识点转图解讲解、配音与字幕的教程科普', icon: '📚', moduleId: 'knowledge-tutorial' },
  { name: '情景短剧', desc: '从梗概到分镜的剧情带货与品牌短剧', icon: '🎬', moduleId: 'drama-short' },
  { name: '访谈视频', desc: '双人对谈与圆桌采访，提纲或录音直接转视频', icon: '🎤', moduleId: 'interview-video' },
]

/* 模块 -> 模板目录条目 id 集（2026-11-07 八模块↔120 条目录映射调研落定，家族
 * 依据见 docs/70-PLANS；同族跨模块允许重叠——主播系同时服务带货与口播）。
 * 点击时按 id 从 VIDEO_CATALOG 取全条目（含封面/skill）传给控制台。 */
const MODULE_TEMPLATE_IDS: Record<string, readonly string[]> = {
  // 达人带货：主播系 + 服装博主/试穿系 + 安利/种草系 + 主理人系
  'influencer-selling': [
    'yj-320-adaptive-scene-host', 'yj-320-car-host', 'yj-320-host-product-showcase', 'yj-320-fashion-store-presenter',
    'yj-320-female-fashion-blogger', 'yj-320-male-fashion-blogger', 'yj-320-male-fashion-first-frame',
    'yj-320-fashion-beat-change', 'yj-320-garment-product-only', 'skill-test-21-nvzhuang-jiefang-shichuan',
    'skill-test-19-nvzhuang-dian-shangshen', 'skill-test-18-nvzhuang-bozhu-chuanda', 'skill-test-20-nanzhuang-xingnan-anli',
    'skill-test-22-chaoliu-nanzhuang-duijing', 'skill-test-31-quanneng-zhongcao-nvzhubo', 'skill-test-14-zhenren-koubei-anli',
    'skill-test-16-jietou-luren-anli', 'skill-test-39-chenei-suishoupai-tongqin-anli', 'skill-test-32-quanpinlei-wanneng-daihuo',
    'yj-320-brand-craftsman', 'yj-320-export-factory-owner', 'yj-320-warehouse-owner', 'yj-320-struggling-creator',
    'yj-320-craftsman-live-clip', 'skill-test-23-pinpai-zhuliren-jiangxin', 'skill-test-09-maican-zhuliren-shuaimai',
  ],
  // 产品评测：开箱/对比实测/横评/痛点/用前用后/证言/探店
  'product-review': [
    'yj-320-unboxing-review', 'skill-test-10-zhenshi-kaixiang-ceping', 'yj-320-comparison-test',
    'skill-test-11-yinghe-hengping-shice', 'yj-320-pain-unbox-review', 'yj-320-pain-first-five-shot',
    'skill-test-35-tongdian-chaixiang-bidan-sanlian', 'skill-test-34-tongdian-baoji-yizhao',
    'skill-test-12-yongqian-yonghou-fanzhuan', 'yj-320-before-after', 'yj-320-testimonial',
    'yj-320-store-reviewer', 'skill-test-03-tandian-daka-zhongcao',
  ],
  // 直播切片：原生/主理人/高光逼单
  'live-clip': [
    'yj-320-live-clip', 'yj-320-craftsman-live-clip', 'skill-test-42-zhibo-qiepian-gaoguang-bidan',
  ],
  // IP 口播：口播系 + 一镜到底 + 主播系（与带货主播系有意重叠）
  'ip-talk': [
    'skill-test-38-jimeng-zixuan-changjing-koubo', 'skill-test-40-jianshenfang-8miao-baofa-koubo',
    'yj-320-gym-one-shot', 'yj-320-warehouse-one-take', 'yj-320-adaptive-scene-host',
    'yj-320-host-product-showcase', 'yj-320-car-host', 'yj-320-fashion-store-presenter',
  ],
  // 知识讲解：沉浸式教程 ×2 + YJ-402 图解全家桶（图解=该模块的讲解载体）
  'knowledge-tutorial': [
    'yj-320-tutorial-howto', 'skill-test-17-chenjin-shoubashou-jiaocheng',
    'yj-402-attribute-guide', 'yj-402-benefits-infographic', 'yj-402-brand-closing-banner',
    'yj-402-components-structure', 'yj-402-feature-matrix', 'yj-402-how-to-use',
    'yj-402-lifestyle-scene', 'yj-402-materials-story', 'yj-402-multi-angle-showcase',
    'yj-402-packaging-detail', 'yj-402-routine-context', 'yj-402-white-background-main',
    'yj-402-wide-hero-banner',
  ],
  // 情景短剧：剧情/宫斗/爽剧/微剧场/冲突/抢购/货架
  'drama-short': [
    'yj-320-dramatic-short', 'yj-320-palace-drama', 'skill-test-01-gongdou-daihuo-duanju',
    'skill-test-04-zhongwen-shuangju-daihuo', 'skill-test-05-shenghuo-weijuchang',
    'skill-test-06-zhalie-chongtu-lanjie', 'yj-320-extreme-conflict', 'yj-320-crowd-rush',
    'yj-320-supermarket-rush', 'skill-test-07-chaoshi-hongqiang-jianlou',
    'skill-test-08-hongqiang-jiaqiang-bidan', 'skill-test-37-shangchao-shipai-huojia-qiangjing',
    'skill-test-25-lingshou-caopanshou-huojia',
  ],
  // 访谈视频：街访四条 + 评论区对话体（双人圆桌暂无直接模板，先以模板集上线）
  'interview-video': [
    'yj-320-street-interview', 'interview-dialogue-video', 'yj-320-fashion-street-interview',
    'skill-test-21-nvzhuang-jiefang-shichuan', 'yj-320-comment-reply', 'skill-test-15-pinglunqu-kaigang-huidui',
  ],
}

const studioWrapStyle: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  // HeightLab V24b 用户反馈：卡片组垂直居中——「选择页面」而非「网页内容」。
  minHeight: 'calc(100vh - 120px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
}
const studioGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 16,
}
const studioCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: '18px 16px 16px',
  border: '1px solid var(--dsw-alias-border-l1, #ececec)',
  borderRadius: 16,
  background: '#fff',
  textAlign: 'left',
  boxSizing: 'border-box',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 14px rgba(0, 0, 0, 0.04)',
  transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
}
// 悬停抬升与图标底托需要伪类，inline style 表达不了——统一放
// ConversationRoot.module.css 的 .studioCard / .studioIcon 类（V24b）。
const studioIconStyle: CSSProperties = { fontSize: 24, lineHeight: 1.2 }
const studioNameStyle: CSSProperties = { fontWeight: 600, fontSize: 13, lineHeight: '18px' }
const studioDescStyle: CSSProperties = { fontSize: 11, lineHeight: '16px', color: '#999' }
const PAGE_TITLES: Record<HubPage, string> = {
  'film-studio': '智能剪辑台',
  'skill-hub': '技能中心',
  inspiration: '创意灵感',
  library: '资产中心',
  automation: '自动化',
  'video-studio': '视频创作',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 36,
  padding: '0 24px',
}

const closeStyle: CSSProperties = {
  border: 'none',
  color: 'var(--dsw-alias-label-secondary)',
  padding: 4,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '4px 24px 32px',
  boxSizing: 'border-box',
}

const sectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
  margin: '18px 0 10px',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '10px 12px',
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  minWidth: 0,
  padding: 0,
  border: 'none',
  borderRadius: 10,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
}

const thumbStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 10',
  borderRadius: 10,
  objectFit: 'cover',
}

const cardTitleStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-primary)',
}

const cardDescStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 11,
  lineHeight: '16px',
  color: 'var(--dsw-alias-label-tertiary)',
}

/** Render the page in the main content area (replaces chat view). */
export function HeightLabHubPage({ page, onClose }: { page: HubPage; onClose: () => void }) {
  const [preview, setPreview] = useState<{ item: Recommendation; category: TemplateCategory } | null>(null)
  const [cards, setCards] = useState<Record<TemplateCategory, Recommendation[]>>(TEMPLATE_CARDS)

  // HeightLab：模板热更新——进入页面时拉取服务器目录，失败回退包内默认。
  useEffect(() => {
    let cancelled = false
    void loadTemplateCatalog().then((catalog) => {
      if (!cancelled && catalog !== null) setCards(catalog)
    })
    return () => { cancelled = true }
  }, [])
  const sameOf = (item: Recommendation, category: TemplateCategory): void => {
    // 做同款：关闭预览回聊天，切换对应专家，并把模板名以胶囊形式插入
    // 输入框文字区（Manus 式）；不发送，用户可继续输入。
    setPreview(null)
    window.dispatchEvent(new CustomEvent('hl:close-hub'))
    window.dispatchEvent(new CustomEvent('hl:use-template', {
      detail: {
        agentPreset: item.agent ?? (category === '图片'
          ? 'image-generator'
          : category === '视频' ? 'video-producer' : 'content-creator'),
        title: item.title,
      },
    }))
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-base)',
      }}
    >
      {/* 2026-10-20 用户要求：一级菜单「剪辑台」以 OpenFilm 原生布局为准——
          它的顶栏就是整个工作区的顶栏，我们不再叠一条自己的标题栏。
          关闭入口挪进 Studio 右上角的浮层里（HeightLabFilmStudio native）。
          其他 hub 页（灵感/资产）保持原样。 */}
      {page === 'film-studio' ? null : (
        <div style={headerStyle} data-tauri-drag-region="deep">
          <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '20px' }}>{PAGE_TITLES[page]}</span>
          <button
            type="button"
            style={closeStyle}
            className={css.closeHover}
            aria-label="关闭"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      {page === 'video-studio' ? (
        <div style={studioWrapStyle}>
          <div style={studioGridStyle}>
            {STUDIO_CARDS.map(card => (
              <button
                key={card.name}
                type="button"
                className={css.studioCard}
                style={studioCardStyle}
                onClick={() => {
                  if (card.moduleId === 'replication') {
                    // 爆款复刻：专属 FY1 云镜链（既有通道，0.5.7 已修工作区解析）。
                    window.dispatchEvent(new CustomEvent('hl:start-replication'))
                    window.dispatchEvent(new CustomEvent('hl:close-hub'))
                    return
                  }
                  /* 0.5.7 模块创作台：把模块元数据 + 按映射取好的模板条目整包
                   * 传给 ui-workspace（建新会话）与右栏控制台（模板选择网格）。 */
                  const templates = (MODULE_TEMPLATE_IDS[card.moduleId] ?? [])
                    .map(id => VIDEO_CATALOG.find(item => item.id === id))
                    .filter((item): item is (typeof VIDEO_CATALOG)[number] => item !== undefined)
                    .map(item => ({
                      id: item.id, name: item.name, tagline: item.tagline,
                      cover: item.cover,
                      ...(item.coverFallback !== undefined ? { coverFallback: item.coverFallback } : {}),
                      skill: item.skill,
                    }))
                  window.dispatchEvent(new CustomEvent('hl:start-module', {
                    detail: { moduleId: card.moduleId, name: card.name, desc: card.desc, icon: card.icon, templates },
                  }))
                  window.dispatchEvent(new CustomEvent('hl:close-hub'))
                }}
              >
                <span className={css.studioIcon} style={studioIconStyle} aria-hidden="true">{card.icon}</span>
                <span style={studioNameStyle}>{card.name}</span>
                <span style={studioDescStyle}>{card.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ) : page === 'inspiration' ? (
        <div style={bodyStyle}>
          {/* HeightLab：术语分类暂不更新，创意灵感页先隐藏（数据保留）。 */}
          {TEMPLATE_ORDER.filter(category => category !== '术语').map(category => (
            <section key={category}>
              <div style={sectionTitleStyle}>{category}</div>
              <div style={gridStyle}>
                {cards[category].map(item => (
                  <button key={item.title} type="button" style={cardStyle} onClick={() => setPreview({ item, category })}>
                    <img style={thumbStyle} src={templateThumb(item)} alt="" draggable={false} />
                    <span style={cardTitleStyle}>{item.title}</span>
                    <span style={cardDescStyle}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : page === 'film-studio' ? (
        // 入口 (a)：一级菜单「剪辑台」= 主区满幅 Studio + 右侧开一段全新对话。
        // 这就是 OpenFilm 原生的「左影片、右侧边对话」，只是对话从 0 开始。
        <HeightLabFilmStudio onClose={onClose} opensChat />
      ) : page === 'library' ? (
        <HeightLabLibraryPage />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 13,
          }}
        >
          页面建设中…
        </div>
      )}
      {preview !== null && (
        <TemplatePreview
          item={preview.item}
          onClose={() => setPreview(null)}
          onSame={() => sameOf(preview.item, preview.category)}
        />
      )}
    </div>
  )
}
