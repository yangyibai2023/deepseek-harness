/**
 * 浮层定位的**唯一算法**（2026-10-22 用户要求全面统一）。
 *
 * 用户原话：「输入框在下方的时候，不光是 @，包括模型选择框里的二级菜单，
 * 有时候它们就会向下弹出，导致溢出看不到了。它应该是智能检测输入框的位置，
 * 来判断向哪个方向弹出。这东西一定要完善、完整地弄好，包括其他这种输入框上下
 * 弹出的元素。包括个人模式、团队模式，以及我们整个 APP 中所有需要弹出的地方。」
 *
 * 在这个文件之前，全仓有四种互不相同的做法，每一种都有自己的坑：
 *
 *   1. `Menu.tsx` portal 模式 —— 只 clamp，从不 flip。
 *      贴底时把面板压回视口，结果是**盖住触发器**或仍探出边界；
 *      二级菜单更糟：CSS 固定 `right: calc(100% + 10px)` 向左弹，
 *      靠左的触发器直接弹到屏幕外。
 *   2. `useAnchoredPosition` —— 有 flip，但只比「上下哪边大」，
 *      没有限高，面板超过可用空间时照样溢出。
 *   3. `useAnchoredMaxHeight` —— 假定浮层**向上**展开（底边固定），
 *      向下展开的场景会形成自反馈（元素底边随高度增长 → 可用空间恒等于视口）。
 *   4. `MenuView.tsx` —— 自己写了一份 flip，与上面三套都不通用。
 *
 * 这个模块把四条合成一条：**先算可用空间 → 选方向 → 限高 → 约束坐标**。
 * 所有浮层都调它，行为自然一致。
 *
 * 算法的四个阶段（Floating UI 的 flip/shift/size 三件套，按需裁剪）：
 *
 *   ① 候选方向：首选侧放不下、对侧放得下 → 翻到对侧（flip）
 *   ② 两侧都放不下 → 选空间大的那侧，并按可用空间限高（size）
 *   ③ 沿主轴平移使面板完整落在视口内（shift）
 *   ④ 横向同理：起始侧放不下就换端点（对齐翻转），再 shift
 *
 * 全部是纯函数：不碰 DOM、不读全局、不依赖 React。调用方负责量矩形和写样式。
 */

/** 浮层与视口边缘的最小间距。 */
export const OVERLAY_MARGIN = 12

/**
 * 量不到面板高度时使用的「最小可用空间」阈值（≈6 行菜单）。
 *
 * 首帧和 jsdom 都测不到尺寸。此时必须有个判据：
 * 太小（如 0）→ 永远翻转；太大 → 贴底时首帧不翻、直接画出视口。
 * 220px 与 @ 菜单的 MIN_USABLE_BELOW 同一经验值。
 */
const MIN_USABLE = 220
/** 横向同理（≈一个二级菜单的宽度）。 */
const MIN_H_USABLE = 200

/** 主轴方向。`'right'` 表示面板挂在锚点右側（子菜单用）。 */
export type PlacementSide = 'top' | 'bottom' | 'left' | 'right'

/** 横向对齐：贴锚点左边缘、右边缘，或居中。 */
export type PlacementAlign = 'start' | 'end' | 'center'

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface ViewportLike {
  width: number
  height: number
}

export interface PlaceOptions {
  /** 锚点矩形（触发按钮）。 */
  anchor: RectLike
  /** 面板自然尺寸（内容不受限时）。测量不到时传 0，算法会退化到「按可用空间限高」。 */
  panel: { width: number; height: number }
  /** 视口尺寸。 */
  viewport: ViewportLike
  /** 首选方向。 */
  side?: PlacementSide
  /** 横向对齐。 */
  align?: PlacementAlign
  /** 面板与锚点之间的间隙。 */
  gap?: number
  /** 与视口边缘的距离；默认 {@link OVERLAY_MARGIN}。 */
  margin?: number
  /**
   * 顶部安全区：部分浮层不能钻进顶部标题栏下方（会话页 76px）。
   * 与 `margin` 取较大值。
   */
  topClearance?: number
  /**
   * 设计上限高度。面板内容比这更高时先按此截断，
   * 再与可用空间取小 —— 否则一个超长列表会「永远放不下」，把 flip 逼成死循环。
   */
  maxHeight?: number
  /** 设计上限宽度。 */
  maxWidth?: number
}

export interface Placement {
  /** 最终方向（可能与首选不同）。 */
  side: PlacementSide
  /** 相对视口的左上角坐标（fixed 定位用）。 */
  left: number
  top: number
  /** 应用给面板的限高（px）；不限制时为 `undefined`。 */
  maxHeight: number | undefined
  /** 应用给面板的限宽（px）；不限制时为 `undefined`。 */
  maxWidth: number | undefined
  /** 是否发生了方向翻转（诊断与测试用）。 */
  flipped: boolean
}

