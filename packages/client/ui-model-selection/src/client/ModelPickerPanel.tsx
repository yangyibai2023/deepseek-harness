/**
 * 模型选择面板（2026-10-22 用户拍板·照 ZCode 截图·三次校准）。
 *
 * 用户澄清的层级（关键，前两版都理解错）：
 *   「点击一下先弹出菜单。最上面悬浮的是『选厂商』——但**只显示当前选中的
 *     那个供应商**（比如 DeepSeek API ›）。只有鼠标悬浮/点击那行，才会展开
 *     所有供应商的列表。选中之后，在下方一级菜单里选该厂商的模型和思考程度。」
 *
 * 所以：
 *   一级面板（默认）              点顶部供应商行 → 二级浮层
 *   ┌──────────────────┐        ┌──────────────────┐
 *   │ 📦 DeepSeek API ›│ ─────► │ ○ OpenAI         │
 *   │ 模型              │        │ ○ DeepSeek    ✓  │
 *   │ deepseek-flash ✓  │ ◄───── │ ○ Anthropic      │
 *   │ deepseek-v4-pro   │  选中   │ ○ …              │
 *   │ 思考强度     最高  │        │ 管理模型          │
 *   │ ●━━━━━━━━━━━○    │        └──────────────────┘
 *   └──────────────────┘
 *
 * 另外两件事必须一起做：
 *   · **整个面板 portal 到 body**。`MenuSurface` 只 portal 了它的 backing 层，
 *     面板本身留在 composer 的 DOM 里 —— 会被父级 stacking context 困住，
 *     右侧被上层元素盖住（用户截图里那道白色竖条）。
 *   · 滑块颜色**随档位增长**：轨道是「绿→青→蓝」完整渐变，只揭示到圆点位置。
 *     关闭 = 全灰；低 = 一小段绿；高 = 绿到青；最高 = 整条彩带 + 流动动效。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCheckOutlineRegular, IconChevronRightOutlineRegular,
  MenuSurface, placeOverlay, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, RefObject } from 'react'
import { EffortSlider } from './EffortSlider.tsx'
import css from './ModelPickerPanel.module.css'

/** 面板首帧先隐藏量尺寸，避免闪到屏幕外（与 Menu portal 同一做法）。 */
const MEASURE_STYLE = { visibility: 'hidden' as const, left: 0, top: 0 }

export interface ProviderEntry {
  readonly id: string
  readonly label: string
  readonly models: readonly ModelRowEntry[]
}

export interface ModelRowEntry {
  readonly id: string
  readonly label: string
  readonly selected: boolean
  readonly badge?: string
}

export interface EffortEntry {
  readonly key: string
  readonly label: string
}

