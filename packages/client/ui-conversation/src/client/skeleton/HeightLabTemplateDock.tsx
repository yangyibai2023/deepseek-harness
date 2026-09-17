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

import { useEffect, useState, type CSSProperties } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './HeightLabTemplateDock.module.css'
import {
  TEMPLATE_CARDS,
  getEnterpriseDock,
  loadTemplateCatalog,
  sameTemplateText,
  templateThumb,
  type EnterpriseDockData,
  type Recommendation,
  type TemplateCategory,
} from './HeightLabTemplates.ts'
import { TemplatePreview } from './TemplatePreview.tsx'

// HeightLab：术语分类暂不更新，先隐藏（数据保留，恢复时加回 '术语'）。
const TEMPLATE_TAGS = ['推荐', '文案', '图片', '视频', '办公', '更多'] as const
type TemplateTag = typeof TEMPLATE_TAGS[number]
// HeightLab 2026-08-29（企业版 M6）：企业模式标签行最左侧加「专属」，
// 展示本企业定制模板；个人模式保持六标签不变。
const EXCLUSIVE_TAG = '专属'
type DockTag = TemplateTag | typeof EXCLUSIVE_TAG
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

/** 智能体预设 → 模板标签联动表（模块级，目录加载与属性监听共用）。 */
const PRESET_TAG: Record<string, TemplateTag> = {
  'image-generator': '图片',
  'video-producer': '视频',
  'content-creator': '文案',
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
  const [active, setActive] = useState<DockTag>('推荐')
  const [cards, setCards] = useState<Record<TemplateCategory, Recommendation[]>>(TEMPLATE_CARDS)
  // M6：企业模式上下文（专属栏条目 + 品牌）；个人模式为 null。
  const [enterprise, setEnterprise] = useState<EnterpriseDockData | null>(null)
  // 默认展开/关闭：从本地偏好读取，重启后按用户设置展示。
  const [defaultMode, setDefaultMode] = useState<'open' | 'closed'>(readDefaultMode)
  const [folded, setFolded] = useState(() => readDefaultMode() === 'closed')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Manus 式收起：输入框聚焦时内容向下滑出消失。
  const [retracted, setRetracted] = useState(false)
  const [preview, setPreview] = useState<{ item: Recommendation; tag: DockTag } | null>(null)

  // HeightLab：输入框智能体与模板标签联动——选图片专家→「图片」，
  // 视频专家→「视频」，文案专家→「文案」；无联动时回落模式默认
  //（企业=「专属」，个人=「推荐」）。
  const modeFallback = (): DockTag =>
    (getEnterpriseDock() !== null ? EXCLUSIVE_TAG : '推荐')

  // HeightLab：模板热更新——启动时拉取服务器目录，失败回退包内默认。
  useEffect(() => {
    let cancelled = false
    const reload = (): void => {
      void loadTemplateCatalog().then((catalog) => {
        if (cancelled || catalog === null) return
        setCards(catalog)
        // M6：目录加载后同步企业上下文；切到企业默认选中「专属」，
        // 切回个人时「专属」标签消失、active 回落「推荐」。
        const dock = getEnterpriseDock()
        setEnterprise(dock)
        setActive((prev) => {
          const preset = document.body.dataset.hlAgentPreset ?? ''
          const linked = PRESET_TAG[preset]
          if (linked !== undefined) return linked
          if (dock !== null) return EXCLUSIVE_TAG
          return prev === EXCLUSIVE_TAG ? '推荐' : prev
        })
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

  // 智能体预设联动（优先级高于模式默认）：选图片专家仍跳「图片」。
  useEffect(() => {
    const apply = (): void => {
      const preset = document.body.dataset.hlAgentPreset ?? ''
      setActive(PRESET_TAG[preset] ?? modeFallback())
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

  const sameOf = (item: Recommendation, tag: DockTag): void => {
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
    // HeightLab（2026-09-17 营销控制台试点）：做同款直接发送 + 打开右侧创作控制台。
    window.dispatchEvent(new CustomEvent('hl:send-template', {
      detail: { text: sameTemplateText(item) },
    }))
    window.dispatchEvent(new CustomEvent('hl:open-console'))
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

  // M6：企业模式标签行 = 专属 + 原六标签；个人模式保持现状。
  const visibleTags: DockTag[] = enterprise !== null
    ? [EXCLUSIVE_TAG, ...TEMPLATE_TAGS]
    : [...TEMPLATE_TAGS]
  const brandColor = enterprise?.branding?.themeColor ?? null
  const dockStyle = brandColor !== null
    ? ({ '--hl-brand': brandColor } as CSSProperties)
    : undefined

  return (
    <div className={css.dock} style={dockStyle}>
      <div className={css.pop}>
        <div className={css.tags}>
          {visibleTags.map(tag => (
            <button
              key={tag}
              type="button"
              className={`${css.tag} ${active === tag ? css.tagActive : ''} ${
                active === tag && tag === EXCLUSIVE_TAG && brandColor !== null ? css.tagExclusiveActive : ''
              }`}
              aria-pressed={active === tag}
              onClick={() => {
                // HeightLab：「更多」直接打开「创意灵感」占位页面。
                if (tag === '更多') {
                  window.dispatchEvent(new CustomEvent('hl:open-hub', { detail: { page: 'inspiration' } }))
                  return
                }
                setActive(active === tag ? modeFallback() : tag)
              }}
            >
              {tag === EXCLUSIVE_TAG && enterprise?.branding?.logoUrl != null && (
                <img className={css.tagLogo} src={enterprise.branding.logoUrl} alt="" draggable={false} />
              )}
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
          {active === EXCLUSIVE_TAG && enterprise !== null && (
            <div className={css.scroll}>
              {enterprise.exclusive.length === 0 ? (
                // M6 空态：无专属模板或全部因权限不可见时同文案（不泄露存在性）。
                <div className={css.empty}>管理员还没有配置专属模板</div>
              ) : (
                <div className={css.grid}>
                  {enterprise.exclusive.map(item => (
                    <button key={`${item.sourceCategory}:${item.title}`} type="button" className={css.item} onClick={() => setPreview({ item, tag: EXCLUSIVE_TAG })}>
                      <img className={css.thumb} src={templateThumb(item)} alt="" draggable={false} />
                      <span className={css.itemTitle}>
                        {item.title}
                        <span className={css.itemCat}>{item.sourceCategory}</span>
                      </span>
                      <span className={css.itemDesc}>{item.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {active !== '更多' && active !== EXCLUSIVE_TAG && (
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
