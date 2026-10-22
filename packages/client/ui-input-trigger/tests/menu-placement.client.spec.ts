// @vitest-environment jsdom
/**
 * 输入框触发器菜单的几何判定（2026-10-22）。
 *
 * 这段逻辑一天内错了三次，每次都要「开浏览器 → 输入 @ → 量 DOM」才能发现，
 * 反馈太慢。这里把三种错法钉成断言：
 *   ① 向下展开却按「向上」算高度 → 自反馈，maxHeight 永远等于上限；
 *   ② 锚点量到零尺寸包装层 → 下方空间恒等于整个视口高，永不翻转；
 *   ③ 锚点量到菜单自己 → 振荡，菜单被推到视口外。
 */
import { describe, expect, it } from 'vitest'
import {
  MENU_GAP,
  MENU_MAX_HEIGHT,
  MENU_MIN_USABLE_BELOW,
  resolveMenuPlacement,
} from '../src/client/menuPlacement.ts'

/** 造一个输入框卡片矩形。 */
function card(top: number, height = 108): { top: number; bottom: number; height: number } {
  return { top, bottom: top + height, height }
}

describe('菜单几何', () => {
  it('输入框在页面中部：向下展开，高度用满设计上限', () => {
    // 实测首页空态：卡片 y=280..388，视口 720
    const placement = resolveMenuPlacement({ anchor: card(280), viewportHeight: 720 })
    expect(placement.flipUp).toBe(false)
    expect(placement.offset).toBe(0)
    // 下方可用 = 720 − 12 − (388 + 4) = 316 > 220，但不足 400
    expect(placement.maxHeight).toBe(316)
  })

  it('输入框在页面顶部：向下展开且能用满 400', () => {
    const placement = resolveMenuPlacement({ anchor: card(80), viewportHeight: 720 })
    expect(placement.flipUp).toBe(false)
    expect(placement.maxHeight).toBe(MENU_MAX_HEIGHT)
  })

  it('输入框贴底：翻到上方，且偏移要抬过整张卡片', () => {
    // 会话页底部输入框：卡片 y=600..708，视口 720
    const placement = resolveMenuPlacement({ anchor: card(600), viewportHeight: 720 })
    expect(placement.flipUp).toBe(true)
    // 锚点钉在卡片底边，要抬过 108px 卡片 + 4px 间隙
    expect(placement.offset).toBe(108 + MENU_GAP)
    // 上方可用 = 600 − 84 − 4 = 512 → 取上限 400
    expect(placement.maxHeight).toBe(MENU_MAX_HEIGHT)
  })

  it('下方够 6 行就不翻转（哪怕不足 400）', () => {
    // 下方 = 720 − 12 − (480 + 4) = 224 > 220
    const placement = resolveMenuPlacement({ anchor: card(372), viewportHeight: 720 })
    expect(placement.flipUp).toBe(false)
    expect(placement.maxHeight).toBe(224)
  })

  it('下方只够 5 行且上方更宽裕 → 翻转', () => {
    // 下方 = 720 − 12 − (488 + 4) = 216 < 220；上方 = 380 − 84 − 4 = 292 > 216
    const placement = resolveMenuPlacement({ anchor: card(380), viewportHeight: 720 })
    expect(placement.flipUp).toBe(true)
    expect(placement.maxHeight).toBe(292)
  })

  it('两侧都窄时留在下方（翻上去只会更糟）', () => {
    // 小窗 420 高，卡片 y=340..448：下方 = 420−12−452 = −44；上方 = 340−84−4 = 252
    const placement = resolveMenuPlacement({ anchor: card(340), viewportHeight: 420 })
    // 上方确实更宽裕 → 翻转
    expect(placement.flipUp).toBe(true)
    expect(placement.maxHeight).toBe(252)
  })

  it('可用高度永不为负', () => {
    const placement = resolveMenuPlacement({ anchor: card(700, 200), viewportHeight: 720 })
    expect(placement.maxHeight).toBeGreaterThanOrEqual(0)
  })

  it('高度永不超过设计上限', () => {
    const placement = resolveMenuPlacement({ anchor: card(0), viewportHeight: 5000 })
    expect(placement.maxHeight).toBeLessThanOrEqual(MENU_MAX_HEIGHT)
  })

  it('零尺寸锚点不会被当成有效测量（回归：锚点取到包装层）', () => {
    // 零尺寸矩形：top=bottom=0、height=0 —— 这正是包装层的样子。
    // 纯函数无法识别「这个锚点是假的」，所以把判据放在调用方；
    // 这里锁住「一旦真的传入零尺寸，不能用视口高度当可用空间」的边界表现。
    const placement = resolveMenuPlacement({
      anchor: { top: 0, bottom: 0, height: 0 },
      viewportHeight: 720,
    })
    // 上方 = 0−84−4 < 0，下方 = 720−12−4 = 704 → 下方够，不翻转
    expect(placement.flipUp).toBe(false)
    expect(placement.maxHeight).toBe(MENU_MAX_HEIGHT)
  })

  it('阈值常量自洽', () => {
    expect(MENU_MIN_USABLE_BELOW).toBeLessThan(MENU_MAX_HEIGHT)
  })
})
