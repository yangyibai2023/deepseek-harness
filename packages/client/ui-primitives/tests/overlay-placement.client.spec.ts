// @vitest-environment jsdom
/**
 * 浮层定位算法的统一裁判（2026-10-22）。
 *
 * 这套断言覆盖用户实际报过的每一种现场，以及每一版踩过的错法：
 *   · 输入框贴底 → 必须翻到上方（@ 菜单 / 模型选择器）
 *   · 输入框居中 → 不能因为我方实现误判而翻上去
 *   · 二级菜单靠近右缘 → 必须翻到左侧（原先 CSS 固定向左但从不判定）
 *   · 二级菜单靠近左缘 → 向右
 *   · 面板比可用空间高 → 限高而不是溢出
 *   · 小窗口 → 面板仍完整落在视口内
 *   · 首帧测不到尺寸 → 不能画到屏幕外
 */
import { describe, expect, it } from 'vitest'
import { placeOverlay, type PlacementSide, type RectLike } from '../src/overlayPlacement.ts'

const VH = 720
const VW = 1280
const VIEWPORT = { width: VW, height: VH }

function rect(top: number, height: number, left = 100, width = 600): RectLike {
  return { top, bottom: top + height, left, right: left + width, width, height }
}

/** 一个 300 高的面板，量在锚点下方 / 右方 4px 处。 */
const PANEL = { width: 400, height: 300 }

function place(
  anchor: RectLike,
  side: PlacementSide = 'bottom',
  panel = PANEL,
  extra: Partial<Parameters<typeof placeOverlay>[0]> = {},
) {
  return placeOverlay({ anchor, panel, viewport: VIEWPORT, side, ...extra })
}

describe('垂直方向（输入框 / 选择器）', () => {
  it('输入框贴底 → 翻到上方，且不覆盖输入框', () => {
    // 会话页：卡片 y=600..708
    const anchor = rect(600, 108)
    const p = place(anchor)
    expect(p.side).toBe('top')
    expect(p.flipped).toBe(true)
    // 面板底边在锚点上方（含 4px 间隙）——上方可用 588，面板 300 不触发限高，
    // 所以实际高度就是自然高度。
    expect(p.top + PANEL.height).toBeLessThanOrEqual(anchor.top - 4 + 1)
  })

  it('输入框居中 → 向下展开，不误翻', () => {
    // 首页空态：卡片 y=280..388，下方 320px 够放 300 高的面板
    const anchor = rect(280, 108)
    const p = place(anchor)
    expect(p.side).toBe('bottom')
    expect(p.flipped).toBe(false)
    expect(p.top).toBe(anchor.bottom + 4)
  })

  it('下方刚好差一点 → 翻到上方', () => {
    // 卡片 y=400..508：下方 = 720-12-(508+4) = 196 < 300；上方 = 400-12-4 = 384
    const anchor = rect(400, 108)
    const p = place(anchor)
    expect(p.side).toBe('top')
  })

  it('两侧都放不下 → 选空间大的一侧并限高（不溢出）', () => {
    // 小窗 400 高，卡片 y=120..300：上方 104，下方 84 —— 都放不下 300
    const viewport = { width: VW, height: 400 }
    const anchor = rect(120, 180)
    const p = placeOverlay({ anchor, panel: PANEL, viewport, side: 'bottom' })
    // 上方更大 → 翻上去
    expect(p.side).toBe('top')
    // 且限高到可用空间，面板不越界
    expect(p.maxHeight).toBeDefined()
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + (p.maxHeight ?? PANEL.height)).toBeLessThanOrEqual(400 - 12 + 1)
  })

  it('面板比可用空间高 → 限高，不溢出视口', () => {
    const anchor = rect(280, 108)
    const tall = { width: 400, height: 900 }
    const p = place(anchor, 'bottom', tall)
    expect(p.maxHeight).toBeDefined()
    expect(p.top + (p.maxHeight ?? 0)).toBeLessThanOrEqual(VH - 12 + 1)
  })

  it('maxHeight 设计上限先截断，避免超长列表永远「放不下」', () => {
    const anchor = rect(280, 108)
    const veryTall = { width: 400, height: 5000 }
    const p = place(anchor, 'bottom', veryTall, { maxHeight: 320 })
    // 设计上限 320，但下方可用 316 → 取 316
    expect(p.maxHeight).toBeLessThanOrEqual(320)
    expect(p.side).toBe('bottom')
  })

  it('首帧测不到面板尺寸 → 不画到视口外', () => {
    const anchor = rect(600, 108)
    const p = place(anchor, 'bottom', { width: 0, height: 0 })
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top).toBeLessThan(VH)
  })

  it('顶部安全区生效：不钻进标题栏', () => {
    const anchor = rect(100, 40)
    const p = place(anchor, 'bottom', { width: 300, height: 600 }, { topClearance: 84 })
    expect(p.top).toBeGreaterThanOrEqual(84)
  })

  it('顶部安全区让「上方放不下」，因此不翻上去', () => {
    // 卡片 y=200..308，上方扣掉 84 安全区只剩 112，放不下 300；下方 396 够
    const anchor = rect(200, 108)
    const p = place(anchor, 'bottom', PANEL, { topClearance: 84 })
    expect(p.side).toBe('bottom')
  })
})

