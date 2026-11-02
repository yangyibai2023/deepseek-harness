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

/* HeightLab 外显模型倍率（flash=1.00× 锚点；未收录模型不显示角标） */
const EXTERNAL_MODEL_RATIOS: Record<string, string> = {
  hy3: '0.00×',
  'MiniMax-M3': '0.4×',
  'MiniMax-M3-highspeed': '0.4×',
  'MiniMax-M3.1-flash': '0.4×',
  'gpt-6-luna': '0.2×',
  'claude-sonnet-4-6': '0.32×',
  'claude-haiku-4-5-20251001': '0.4×',
  'gpt-5.6-luna': '0.4×',
  'glm-5.3-flash': '0.8×',
  'mimo-v2.6-flash': '0.8×',
  'MiniMax-M3.1': '0.8×',
  'LongCat-2.0': '0.8×',
  'LongCat-2.5': '0.8×',
  'gpt-6-sol': '1.2×',
  'gpt-6.1-sol': '1.2×',
  'gpt-5.6-terra': '1.2×',
  'doubao-seed-2.1-turbo': '1.2×',
  'qwen3.7-plus': '1.6×',
  'mimo-v2.6-pro': '1.6×',
  'deepseek-flash': '1.00×',
  'deepseek-v4-flash': '1.00×',
  'deepseek-v4.1-flash': '1.00×',
  'grok-4.5': '2×',
  'grok-4.6': '2×',
  'gpt-5.6-sol': '2.4×',
  'grok-4.7': '2.4×',
  'kimi-k2.7': '2.4×',
  'deepseek-v4-pro': '3×',
  'glm-5.2': '3.2×',
  'glm-5.3': '3.2×',
  'qwen3.7-max': '4×',
  'claude-sonnet-5': '4×',
  'claude-sonnet-5.5': '4×',
  'mimo-v2.5-pro': '1.6×',
  'gpt-5.4': '3×',
  'gpt-5.5': '3×',
  'claude-opus-4-6': '6×',
  'claude-opus-4-7': '6×',
  'claude-opus-4-8': '6×',
  'claude-opus-5': '6×',
  'claude-opus-5.5': '6×',
  'qwen3.8-max': '8×',
  'kimi-k3': '10×',
  'gpt-5.4-mini': '2×',
  'kimi-k2.6': '2.4×',
  'deepseek-v3.2': '3×',
  'gemini-3-flash': '0.8×',
  'gemini-3.1-pro': '3.2×',
  'gemini-3.5-flash': '0.8×',
  'glm-5.1': '3.2×',
  'glm-5-turbo': '0.8×',
}


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
  /* 2026-11-03（0.5.3 用户实测）：一级面板（模型列表）此前不限高——66 个模型
   * 直接溢出屏幕且 overflow:hidden 导致无法滚动，根本选不了下面的模型。
   * 二级厂商菜单早有 maxHeight:360 的同款处理，一级面板补齐：
   *   · 视口高度减去锚点上方空间与边距，至少 200、至多 520；
   *   · 由 .panel 的 overflow-y:auto 消化滚动。
   * 2026-11-03 晚（用户二次实测）：改为动态高度——
   *   · 模型少时，面板刚好包住所有模型（不浪费空间）；
   *   · 模型多时，面板在视口允许范围内尽量高（用户能感知可滑动）；
   *   · 估算：供应商头部 ~44px、模型行 ~34px/行、思考强度 ~86px、padding ~8px。
   * 2026-11-03 深夜（用户三次实测）：高度不再限制视口底部空间，
   * 让 useAnchoredPosition 自动翻转到上方。面板最大高度固定为 520px，
   * 模型少时自适应内容高度，模型多时固定 520px（可滚动）。 */
  const current = providers.find(provider => provider.id === currentProviderId) ?? providers[0]
  const models = current?.models ?? []
  const modelCount = models.length
  // 估算内容高度：供应商头部 + 模型行 + 思考强度 + padding
  const estimatedHeight = 44 + (modelCount * 34) + 86 + 8
  // 最大高度固定 520px，模型少时用内容高度（至少 200），模型多时用 520
  const panelMaxHeight = Math.max(200, Math.min(estimatedHeight, 520))
  useDismissOnOutsidePointer(rootRef, open, (next) => { if (!next) onClose() }, panelRef)

  if (!open) return null

  /* 二级厂商浮层的位置（2026-10-22 用户第三次校正）。
   *
   * ZCode 的实际做法是**弹在一级面板的右侧并排**，不是翻到上方叠在一起。
   * 我上一版用了 placeOverlay 的垂直 flip，结果面板被顶到上方、还与一级重叠，
   * 用户直接说「太丑了，而且重叠了」。
   *
   * 正确做法：横向挂载（side='right'）。placeOverlay 会：
   *   · 右侧放不下 → 自动翻到左侧（这就是用户说的「智能检测向左或向右弹」）
   *   · 垂直方向 顶对齐 → 底对齐 → 才 shift（不会飞到屏幕外）
   *   · 按可用空间限高
   *
   * 这里返回视口绝对坐标（浮层是 position:fixed 挂在 body 下）。
   */
  const providerMenuStyle = ((): CSSProperties => {
    const host = panelRef.current
    if (host === null) return {}
    const anchor = host.querySelector('button[aria-haspopup="menu"]')
    if (anchor === null) return {}
    const hostRect = host.getBoundingClientRect()
    const placement = placeOverlay({
      anchor: {
        top: hostRect.top, bottom: hostRect.bottom,
        left: hostRect.left, right: hostRect.right,
        width: hostRect.width, height: hostRect.height,
      },
      panel: { width: host.offsetWidth, height: 0 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      // 与一级面板同宽，挂在它的右侧（放不下自动翻左）。
      side: 'right',
      align: 'start',
      gap: 6,
      margin: 12,
      maxHeight: 360,
    })
    return {
      position: 'fixed',
      left: placement.left,
      top: placement.top,
      width: host.offsetWidth,
      maxHeight: placement.maxHeight ?? 360,
    }
  })()

  const panel = (
    <MenuSurface
      ref={panelRef}
      className={css.panel}
      style={{ ...(position ?? MEASURE_STYLE), maxHeight: panelMaxHeight }}
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
          onClick={() => { setPickingProvider(true) }}
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

      {/* ── 模型列表（中间可滚动区域）────────────────────────────── */}
      <div className={css.modelList}>
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
            {EXTERNAL_MODEL_RATIOS[model.id] !== undefined && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(127,127,127,0.75)', fontVariantNumeric: 'tabular-nums' }}>
                {EXTERNAL_MODEL_RATIOS[model.id]}
              </span>
            )}
            {model.badge !== undefined && <span className={css.badge}>{model.badge}</span>}
            {model.selected && <IconCheckOutlineRegular className={css.check} size={14} />}
          </button>
        ))}
      </div>

      {/* ── 思考强度（固定底部，不随模型列表滚动）────────────────── */}
      {effort !== undefined && effort.options.length > 0 && (
        <div className={css.effortBlockFixed}>
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