export function ModelPickerPanel({
  anchorRef, rootRef, open, onClose, ariaLabel, providers, currentProviderId,
  emptyLabel, onPickModel, onPickProvider, effort, onPickEffort, effortTitle,
  effortCurrent, manageLabel, locked = false,
}: {
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly rootRef: RefObject<HTMLElement | null>
  readonly open: boolean
  readonly onClose: () => void
  readonly ariaLabel: string
  readonly providers: readonly ProviderEntry[]
  readonly currentProviderId: string | undefined
  readonly emptyLabel: ReactNode
  readonly onPickModel: (providerId: string, modelId: string) => void
  /** 在二级里选了另一个厂商（切过去并把面板回到一级）。 */
  readonly onPickProvider: (providerId: string) => void
  /** 当前型号的思考档位；undefined 表示该型号不支持（不显示滑块）。 */
  readonly effort: {
    readonly options: readonly EffortEntry[]
    readonly value: string | undefined
    readonly label: string
    /** 档位序号（0 = 关闭），驱动滑块配色。 */
    readonly index: number
  } | undefined
  readonly onPickEffort: (key: string) => void
  readonly effortTitle: string
  /** 「思考强度」标题右侧的当前档位名。 */
  readonly effortCurrent: string
  readonly manageLabel: string
  readonly locked?: boolean
}): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** 二级：是否展开「所有供应商」浮层。 */
  const [pickingProvider, setPickingProvider] = useState(false)

  // 每次关闭都收起二级浮层：下次打开看到的是当前厂商详情。
  useEffect(() => {
    if (!open) setPickingProvider(false)
  }, [open])

  const position = useAnchoredPosition({
    open, anchorRef, panelRef, side: 'bottom', align: 'start', gap: 4, margin: 12,
  })
  useDismissOnOutsidePointer(rootRef, open, (next) => { if (!next) onClose() }, panelRef)

  if (!open) return null

  /* 二级厂商浮层的位置：以一级面板的厂商行为锚点，用同一套 placeOverlay
   * 决定朝上还是朝下，并按可用空间限高。贴底时翻到锚点上方。 */
  const providerMenuStyle = ((): CSSProperties => {
    const host = panelRef.current
    if (host === null) return {}
    const anchor = host.querySelector('button[aria-haspopup="menu"]')
    if (anchor === null) return {}
    const ar = anchor.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const placement = placeOverlay({
      // 面板宽度 = 一级面板宽度（两者同宽，视觉上是同一张卡片展开）。
      anchor: { top: ar.top, bottom: ar.bottom, left: ar.left, right: ar.right, width: ar.width, height: ar.height },
      panel: { width: host.offsetWidth, height: 0 },
      viewport,
      side: 'bottom',
      align: 'start',
      gap: 2,
      margin: 12,
      maxHeight: 320,
    })
    return {
      // 相对厂商行的偏移：placeOverlay 给的是视口坐标，这里换算成相对定位。
      top: placement.side === 'bottom' ? ar.height + 2 : 'auto',
      bottom: placement.side === 'bottom' ? 'auto' : ar.height + 2,
      left: 0,
      right: 0,
      maxHeight: placement.maxHeight ?? 320,
    }
  })()

  const current = providers.find(provider => provider.id === currentProviderId) ?? providers[0]
  const models = current?.models ?? []

  const panel = (
    <MenuSurface
      ref={panelRef}
      className={css.panel}
      style={position ?? MEASURE_STYLE}
      role="menu"
      aria-label={ariaLabel}
      onClick={(event) => { event.stopPropagation() }}
    >
      {/* ── 一级：当前厂商详情 ───────────────────────────────────────── */}
      <div className={css.providerHeaderWrap}>
        <button
          type="button"
          className={css.providerHeader}
          aria-haspopup="menu"
          aria-expanded={pickingProvider}
          aria-label={`切换厂商，当前 ${current?.label ?? ''}`}
          onMouseEnter={() => { setPickingProvider(true) }}
          onClick={() => { setPickingProvider(prev => !prev) }}
        >
          <span className={css.dot} aria-hidden="true" />
          <span className={css.providerName}>{current?.label ?? ''}</span>
          <span className={css.badge}>API</span>
          <IconChevronRightOutlineRegular className={css.chevron} size={12} />
        </button>

        {/* 二级：所有供应商。
         * 位置由 placeOverlay 决定 —— 一级面板贴底时，向下展开会超出视口
         * （实测 bottom=741 / 视口 720），所以这里同样要 flip + 限高。 */}
        {pickingProvider && (
          <div
            className={css.providerMenu}
            role="menu"
            aria-label="选择厂商"
            style={providerMenuStyle}
            onMouseLeave={() => { setPickingProvider(false) }}
          >
            {providers.length === 0 && <div className={css.empty} role="presentation">{emptyLabel}</div>}
            {providers.map(provider => (
              <button
                key={provider.id}
                type="button"
                role="menuitem"
                className={css.providerRow}
                aria-selected={provider.id === currentProviderId}
                onClick={() => {
                  onPickProvider(provider.id)
                  setPickingProvider(false)
                }}
              >
                <span className={css.dot} aria-hidden="true" />
                <span className={css.providerName}>{provider.label}</span>
                <span className={css.badge}>API</span>
                {provider.id === currentProviderId && <IconCheckOutlineRegular className={css.check} size={14} />}
              </button>
            ))}
            <div className={css.footer} role="presentation">{manageLabel}</div>
          </div>
        )}
      </div>

      {/* ── 模型列表 ──────────────────────────────────────────────── */}
      <div className={css.sectionTitle} role="presentation">模型</div>
      {models.map(model => (
        <button
          key={model.id}
          type="button"
          role="menuitem"
          className={css.modelRow}
          aria-selected={model.selected}
          onClick={() => { if (current !== undefined) onPickModel(current.id, model.id) }}
        >
          <span className={css.modelName}>{model.label}</span>
          {model.badge !== undefined && <span className={css.badge}>{model.badge}</span>}
          {model.selected && <IconCheckOutlineRegular className={css.check} size={14} />}
        </button>
      ))}

      {/* ── 思考强度（滑块）────────────────────────────────────────── */}
      {effort !== undefined && effort.options.length > 0 && (
        <div className={css.effortBlock}>
          <div className={css.effortHead} role="presentation">
            <span className={css.effortTitle}>{effortTitle}</span>
            <span className={css.effortCurrent}>{effortCurrent}</span>
          </div>
          <EffortSlider
            options={effort.options}
            value={effort.value}
            levelIndex={effort.index}
            onChange={onPickEffort}
            disabled={locked}
            ariaLabel={effortTitle}
          />
        </div>
      )}
    </MenuSurface>
  )

  // ⚠️ 必须 portal 到 body：面板留在 composer 的 DOM 里会被父级 stacking
  // context 困住，右侧被上层元素盖住（用户实测的白条）。
  return createPortal(panel, document.body)
}
