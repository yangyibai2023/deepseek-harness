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
import { BRAND_SVG, BRAND_LETTER } from './brands.ts'

/* 模型倍率（2026-11-03 FIX-5/FIX-6）：改为**服务端下发**，不再硬编码。
 *
 * 背景：本文件曾硬编码 50 条倍率表，但——
 *   · 与真实成本脱节（gpt-5.6-sol 应 3.2× 写成 2.4×）
 *   · 18 款在售模型完全没有倍率（用户看到的角标时有时无）
 *   · 22 款无成本依据的模型仍在清单里（贵州折扣子渠道有货但公开价目表无价）
 *
 * 现在唯一权威源是服务端 `apps/server/src/services/commercial/modelWhitelist.ts`
 * （44 款白名单，倍率 = 贵州价目表倍率 ÷ 2.5，可逐条核对），
 * 客户端通过 `/hl/model-ratios` 拉取并缓存。
 *
 * 拉取失败时**不显示任何角标**（fail-closed）——宁可没有数字，也绝不显示错数字。
 */
const MODEL_RATIOS_TTL_MS = 60 * 60 * 1000
interface RatioModelMeta { intro?: string; recommend?: string }
let ratioCache: {
  at: number
  ratios: Record<string, number>
  unitPrices: Record<string, number>
  meta: Record<string, RatioModelMeta>
} | null = null
let ratioInflight: Promise<void> | null = null

/** 拉一次倍率（进程内缓存 1 小时；并发调用合并为一次请求）。 */
async function loadModelRatios(): Promise<void> {
  if (ratioCache !== null && Date.now() - ratioCache.at < MODEL_RATIOS_TTL_MS) return
  if (ratioInflight !== null) return ratioInflight
  ratioInflight = (async () => {
    try {
      const res = await fetch('/hl/model-ratios', { signal: AbortSignal.timeout(8000) })
      const data = await res.json() as {
        ok?: boolean
        models?: Array<{ id?: string; intro?: string; recommend?: string }>
        ratios?: Record<string, number>
        unitPrices?: Record<string, number>
      }
      if (data.ok === true && data.ratios !== undefined && typeof data.ratios === 'object') {
        const meta: Record<string, RatioModelMeta> = {}
        for (const m of data.models ?? []) {
          if (typeof m.id === 'string' && (m.intro !== undefined || m.recommend !== undefined)) {
            meta[m.id] = {
              ...(m.intro === undefined ? {} : { intro: m.intro }),
              ...(m.recommend === undefined ? {} : { recommend: m.recommend }),
            }
          }
        }
        ratioCache = { at: Date.now(), ratios: data.ratios, unitPrices: data.unitPrices ?? {}, meta }
      }
    } catch { /* 失败保持无缓存 → 不显示角标 */ }
    finally { ratioInflight = null }
  })()
  return ratioInflight
}

/** 取展示文案：只展示 token 模型的相对倍率（N×）。
 *
 * 2026-11-03（0.5.4 FIX-17，用户实测）：**绝不能展示单价**。
 * 之前对按张计费的图片模型显示「0.10 元/张」——那是我们的**上游采购成本**，
 * 属于商业机密。用户看到只会困惑（"为什么这里显示人民币？我的积分怎么算的？"），
 * 而且直接泄露成本结构。
 *
 * 现在：按张/按条模型**不显示任何数字**（它们本来也不该出现在对话选择器里，
 * 见 modelCategory 的分类修复）。 */
function ratioLabel(modelId: string): string | undefined {
  if (ratioCache === null) return undefined
  const ratio = ratioCache.ratios[modelId]
  return ratio === undefined ? undefined : `${ratio}×`
}

/** N3（0.5.7）：模型的介绍与推荐标记（服务端 /hl/model-ratios 下发）。 */
function modelMeta(modelId: string): RatioModelMeta | undefined {
  return ratioCache?.meta[modelId]
}