/** 主轴为垂直的两个方向（面板挂锚点上下）。 */
function isVertical(side: PlacementSide): boolean {
  return side === 'top' || side === 'bottom'
}

/**
 * 计算浮层位置。
 *
 * 这个函数必须对「测量不到尺寸」的首次渲染也安全：面板尺寸为 0 时，
 * 方向判定按「宁可首选」「若首选侧连 margin 都不够就翻」处理，
 * 限高仍照常按可用空间给出 —— 于是首帧就落在合理位置，不会先画到屏幕外。
 *
 * @param options - 锚点、面板、视口与约束
 * @returns 方向、坐标与限高/限宽
 */
export function placeOverlay(options: PlaceOptions): Placement {
  const {
    anchor, panel, viewport,
    side = 'bottom',
    align = 'start',
    gap = 4,
    margin = OVERLAY_MARGIN,
    topClearance,
    maxHeight,
    maxWidth,
  } = options

  // 顶部安全区：浮层不得侵入固定标题栏。
  const topLimit = Math.max(margin, topClearance ?? 0)
  const bottomLimit = viewport.height - margin
  const leftLimit = margin
  const rightLimit = viewport.width - margin

  // 面板在设计上限内的期望尺寸（未测到则为 0）。
  const desiredWidth = maxWidth !== undefined && panel.width > 0
    ? Math.min(panel.width, maxWidth)
    : panel.width
  const desiredHeight = maxHeight !== undefined && panel.height > 0
    ? Math.min(panel.height, maxHeight)
    : panel.height

  /* ── 阶段 ①②：主轴方向 + 主轴可用空间 ─────────────────────────────── */

  // 首选方向能放下的空间（未扣面板尺寸）。
  const spaceBelow = bottomLimit - (anchor.bottom + gap)
  const spaceAbove = (anchor.top - gap) - topLimit
  const spaceRight = rightLimit - (anchor.right + gap)
  const spaceLeft = (anchor.left - gap) - leftLimit

  let resolvedSide: PlacementSide = side
  let flipped = false

  if (isVertical(side)) {
    /* 垂直：首选下方时，要同时满足「面板放得下」和「下方比上方宽裕」才不翻。
       两个条件缺一不可 ——
       · 只看「放不下」→ 内容比视口高时永远放不下，会把面板翻来翻去；
       · 只看「哪边大」→ 下方 292px（够用）时会误翻上去（首版踩过）。

       **零尺寸（首帧 / jsdom）按「最小可用高度」判定**：
       这时量不到面板高度，不能当成「无限大」也不能当成「零」——
       前者永远不翻（贴底时首帧就画到视口外），后者永远翻。
       用一个经验阈值 `MIN_USABLE`：首选侧不足它、对侧更宽裕才翻。 */
    const primary = side === 'bottom' ? spaceBelow : spaceAbove
    const secondary = side === 'bottom' ? spaceAbove : spaceBelow
    const fitsPrimary = desiredHeight > 0 ? desiredHeight <= primary : primary >= MIN_USABLE
    const fitsSecondary = desiredHeight > 0 ? desiredHeight <= secondary : secondary >= MIN_USABLE
    if (!fitsPrimary && fitsSecondary) {
      resolvedSide = side === 'bottom' ? 'top' : 'bottom'
      flipped = true
    } else if (!fitsPrimary && !fitsSecondary) {
      // 两侧都放不下：选空间大的一侧，靠限高收进来。
      const otherSide = side === 'bottom' ? 'top' : 'bottom'
      if (secondary > primary) {
        resolvedSide = otherSide
        flipped = true
      }
    } else if (desiredHeight === 0 && secondary > primary) {
      /* 零尺寸且两侧都「够用」时，仍然选更宽裕的一侧：
         贴底场景下 primary 可能刚好 200（过了阈值），但动画/字体加载后
         面板会长到 300+，先按宽裕侧放能避免开面板瞬间溢出。 */
      if (primary < secondary) {
        resolvedSide = side === 'bottom' ? 'top' : 'bottom'
        flipped = true
      }
    }
  } else {
    /* 横向（子菜单）：对称的逻辑。
       子菜单是「挂在锚点侧边的卡片」，向右放不下就翻到左侧 —— 这正是
       用户报的「二级菜单弹到屏幕外」的修法。 */
    const primary = side === 'right' ? spaceRight : spaceLeft
    const secondary = side === 'right' ? spaceLeft : spaceRight
    const fitsPrimary = desiredWidth > 0 ? desiredWidth <= primary : primary >= MIN_H_USABLE
    const fitsSecondary = desiredWidth > 0 ? desiredWidth <= secondary : secondary >= MIN_H_USABLE
    if (!fitsPrimary && fitsSecondary) {
      resolvedSide = side === 'right' ? 'left' : 'right'
      flipped = true
    } else if (!fitsPrimary && !fitsSecondary) {
      const otherSide = side === 'right' ? 'left' : 'right'
      if (secondary > primary) {
        resolvedSide = otherSide
        flipped = true
      }
    }
  }

  /* ── 阶段 ②（续）：按最终方向的可用空间限高/限宽 ──────────────────── */

  const availableMain = isVertical(resolvedSide)
    ? (resolvedSide === 'bottom' ? spaceBelow : spaceAbove)
    : (resolvedSide === 'right' ? spaceRight : spaceLeft)

  // 可用空间为负（锚点已经贴边）时给 0，由调用方决定是否隐藏。
  const mainCap = Math.max(0, availableMain)
  const appliedMaxHeight = isVertical(resolvedSide)
    ? Math.min(maxHeight ?? Number.POSITIVE_INFINITY, mainCap)
    : maxHeight
  const appliedMaxWidth = isVertical(resolvedSide)
    ? maxWidth
    : Math.min(maxWidth ?? Number.POSITIVE_INFINITY, mainCap)

  // 实际占位尺寸：没有限高时用面板自然尺寸。
  const finalHeight = usedSize(desiredHeight, appliedMaxHeight)
  const finalWidth = usedSize(desiredWidth, appliedMaxWidth)

  /* ── 阶段 ③：主轴坐标 + shift ────────────────────────────────────── */

  let top: number
  if (isVertical(resolvedSide)) {
    top = resolvedSide === 'bottom' ? anchor.bottom + gap : anchor.top - gap - finalHeight
  } else {
    // 横向挂载时，垂直方向与锚点顶对齐（子菜单惯例），再做 shift。
    top = anchor.top
  }
  top = clampAxis(top, finalHeight, topLimit, bottomLimit)

  /* ── 阶段 ④：横向坐标 + 对齐翻转 + shift ─────────────────────────── */

  let left: number
  if (resolvedSide === 'right') {
    left = anchor.right + gap
  } else if (resolvedSide === 'left') {
    left = anchor.left - gap - finalWidth
  } else if (align === 'end') {
    left = anchor.right - finalWidth
  } else if (align === 'center') {
    left = anchor.left + (anchor.width - finalWidth) / 2
  } else {
    left = anchor.left
  }
  left = clampAxis(left, finalWidth, leftLimit, rightLimit)

  return {
    side: resolvedSide,
    left: Math.round(left),
    top: Math.round(top),
    maxHeight: appliedMaxHeight === undefined ? undefined : Math.round(appliedMaxHeight),
    maxWidth: appliedMaxWidth === undefined ? undefined : Math.round(appliedMaxWidth),
    flipped,
  }
}

