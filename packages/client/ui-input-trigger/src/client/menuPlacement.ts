/**
 * 输入框触发器菜单（`/` 与 `@`）的**几何判定**——纯函数，可直接单测。
 *
 * 抽出来的原因：这段逻辑在 2026-10-22 一天内错了三次，每次都要靠「打开
 * 浏览器、输入 @、量 DOM」才能发现，反馈极慢：
 *   ① `useAnchoredMaxHeight` 假定浮层**向上**展开（底边固定），菜单改成向下
 *      后该假设失效，元素底边随高度增长形成自反馈，maxHeight 永远等于上限；
 *   ② 锚点取 `listRef.parentElement` → 是零尺寸包装层，rect 全 0，于是
 *      「下方空间」恒等于整个视口高，永远不翻转；
 *   ③ 锚点从 `listRef` **自己**开始找 → 命中菜单自身矩形，而菜单位置又由
 *      这次计算决定，形成振荡，菜单被推到 top=−320（视口外）。
 *
 * 纯函数 + 断言能把这三条一次锁死。
 */

/** 菜单设计上限（与 MenuView 的 MAX_HEIGHT 一致）。 */
export const MENU_MAX_HEIGHT = 400
/** 与视口边缘保留的余量。 */
export const MENU_VIEWPORT_MARGIN = 12
/** 菜单与输入框卡片之间的视觉间隙（与 CSS 的 `+ 4px` 一致）。 */
export const MENU_GAP = 4
/**
 * 下方低于这个高度就优先翻到上方。
 *
 * 220px ≈ 6 行候选 + 一个分组标题。用固定值而不是 MAX_HEIGHT：后者会让
 * 「下方有 292px、其实完全够用」的情况也翻转。
 */
export const MENU_MIN_USABLE_BELOW = 220
/** 会话页顶部有 76px 标题栏 + 呼吸空间，菜单不该钻到它下面。 */
export const MENU_TOP_CLEARANCE = 84

export interface MenuPlacement {
  /** 是否向上展开。 */
  flipUp: boolean
  /** 向上时的 `bottom` 距离（px）：锚点在卡片底边，需抬过整张卡片高度。 */
  offset: number
  /** 菜单可用高度上限（px）。 */
  maxHeight: number
}

export interface MenuAnchorRect {
  top: number
  bottom: number
  height: number
}

export interface MenuPlacementInput {
  anchor: MenuAnchorRect
  viewportHeight: number
}

/**
 * 决定菜单朝上还是朝下，以及能用多高。
 *
 * @param input - 输入框卡片（锚点）的矩形与视口高度
 * @returns 方向、偏移与高度上限
 */
export function resolveMenuPlacement(input: MenuPlacementInput): MenuPlacement {
  const { anchor, viewportHeight } = input
  const below = viewportHeight - MENU_VIEWPORT_MARGIN - (anchor.bottom + MENU_GAP)
  const above = anchor.top - Math.max(MENU_TOP_CLEARANCE, MENU_VIEWPORT_MARGIN) - MENU_GAP
  // 下方已经不够用（低于 6 行），且上方确实更宽裕 → 翻上去。
  const flipUp = below < MENU_MIN_USABLE_BELOW && above > below
  const available = Math.max(0, flipUp ? above : below)
  return {
    flipUp,
    offset: flipUp ? anchor.height + MENU_GAP : 0,
    maxHeight: Math.min(MENU_MAX_HEIGHT, available),
  }
}

/**
 * 从菜单节点往上找「第一个有尺寸的祖先」的判定条件。
 *
 * 必须排除菜单自身（否则自反馈）与零尺寸包装层（否则永远不翻转），
 * 所以调用方从 `menu.parentElement` 开始遍历。
 */
export function isMeasurableRect(rect: { width: number; height: number }): boolean {
  return rect.width > 0 && rect.height > 0
}