/** N3：供应商品牌标（SVG 品牌标 or 品牌色字母徽章）。 */
export function BrandMarkIcon({ providerId, size = 14 }: { providerId: string; size?: number }): ReactNode {
  const mark = BRAND_SVG[providerId]
  if (mark !== undefined) {
    return (
      <svg viewBox={mark.viewBox} width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
        <path d={mark.path} fill={mark.color} />
      </svg>
    )
  }
  const letter = BRAND_LETTER[providerId] ?? { color: '#9E9E9E', text: '?' }
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flex: 'none',
        background: letter.color, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.58), fontWeight: 700, lineHeight: 1,
      }}
    >{letter.text}</span>
  )
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
  /** N3（0.5.7）：HoverCard 介绍 + 推荐标记（服务端下发）。 */
  readonly intro?: string
  readonly recommend?: string
}

export interface EffortEntry {
  readonly key: string
  readonly label: string
}

export function ModelPickerPanel({
  anchorRef, rootRef, open, onClose, ariaLabel, providers, currentProviderId,
  emptyLabel, onPickModel, onPreviewProvider, previewProviderId, effort, onPickEffort, effortTitle,
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
  /** 旧语义（点厂商落第一个型号）已并入行点击的 onPickModel 直落路径。 */
  readonly onPickProvider?: (providerId: string) => void
  /** N3（0.5.7 用户拍板）：悬浮供应商=模型列表即时预览切换（点击仍确认）。 */
  readonly onPreviewProvider?: (providerId: string | undefined) => void
  readonly previewProviderId?: string | undefined
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

  /* 打开时拉一次倍率（服务端下发，FIX-5/FIX-6）。
   * 拉到后 setRatioReady 触发重渲染，角标才出现；拉不到就不显示角标。 */
  const [, setRatioReady] = useState(0)
  useEffect(() => {
    if (!open) return
    let alive = true
    void loadModelRatios().then(() => { if (alive) setRatioReady(n => n + 1) })
    return () => { alive = false }
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
  /* N3：悬浮供应商=预览切换（模型列表即时跟随；current 仍是已确认供应商）。 */
  const previewed = onPreviewProvider === undefined
    ? current
    : providers.find(provider => provider.id === previewProviderId) ?? current
  const models = previewed?.models ?? []
  /* N3 v2（用户反馈「黑色长条飞出屏+丑」）：HoverCard 原生 compact 定位是
   * 「锚点右侧」且无视口钳制——模型行在面板右缘必飞出。改面板内自绘受控卡：
   * 固定 244px 深色卡（原生 HoverCard compact 同观感），锚在行的左侧
   * （面板贴屏幕右缘，左侧必有空间），top 随行、视口钳制。 */
  const [hoverCard, setHoverCard] = useState<{
    name: string
    intro: string
    ratio?: string | undefined
    recommend?: string | undefined
    top: number
    left: number
  } | null>(null)
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelMenuClose = (): void => {
    if (menuCloseTimerRef.current !== null) {
      window.clearTimeout(menuCloseTimerRef.current)
      menuCloseTimerRef.current = null
    }
  }
  const scheduleMenuClose = (onPreviewProvider?: (providerId: string | undefined) => void): void => {
    menuCloseTimerRef.current = window.setTimeout(() => {
      setPickingProvider(false)
      onPreviewProvider?.(undefined)
    }, 150)
  }
  const showHoverCard = (model: ModelRowEntry, element: HTMLElement): void => {
    const meta = modelMeta(model.id)
    if (meta?.intro === undefined) { setHoverCard(null); return }
    const row = element.getBoundingClientRect()
    const host = rootRef.current?.getBoundingClientRect()
    const width = 232
    const estHeight = 108
    const gap = 10
    const hostLeft = host?.left ?? 0
    const left = Math.max(8, hostLeft - width - gap)
    /* 与悬浮行垂直居中对齐（用户截图确认的形态），上下视口钳制。 */
    const top = Math.max(8, Math.min(
      row.top + row.height / 2 - estHeight / 2,
      window.innerHeight - estHeight - 8,
    ))
    setHoverCard({
      name: model.label,
      intro: meta.intro,
      ...(ratioLabel(model.id) === undefined ? {} : { ratio: ratioLabel(model.id) }),
      ...(meta.recommend === undefined ? {} : { recommend: meta.recommend }),
      top, left,
    })
  }
  /* 2026-11-03 深夜四修（用户第四次实测「App 里还是溢出屏幕」）：
   *
   * 前三修的错误：把 maxHeight 算成「视口 × 0.7，封顶 520」这个**固定值**，
   * 完全没看锚点在屏幕的哪个位置。当输入框靠近窗口底部（或窗口本身很矮）时，
   * 锚点下方只剩 200~300px，却给了 520 → 面板必然伸出屏幕外，
   * 第三段「思考强度」被挤到看不见（用户截图实证）。
   *
   * 正确做法：**按锚点两侧的真实可用空间限高**——
   *   spaceBelow = 视口高 − 锚点底 − 边距
   *   spaceAbove = 锚点顶 − 边距
   *   available  = max(spaceBelow, spaceAbove)   ← useAnchoredPosition 会翻到空间大的一侧
   *   panelMaxHeight = clamp(available, 240, min(视口×0.7, 520))
   *
   * 注意：useAnchoredPosition 只返回 { left, top }（见该 hook 的注释：
   * 「限高由调用方按需自行应用」），所以这里必须自己算，不能指望它。
   *
   * 另外 CSS 里有 `max-height: calc(100vh - 24px)` 兜底，防止本计算失效时再次溢出。 */
  const panelMaxHeight = ((): number => {
    if (typeof window === 'undefined') return 520
    const viewportH = window.innerHeight
    const margin = 12
    const anchor = anchorRef.current?.getBoundingClientRect()
    const spaceBelow = anchor === undefined
      ? viewportH - margin * 2
      : viewportH - anchor.bottom - margin
    const spaceAbove = anchor === undefined ? viewportH - margin * 2 : anchor.top - margin
    const available = Math.max(spaceBelow, spaceAbove)
    const ceiling = Math.max(240, Math.min(Math.round(viewportH * 0.7), 520))
    return Math.max(240, Math.min(available, ceiling))
  })()
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
      onClick={(event) => {
        event.stopPropagation()
        /* N3 v3（用户反馈）：点空白=未做选择 → 预览回退当前，不再停留悬浮过的厂商。 */
        onPreviewProvider?.(undefined)
      }}
    >
      {/* ── 一级：当前厂商详情 ───────────────────────────────────────── */}
      <div className={css.providerHeaderWrap}>
        <button
          type="button"
          className={css.providerHeader}
          aria-haspopup="menu"
          aria-expanded={pickingProvider}
          aria-label={`切换厂商，当前 ${current?.label ?? ''}`}
          onMouseEnter={() => {
            setPickingProvider(true)
            cancelMenuClose()
          }}
          onMouseLeave={() => { scheduleMenuClose(onPreviewProvider) }}
          onClick={() => { setPickingProvider(true) }}
        >
          {/* N3 v2（用户反馈）：悬浮预览时表头名字/logo 跟随预览供应商。 */}
          {previewed !== undefined && <BrandMarkIcon providerId={previewed.id} size={16} />}
          <span className={css.providerName}>{previewed?.label ?? ''}</span>
          <span className={css.badge}>API</span>
          <IconChevronRightOutlineRegular className={css.chevron} size={12} />
        </button>

        {/* 二级：所有供应商。
         * 位置由 placeOverlay 决定 —— 一级面板贴底时，向下展开会超出视口
         * （实测 bottom=741 / 视口 720），所以这里同样要 flip + 限高。 */}
        {pickingProvider && (
          <div
            onMouseEnter={() => { cancelMenuClose() }}
            onMouseLeave={() => {
              setPickingProvider(false)
              onPreviewProvider?.(undefined)
            }}
            className={css.providerMenu}
            role="menu"
            aria-label="选择厂商"
            style={providerMenuStyle}
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
                  /* N3 v2（用户反馈「点了供应商一级没跟着变」）：供应商行点击改为
                   * 直落该厂商第一个型号——走与模型行相同的 onPickModel 提交路径，
                   * 表头/触发器/选中态全链联动，不再依赖 onPickProvider 的旧语义。 */
                  const first = provider.models[0]
                  if (first !== undefined) onPickModel(provider.id, first.id)
                  onPreviewProvider?.(provider.id)
                  setPickingProvider(false)
                }}
                onMouseEnter={() => { onPreviewProvider?.(provider.id) }}
              >
                <BrandMarkIcon providerId={provider.id} />
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
            onMouseEnter={(event) => { showHoverCard(model, event.currentTarget) }}
            onMouseLeave={() => { setHoverCard(null) }}
            onClick={() => { if (previewed !== undefined) onPickModel(previewed.id, model.id) }}
          >
            <span className={css.modelName}>{model.label}</span>
            {(() => {
              const rec = modelMeta(model.id)?.recommend
              const recColor: Record<string, string> = {
                最热: '#E5533D', 最省: '#1F9D55', 最强: '#7C5CFF', 推荐: '#2B7FFF',
              }
              return rec === undefined
                ? null
                : (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, lineHeight: '16px',
                    padding: '0 6px', borderRadius: 6,
                    color: recColor[rec] ?? '#666', background: `${recColor[rec] ?? '#666'}1A`,
                  }}>{rec}</span>
                )
            })()}
            {(() => {
              const label = ratioLabel(model.id)
              return label === undefined
                ? null
                : (
                  <span style={{ marginLeft: modelMeta(model.id)?.recommend === undefined ? 'auto' : 6, fontSize: 12, color: 'rgba(127,127,127,0.75)', fontVariantNumeric: 'tabular-nums' }}>
                    {label}
                  </span>
                )
            })()}
            {model.badge !== undefined && <span className={css.badge}>{model.badge}</span>}
            {model.selected && <IconCheckOutlineRegular className={css.check} size={14} />}
          </button>
        ))}
      </div>

      {/* ── 思考强度（固定底部，不随模型列表滚动）──────────────────
       * 2026-11-03（用户实测「三段式时好时坏」根治）：原来整块是条件渲染
       * （effort === undefined 就不渲染），而 effort 由模型目录的 reasoning
       * 能力推导——目录尚未加载 / 该型号暂无能力数据时为 undefined。
       * 于是同一台机器上：目录就绪时是三段式，未就绪时退化成两段（且用户
       * 感觉「模型列表溢出、不能滑」）。布局必须在任何加载态下都稳定。
       * 现在改为**永远渲染**第三段：无档位数据时显示禁用的占位行，
       * 高度与真实滑块一致，形状恒定。 */}
      <div className={css.effortBlockFixed}>
        <div className={css.effortHead} role="presentation">
          <span className={css.effortTitle}>{effortTitle}</span>
          <span className={css.effortCurrent}>
            {effort !== undefined ? effortCurrent : '—'}
          </span>
        </div>
        {effort !== undefined && effort.options.length > 0
          ? (
            <EffortSlider
              options={effort.options}
              value={effort.value}
              levelIndex={effort.index}
              onChange={onPickEffort}
              disabled={locked}
              ariaLabel={effortTitle}
            />
          )
          : (
            <div className={css.effortPending} role="presentation">
              当前模型暂无思考强度设置
            </div>
          )}
      </div>
    </MenuSurface>
  )

  // ⚠️ 必须 portal 到 body：面板留在 composer 的 DOM 里会被父级 stacking
  // context 困住，右侧被上层元素盖住（用户实测的白条）。
  return createPortal(
    <>
      {panel}
      {/* N3 v2：模型介绍卡（受控定位，深色 compact 观感，出现在面板左侧）。 */}
      {hoverCard !== null && createPortal(
        <div
          style={{
            position: 'fixed', zIndex: 1201, width: 244,
            left: hoverCard.left, top: hoverCard.top,
            padding: '12px 16px', borderRadius: 'var(--dsw-radius-lg, 12px)',
            background: '#2C2C2E', color: '#fff',
            boxShadow: 'var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,0.3))',
            fontSize: 12, lineHeight: 1.6,
          }}
          role="tooltip"
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{hoverCard.name}</div>
          <div>{hoverCard.intro}</div>
          {hoverCard.ratio !== undefined && (
            <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.6)' }}>
              倍率 {hoverCard.ratio}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>,
    document.body,
  )
}
