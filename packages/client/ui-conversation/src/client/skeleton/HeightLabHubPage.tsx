/**
 * HeightLab：创意灵感 / 自动化页面。
 *
 * 由 ConversationRoot 直接渲染在主内容区（替换聊天页，类似 Z Code 的
 * 页面跳转，侧边栏保留）：标题 + 无边框 × 关闭图标；「创意灵感」按分类
 * 展示输入框下方的模板卡片（推荐/文案/图片/视频/办公），整页可滚动。
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { TEMPLATE_CARDS, TEMPLATE_ORDER, loadTemplateCatalog, templateThumb, type Recommendation, type TemplateCategory } from './HeightLabTemplates.ts'
import { TemplatePreview } from './TemplatePreview.tsx'
import { HeightLabLibraryPage } from './HeightLabLibraryPage.tsx'
import css from './ConversationRoot.module.css'

export type HubPage = 'inspiration' | 'library' | 'automation' | 'video-studio'

/** HeightLab V24b：视频创作一级页的 8 个模板卡片（第一排流量转化/第二排人设内容）。 */
type StudioCard = { name: string; desc: string; icon: string; enabled: boolean }
const STUDIO_CARDS: StudioCard[] = [
  { name: '爆款复刻', desc: '上传对标视频，AI 拆脚本、分镜与钩子，换品换人换文案重生成', icon: '🔥', enabled: true },
  { name: '达人带货', desc: '达人形象 + 商品图，按卖点直接生成种草带货视频', icon: '🛍️', enabled: false },
  { name: '产品评测', desc: '开箱、对比、试用与参数解读的真实体验向测评', icon: '🔍', enabled: false },
  { name: '直播切片', desc: '直播回放自动切金句高光，加字幕标题二次创作', icon: '📺', enabled: false },
  { name: 'IP 口播', desc: '固定形象 + 文案生成单人主讲，人设统一、不强制挂品', icon: '🎙️', enabled: false },
  { name: '知识讲解', desc: '文档知识点转图解讲解、配音与字幕的教程科普', icon: '📚', enabled: false },
  { name: '情景短剧', desc: '从梗概到分镜的剧情带货与品牌短剧', icon: '🎬', enabled: false },
  { name: '访谈视频', desc: '双人对谈与圆桌采访，提纲或录音直接转视频', icon: '🎤', enabled: false },
]

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
const studioBadgeStyle: CSSProperties = {
  fontSize: 9,
  color: '#b8860b',
  border: '1px solid #e6d9a8',
  borderRadius: 6,
  padding: '0 5px',
}

const PAGE_TITLES: Record<HubPage, string> = {
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
      {page === 'video-studio' ? (
        <div style={studioWrapStyle}>
          <div style={studioGridStyle}>
            {STUDIO_CARDS.map(card => (
              <button
                key={card.name}
                type="button"
                className={card.enabled ? css.studioCard : `${css.studioCard} ${css.studioCardOff}`}
                style={studioCardStyle}
                disabled={!card.enabled}
                onClick={() => {
                  if (!card.enabled) return
                  window.dispatchEvent(new CustomEvent('hl:start-replication'))
                  window.dispatchEvent(new CustomEvent('hl:close-hub'))
                }}
              >
                <span className={css.studioIcon} style={studioIconStyle} aria-hidden="true">{card.icon}</span>
                <span style={studioNameStyle}>
                  {card.name}
                  {!card.enabled ? <span style={{ ...studioBadgeStyle, marginLeft: 6 }}>即将上线</span> : null}
                </span>
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
