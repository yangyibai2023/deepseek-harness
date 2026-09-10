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

export type HubPage = 'inspiration' | 'library' | 'automation'

const PAGE_TITLES: Record<HubPage, string> = {
  inspiration: '创意灵感',
  library: '资料库',
  automation: '自动化',
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
      {page === 'inspiration' ? (
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