/** 面板实际占用的尺寸：有限高时取小值，否则用自然尺寸。 */
function usedSize(natural: number, cap: number | undefined): number {
  if (cap === undefined) return natural
  return natural > 0 ? Math.min(natural, cap) : cap
}

/**
 * 把一个区间的起点压进边界。
 *
 * 面板比可用区间还大时（极端小窗），优先保证**起点可见**（不被推到负坐标），
 * 因为顶部露出来的标题比底部被裁掉的尾巴更有用。
 */
function clampAxis(start: number, size: number, limitStart: number, limitEnd: number): number {
  if (size <= 0) return Math.max(start, limitStart)
  const latestStart = limitEnd - size
  if (latestStart < limitStart) return limitStart
  return Math.min(Math.max(start, limitStart), latestStart)
}

/**
 * 从 DOM 元素往上找「第一个有尺寸的祖先」的矩形。
 *
 * 为什么需要它：输入框类浮层的 DOM 结构是
 *   composerCard（真实尺寸）
 *     └ overlayAnchor（height: 0）
 *        └ wrapper（0×0）
 *           └ 浮层自身
 * 直接父节点是零尺寸包装层，`getBoundingClientRect()` 全 0，会让「下方空间」
 * 恒等于整个视口高，于是永远不翻转。而**从浮层自身开始找**更糟：浮层位置
 * 由这次计算决定，形成振荡，面板会在两个位置之间跳。
 *
 * 所以约定：从浮层的 `parentElement` 开始，向上找第一个宽高都 > 0 的祖先。
 *
 * @param from - 起点（通常是浮层元素；函数自动跳过它）
 * @returns 锚点矩形，找不到返回 `undefined`
 */
export function measureAnchorAbove(from: Element | null | undefined): DOMRect | undefined {
  let node: Element | null = from?.parentElement ?? null
  while (node !== null) {
    const rect = node.getBoundingClientRect()
    if (rect.height > 0 && rect.width > 0) return rect
    node = node.parentElement
  }
  return undefined
}

/** `DOMRect` → {@link RectLike}（只保留计算需要的字段）。 */
export function toRectLike(rect: DOMRect): RectLike {
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  }
}
