// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningWhaleTail } from '../src/client/chat/RunningWhaleTail.tsx'

afterEach(cleanup)

/**
 * 2026-10-20：原实现用 DeepSeek 鲸鱼 APNG。用户要求所有暴露的品牌图标换成
 * 我们自己的（胶囊/轨道环）。这里改为断言内联 SVG 品牌标记 —— 不再依赖任何
 * 二进制资产，因此原来那个「校验 APNG 帧」的用例随之删除（资产本身也不再被
 * 引用，随构建不进入产物）。
 */
describe('RunningWhaleTail', () => {
  it('renders our own capsule-orbit SVG mark, decorative and style-free', () => {
    const view = render(<RunningWhaleTail />)
    const icon = view.container.firstElementChild!
    expect(icon.tagName).toBe('SPAN')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.children).toHaveLength(1)

    const svg = icon.querySelector('svg')!
    expect(icon.firstElementChild).toBe(svg)
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    // 轨道环（ellipse）+ 胶囊（rect），都是品牌标记的组成部分。
    expect(svg.querySelectorAll('ellipse')).toHaveLength(1)
    expect(svg.querySelectorAll('rect')).toHaveLength(1)
    expect(svg.querySelectorAll('path')).toHaveLength(0)
    expect(svg.querySelector('ellipse')?.getAttribute('stroke')).toBe('currentColor')
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('currentColor')
    // 不得再出现任何第三方品牌资产引用。
    expect(view.container.querySelector('animate')).toBeNull()
    expect(view.container.querySelector('[style]')).toBeNull()
  })
})