describe('横向方向（二级菜单 / 子菜单）', () => {
  it('靠右缘 → 翻到左侧（原先固定向左但从不判定，靠左时弹到屏外）', () => {
    // 锚点右边缘在 1250，右侧只剩 18px
    const anchor = rect(300, 32, 1180, 70)
    const p = place(anchor, 'right', { width: 260, height: 200 })
    expect(p.side).toBe('left')
    expect(p.flipped).toBe(true)
    expect(p.left).toBeGreaterThanOrEqual(12)
  })

  it('靠左缘 → 向右（默认方向）', () => {
    // 锚点在左侧，右边空间充足
    const anchor = rect(300, 32, 20, 70)
    const p = place(anchor, 'right', { width: 260, height: 200 })
    expect(p.side).toBe('right')
    expect(p.left).toBe(anchor.right + 4)
  })

  it('左侧触发器也要能向右弹，不被压到屏外', () => {
    const anchor = rect(300, 32, 0, 60)
    const p = place(anchor, 'left', { width: 260, height: 200 })
    // 首选 left 放不下（左侧为负），应翻到 right
    expect(p.side).toBe('right')
    expect(p.left).toBeGreaterThanOrEqual(12)
  })

  it('横向面板不越右边界（右侧放不下则翻左）', () => {
    // 锚点 900..1000，右侧 268 < 380 → 翻到左侧（left=900-4-380=516）
    const anchor = rect(300, 32, 900, 100)
    const p = place(anchor, 'right', { width: 380, height: 200 })
    expect(p.side).toBe('left')
    expect(p.left + 380).toBeLessThanOrEqual(VW - 12 + 1)
    expect(p.left).toBeGreaterThanOrEqual(12)
  })

  it('横向挂载时也用限高把面板收进视口', () => {
    const anchor = rect(600, 32, 100, 70)
    const p = place(anchor, 'right', { width: 260, height: 400 })
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + (p.maxHeight ?? 400)).toBeLessThanOrEqual(VH - 12 + 1)
  })
})

describe('对齐方式', () => {
  it('align=end 时面板右边贴锚点右边', () => {
    const anchor = rect(280, 108, 400, 300)
    const p = place(anchor, 'bottom', PANEL, { align: 'end' })
    expect(p.left + (p.maxWidth ?? PANEL.width)).toBe(anchor.right)
  })

  it('align=center 时面板居中于锚点', () => {
    const anchor = rect(280, 108, 400, 600)
    const p = place(anchor, 'bottom', PANEL, { align: 'center' })
    expect(p.left).toBe(Math.round(anchor.left + (anchor.width - PANEL.width) / 2))
  })

  it('align=end 贴右缘时被 shift 回视口内', () => {
    // 锚点右边缘 1270，面板 400 宽 → 起点 870，不会越界
    const anchor = rect(280, 108, 1180, 90)
    const p = place(anchor, 'bottom', PANEL, { align: 'end' })
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.left + PANEL.width).toBeLessThanOrEqual(VW - 12 + 1)
  })
})
