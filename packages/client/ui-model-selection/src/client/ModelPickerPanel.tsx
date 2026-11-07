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
  /* O6-乱弹·两幕（2026-11-08 用户视频 + 侦听日志实锤 + 用户复测补刀）：
   *
   * 第一幕：供应商菜单的定位在**每次渲染**都重算（getBoundingClientRect +
   * placeOverlay）。悬停供应商行会切换预览 -> 左侧模型列表行数变化 -> 一级
   * 面板高度变化 -> useAnchoredPosition 重算锚定（可能翻转）-> 本菜单重渲染
   * 时 placeOverlay 算出**不同的 top**（实测 top 224 -> 368 瞬移 144px）->
   * 鼠标瞬间在容器外 -> mouseleave -> 150ms 后整个菜单关闭 = 「乱弹」。
   *
   * 第二幕（第一幕的修法引入，用户复测「首次打开必弹左上角，重开才正确」
   * 暴露）：「算一次并冻结」被放进了 render 里的 IIFE——它在**每一帧**都跑
   * （不管二级有没有展开）。而一级面板自己的锚定坐标（position）要到第二个
   * 渲染帧才由 useAnchoredPosition 算出，首帧面板挂在 MEASURE_STYLE
   * （visibility:hidden + left/top:0 = **视口原点**）。IIFE 在 position 就绪的
   * 那一帧读 getBoundingClientRect，读到的仍是上一帧提交的 MEASURE 位置，
   * 把「视口原点右侧挂载」的垃圾坐标冻结进缓存。用户截图的数值指纹完全吻合：
   * 菜单左缘 ≈ 204px = 面板宽 198 + gap 6，顶缘 = 0。
   *
   * 终修（三重保险，铲掉「读面板实时 rect」这颗时序炸弹）：
   *   ① 锚点几何一律取 useAnchoredPosition 已算好的 position（源自触发按钮
   *      的 rect——触发按钮常驻 DOM、位置稳定）+ 面板 offsetWidth/offsetHeight
   *      （布局尺寸，与定位无关）——**不读面板自身的实时 rect**；
   *   ② position 未就绪（null）时返回隐藏样式，**绝不冻结**；
   *   ③ 缓存以「锚定坐标 + 面板宽」为键：面板位置一变（重开/翻转/滚动/缩放
   *      都会让 hook 重算 position）缓存自动失效重算，菜单正确跟随面板；
   *      位置不变则复用，预览切换不再引起任何移动（第一幕的修法目的保留）。 */
  const providerMenuStyleRef = useRef<CSSProperties | null>(null)
  const providerMenuKeyRef = useRef('')
  /* O6-弹跳·第三幕（2026-11-08 用户录屏逐帧实锤）：第二幕修完后「大部分时候
   * 没问题」但仍在弹跳——录屏 f-001 帧有面板+菜单整体瞬移的重影，且光标停驻
   * 不动时预览在两厂商间来回翻转（反馈环）。机制：面板翻到触发器**上方**时
   * （贴底锚定：bottom=锚点顶-gap），useAnchoredPosition 的 place() 每次按
   * 「当前内容高度」重算 top —— 预览切换改变模型行数 → 面板高度变 → top 移
   * → 二级菜单键(left,top,width)失效跟随 → 菜单在光标下移位 → mouseenter
   * 打到另一行 → 预览再切 → 高度再变 → **振荡环**。修法：上方翻转形态把
   * top **钉在打开时刻**（锚点未动则 top 恒定），maxHeight 同步钉为「钉住的
   * top 到触发器的距离」——内容变高改走列表内部滚动，不再推着面板跑；
   * 下方展开（未翻转）形态 top 本就钉在锚点下方，无需处理。 */
  const panelTopPinRef = useRef<{ anchorTop: number; top: number } | null>(null)

  // 每次关闭都收起二级浮层：下次打开看到的是当前厂商详情；顶部钉住同步失效
  //（下次打开按当时锚点重新钉）。
  useEffect(() => {
    if (!open) {
      setPickingProvider(false)
      panelTopPinRef.current = null
    }
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
    right: number
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
    /* N3 v5（用户反馈「覆盖了一点」）：参照物必须是**选择器面板**（panelRef），
    /* N3 v6（用户反馈「覆盖面板左缘」）：**右锚定**——卡右缘钉死在面板左缘
     * - 10px（与卡自身宽度无关，数学上不可能再压边）；参照物=panelRef。 */
    const host = panelRef.current?.getBoundingClientRect()
    const estHeight = 108
    const top = Math.max(8, Math.min(
      row.top + row.height / 2 - estHeight / 2,
      window.innerHeight - estHeight - 8,
    ))
    const rightOffset = host === undefined
      ? Math.max(8, window.innerWidth - row.right)
      : Math.max(8, window.innerWidth - host.left + 10)
    setHoverCard({
      name: model.label,
      intro: meta.intro,
      ...(ratioLabel(model.id) === undefined ? {} : { ratio: ratioLabel(model.id) }),
      ...(meta.recommend === undefined ? {} : { recommend: meta.recommend }),
      top, right: rightOffset,
    })
  }
  /* N3 v7（0.5.7 用户实测：二级菜单里鼠标快速上下滑动「闪来闪去」）：
   * 根因三条，收敛为「hover 驱动的 setState 全部 rAF 合帧」+「关闭路径统一」：
   *   ① 供应商行 onMouseEnter 每行直呼 setPreviewProviderId——快速滑动时每秒
   *      十几次全面板 reconcile，表头 logo/名字反复切换；
   *   ② 二级菜单自身 onMouseLeave 是**立即卸载**（表头路径却有 150ms 延迟），
   *      滑出边缘又扫回 = 二级整棵 DOM 卸载→重建，直接闪没再闪出；
   *   ③ 模型行介绍卡 enter/leave 都立即 setState，高频挂卸。
   * 修法：预览与介绍卡各走一个「最后写入 wins」的 rAF 合帧——一帧内多次
   * enter/leave 只产生最终态的一次 setState；二级菜单离开统一走
   * scheduleMenuClose（150ms，进入即 cancel），扫出又扫回不再重建。
   * 用户显式动作（点击选中）不经合帧，立即生效。 */
  const hoverPreviewFrameRef = useRef<number | null>(null)
  const hoverPreviewValueRef = useRef<string | undefined>(undefined)
  const hoverCardFrameRef = useRef<number | null>(null)
  const hoverCardPendingRef = useRef<{ model: ModelRowEntry; element: HTMLElement } | null>(null)
  const scheduleHoverPreview = (providerId: string | undefined): void => {
    hoverPreviewValueRef.current = providerId
    if (hoverPreviewFrameRef.current !== null) return
    hoverPreviewFrameRef.current = window.requestAnimationFrame(() => {
      hoverPreviewFrameRef.current = null
      onPreviewProvider?.(hoverPreviewValueRef.current)
    })
  }
  const scheduleHoverCard = (model: ModelRowEntry | null, element?: HTMLElement): void => {
    hoverCardPendingRef.current = model === null || element === undefined ? null : { model, element }
    if (hoverCardFrameRef.current !== null) return
    hoverCardFrameRef.current = window.requestAnimationFrame(() => {
      hoverCardFrameRef.current = null
      const pending = hoverCardPendingRef.current
      if (pending === null) { setHoverCard(null); return }
      showHoverCard(pending.model, pending.element)
    })
  }
  /* 卸载时撤销未 flush 的帧，防止对已卸载组件 setState（React 18 虽不再告警，
   * 但合帧回调里读 ref/props 仍是无谓开销）。 */
  useEffect(() => () => {
    if (hoverPreviewFrameRef.current !== null) window.cancelAnimationFrame(hoverPreviewFrameRef.current)
    if (hoverCardFrameRef.current !== null) window.cancelAnimationFrame(hoverCardFrameRef.current)
  }, [])
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

  /* 一级面板的最终定位样式（2026-11-08 O6 第三幕：上方翻转形态钉 top）。
   * 下方展开：hook 的 top 本就钉在锚点下方（top=锚点底+gap），原样透传；
   * 上方翻转：hook 的 top=锚点顶-gap-当前高度，随内容高度漂移——改为钉在
   * 打开时刻的值，maxHeight 同步钉为「钉住的 top 到触发器的距离」（=钉住
   * 时刻的面板高度）：内容变高走 modelList 内部滚动，不再推着面板跑。
   * 锚点移动（滚动/缩放）时 |cached.anchorTop-anchor.top| 超阈 → 按当前
   * placement 重新钉（正确跟随，一次性移动，无环）。 */
  const panelStyle = ((): CSSProperties => {
    if (position === null) return MEASURE_STYLE
    const left = Number(position.left)
    const top = Number(position.top)
    if (!Number.isFinite(left) || !Number.isFinite(top)) return MEASURE_STYLE
    const anchor = anchorRef.current?.getBoundingClientRect()
    if (anchor === undefined) return { left, top, maxHeight: panelMaxHeight }
    if (top < anchor.top - 1) {
      const cached = panelTopPinRef.current
      if (cached !== null && Math.abs(cached.anchorTop - anchor.top) < 0.5) {
        return { left, top: cached.top, maxHeight: Math.max(240, anchor.top - 4 - cached.top) }
      }
      panelTopPinRef.current = { anchorTop: anchor.top, top }
      return { left, top, maxHeight: Math.max(240, anchor.top - 4 - top) }
    }
    panelTopPinRef.current = null
    return { left, top, maxHeight: panelMaxHeight }
  })()

  /* 二级厂商浮层的位置（2026-10-22 用户第三次校正；2026-11-08 O6 终修）。
   *
   * ZCode 的实际做法是**弹在一级面板的右侧并排**，不是翻到上方叠在一起。
   * 上一版用了 placeOverlay 的垂直 flip，结果面板被顶到上方、还与一级重叠，
   * 用户直接说「太丑了，而且重叠了」。
   *
   * 正确做法：横向挂载（side='right'）。placeOverlay 会：
   *   · 右侧放不下 → 自动翻到左侧（这就是用户说的「智能检测向左或向右弹」）
   *   · 垂直方向 顶对齐 → 底对齐 → 才 shift（不会飞到屏幕外）
   *   · 按可用空间限高
   *
   * 锚点几何取 panelStyle（已含 O6 第三幕的 top 钉住——保证键稳定，预览
   * 切换不再使缓存失效）+ 面板 offset 尺寸推导——**绝不读面板自身的
   * getBoundingClientRect**：面板在首帧挂在 MEASURE 位置（视口原点），读
   * 实时 rect 会把垃圾坐标冻进缓存（O6 第二幕）。返回视口绝对坐标
   * （浮层是 position:fixed 挂在 body 下）。
   */
  const providerMenuStyle = ((): CSSProperties => {
    if (position === null) return { visibility: 'hidden' }
    const host = panelRef.current
    if (host === null) return { visibility: 'hidden' }
    /* panelStyle 由 useAnchoredPosition 的锚定结果（+第三幕钉住）推导，
     * left/top 恒为 number。 */
    const left = Number(panelStyle.left)
    const top = Number(panelStyle.top)
    /* 护栏：坐标不是有限数（理论不可达，hook 只写 number）时宁可隐藏也绝不
     * 定位/冻结——「把垃圾坐标冻进缓存」正是 O6 第二幕的教训。 */
    if (!Number.isFinite(left) || !Number.isFinite(top)) return { visibility: 'hidden' }
    const width = host.offsetWidth
    const height = host.offsetHeight
    const key = `${left},${top},${width}`
    const cached = providerMenuStyleRef.current
    if (cached !== null && providerMenuKeyRef.current === key) return cached
    const placement = placeOverlay({
      anchor: { top, bottom: top + height, left, right: left + width, width, height },
      panel: { width, height: 0 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      // 与一级面板同宽，挂在它的右侧（放不下自动翻左）。
      side: 'right',
      align: 'start',
      gap: 6,
      margin: 12,
      maxHeight: 360,
    })
    const style: CSSProperties = {
      position: 'fixed',
      left: placement.left,
      top: placement.top,
      width,
      maxHeight: placement.maxHeight ?? 360,
    }
    providerMenuKeyRef.current = key
    providerMenuStyleRef.current = style
    return style
  })()

  const panel = (
    <MenuSurface
      ref={panelRef}
      className={css.panel}
      style={panelStyle}
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
            /* N3 v7：离开二级不再立即卸载——统一走 150ms 延迟（与表头路径一致），
             * 快速滑动扫出又扫回时 cancelMenuClose 兜住，菜单不再闪没重建。 */
            onMouseLeave={() => { scheduleMenuClose(onPreviewProvider) }}
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
                /* N3 v7：预览切换经 rAF 合帧（最后写入 wins），快速滑动不再每行
                 * 触发一次全面板 reconcile。 */
                onMouseEnter={() => { scheduleHoverPreview(provider.id) }}
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
            /* N3 v7：介绍卡挂/卸经 rAF 合帧——同帧 enter→leave 只落最终态。 */
            onMouseEnter={(event) => { scheduleHoverCard(model, event.currentTarget) }}
            onMouseLeave={() => { scheduleHoverCard(null) }}
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
            position: 'fixed', zIndex: 1201,
            width: 244, maxWidth: 244, boxSizing: 'border-box',
            right: hoverCard.right, left: 'auto', top: hoverCard.top,
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
