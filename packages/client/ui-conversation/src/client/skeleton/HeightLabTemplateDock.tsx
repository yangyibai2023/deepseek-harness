/**
 * HeightLab：输入框下方推荐/模板区（Manus 式）。
 *
 * 标签行：推荐 / 文案 / 图片 / 视频 / 办公 / 更多 + 折叠箭头（向下=展开、
 * 点击折叠后变向右），纯文字、无底色无边框、融入页面。
 *
 * 推荐板块（默认激活）：一排 3 个（窄窗口 2/1 列自适应），每项 = 圆角配图
 * + 标题 + 一句说明，无背景色、无边框；区域内部独立滚动（max-height +
 * overflow-y），页面本身不滚动。
 *
 * 交互：
 * - 点击折叠箭头：整个模板内容区收起/展开；
 * - 聚焦输入框：内容向下滑出、消失在区域下边（Manus 式），失焦恢复。
 * - 折叠按钮旁「设置」图标：弹出「默认展开 / 默认关闭」，选择即生效并持久化，
 *   下次打开应用按此默认状态展示。
 */

import { useEffect, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './HeightLabTemplateDock.module.css'
import { TEMPLATE_CARDS, loadTemplateCatalog, templateThumb, type Recommendation, type TemplateCategory } from './HeightLabTemplates.ts'
import { TemplatePreview } from './TemplatePreview.tsx'

// HeightLab：术语分类暂不更新，先隐藏（数据保留，恢复时加回 '术语'）。
const TEMPLATE_TAGS = ['推荐', '文案', '图片', '视频', '办公', '更多'] as const
type TemplateTag = typeof TEMPLATE_TAGS[number]
const DEFAULT_MODE_KEY = 'heightlab.templateDockDefault'

function readDefaultMode(): 'open' | 'closed' {
  try {
    return localStorage.getItem(DEFAULT_MODE_KEY) === 'closed' ? 'closed' : 'open'
  } catch {
    return 'open'
  }
}

/** 读取可编辑输入框（textarea / input / contenteditable）的当前文本。 */
function editableValue(el: Element | null): string | null {
  if (el === null) return null
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value
  if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? ''
  return null
}

function FoldIcon({ folded }: { folded: boolean }) {
  return folded ? (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 设置图标（简洁双滑杆，非齿轮）：表示“模板区偏好”。 */
function DockSettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 5.5h11M2.5 10.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Render the tag row, the fold control, and the template/recommendation area. */
export function HeightLabTemplateDock() {
  const [active, setActive] = useState<TemplateTag>('推荐')
  const [cards, setCards] = useState<Record<TemplateCategory, Recommendation[]>>(TEMPLATE_CARDS)
  // 默认展开/关闭：从本地偏好读取，重启后按用户设置展示。
  const [defaultMode, setDefaultMode] = useState<'open' | 'closed'>(readDefaultMode)
  const [folded, setFolded] = useState(() => readDefaultMode() === 'closed')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Manus 式收起：输入框聚焦时内容向下滑出消失。
  const [retracted, setRetracted] = useState(false)
  const [preview, setPreview] = useState<{ item: Recommendation; tag: TemplateTag } | null>(null)

  // HeightLab：模板热更新——启动时拉取服务器目录，失败回退包内默认。
  useEffect(() => {
    let cancelled = false
    const reload = (): void => {
      void loadTemplateCatalog().then((catalog) => {
        if (!cancelled && catalog !== null) setCards(catalog)
      })
    }
    reload()
    // 企业版 M3（2026-08-28）：个人|企业切换后按新模式重拉目录
    //（企业模板在 loadTemplateCatalog 内按 hl.mode + orgId 合并）。
    window.addEventListener('hl:mode-changed', reload)
    return () => {
      cancelled = true
      window.removeEventListener('hl:mode-changed', reload)
    }
  }, [])

  // HeightLab：输入框智能体与模板标签联动——选图片专家→「图片」，
  // 视频专家→「视频」，文案专家→「文案」，其他→「推荐」。
  useEffect(() => {
    const PRESET_TAG: Record<string, TemplateTag> = {
      'image-generator': '图片',
      'video-producer': '视频',
      'content-creator': '文案',
    }
    const apply = (): void => {
      const preset = document.body.dataset.hlAgentPreset ?? ''
      setActive(PRESET_TAG[preset] ?? '推荐')
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-hl-agent-preset'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Manus 式收起：输入框有文字 → 内容滑出消失；文字删空 → 自动展开；
    // 点击空白时按当前文字状态决定（有文字保持收起，无文字展开）。
    const onInput = (event: Event): void => {
      const value = editableValue(event.target as Element | null)
      if (value !== null) setRetracted(value.trim() !== '')
    }
    const onFocusOut = (event: FocusEvent): void => {
      const target = event.target as Element | null
      const next = event.relatedTarget as Element | null
      // 焦点仍在输入框内：不动，等 input 事件决定。
      if (next !== null && editableValue(next) !== null) return
      const hadText = (editableValue(target) ?? '').trim() !== ''
      // 延迟确认：做同款时焦点会立刻回到输入框（fill-draft），
      // 回来后有文字就保持收起，不被 focusout(null) 覆盖展开。
      window.setTimeout(() => {
        const active = document.activeElement
        const activeValue = editableValue(active)
        if (activeValue !== null) {
          setRetracted(activeValue.trim() !== '')
          return
        }
        // 点击空白处：输入框有文字保持收起；无文字才展开。
        setRetracted(hadText)
      }, 0)
    }
    document.addEventListener('input', onInput, true)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const hidden = folded || retracted
  const contentClass = hidden
    ? (retracted ? css.contentRetracted : css.contentClosed)
    : css.contentOpen

  const sameOf = (item: Recommendation, tag: TemplateTag): void => {
    // 做同款：关闭预览，推荐区收起，切换对应专家，并把模板名以胶囊形式
    // 插入输入框文字区（Manus 式）；不发送，用户可继续输入。
    setPreview(null)
    setFolded(false)
    setRetracted(true)
    window.dispatchEvent(new CustomEvent('hl:use-template', {
      detail: {
        agentPreset: item.agent ?? (tag === '图片'
          ? 'image-generator'
          : tag === '视频' ? 'video-producer' : 'content-creator'),
        title: item.title,
      },
    }))
  }

  const settingsItems: MenuEntry[] = [
    { id: 'default-open', label: '默认展开' },
    { id: 'default-closed', label: '默认关闭' },
  ]
  const settingsTrigger = (
    <button
      type="button"
      className={css.settings}
      aria-label="模板区设置"
      aria-haspopup="menu"
      aria-expanded={settingsOpen}
      title="模板区设置"
      onClick={() => setSettingsOpen(value => !value)}
    >
      <DockSettingsIcon />
    </button>
  )

  return (
    <div className={css.dock}>
      <div className={css.pop}>
        <div className={css.tags}>
          {TEMPLATE_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              className={`${css.tag} ${active === tag ? css.tagActive : ''}`}
              aria-pressed={active === tag}
              onClick={() => {
                // HeightLab：「更多」直接打开「创意灵感」占位页面。
                if (tag === '更多') {
                  window.dispatchEvent(new CustomEvent('hl:open-hub', { detail: { page: 'inspiration' } }))
                  return
                }
                setActive(active === tag ? '推荐' : tag)
              }}
            >
              {tag}
            </button>
          ))}
          <button
            type="button"
            className={css.fold}
            aria-label={folded ? '展开模板' : '折叠模板'}
            aria-expanded={!folded}
            title={folded ? '展开模板' : '折叠模板'}
            onClick={() => setFolded(value => !value)}
          >
            <FoldIcon folded={folded} />
          </button>
          <Menu
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            items={settingsItems}
            selectedIds={[defaultMode === 'closed' ? 'default-closed' : 'default-open']}
            onSelect={(id) => {
              const next = id === 'default-closed' ? 'closed' : 'open'
              setSettingsOpen(false)
              setDefaultMode(next)
              setFolded(next === 'closed')
              try {
                localStorage.setItem(DEFAULT_MODE_KEY, next)
              } catch { /* 非致命 */ }
            }}
            anchor={settingsTrigger}
            portal
          />
        </div>

        <div className={`${css.content} ${contentClass}`}>
          {active !== '更多' && (
            <div className={css.scroll}>
              <div className={css.grid}>
                {cards[active].map(item => (
                  <button key={item.title} type="button" className={css.item} onClick={() => setPreview({ item, tag: active })}>
                    <img className={css.thumb} src={templateThumb(item)} alt="" draggable={false} />
                    <span className={css.itemTitle}>{item.title}</span>
                    <span className={css.itemDesc}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {preview !== null && (
        <TemplatePreview
          item={preview.item}
          onClose={() => setPreview(null)}
          onSame={() => sameOf(preview.item, preview.tag)}
        />
      )}
    </div>
  )
}
