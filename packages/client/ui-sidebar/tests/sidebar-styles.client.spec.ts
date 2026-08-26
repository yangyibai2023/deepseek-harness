/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    // HeightLab 2026-08-26：顶部 4px，品牌行中心对齐 macOS 红绿灯。
    expect(root?.get('padding')).toBe('7.5px var(--dsh-sidebar-inline-padding) 6px')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--dsh-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBe('0')
  })

  it('moves the four upper controls while the settings seat only fades', () => {
    const animation = 'rail-in 150ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
      '.railIn .regionArea',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 150ms var(--ds-ease-in-out) backwards',
    )
    expect(css).toMatch(
      /@keyframes rail-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(49px\);\s*}\s*}/,
    )
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives shell rail controls the same base anchor for their shared translation', () => {
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('flex-start')
    // HeightLab 2026-08-26：rail 内图标水平居中（修复贴左偏 ≈9px）。
    expect(declarations('.collapsed .newSession')?.get('justify-content')).toBe('center')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('36px')
  })

  it('keeps the slotted brand row split: brand left by the traffic lights, toggle right', () => {
    // HeightLab 2026-08-26 二轮：品牌放大 10%（18px 行高 / 14.3px 字）并移到
    // 左侧贴近 macOS 红绿灯（padding-left 62px），折叠按钮保持靠右
    // （右缘外挑 2px 与底部「连接手机」按钮同列）。
    expect(declarations('.logoRow')?.get('justify-content')).toBe('space-between')
    expect(declarations('.logoRow')?.get('padding')).toBe('0 0 0 70px')
    expect(declarations('.logoRow')?.get('margin')).toBe('0 -2px 8px 0')
    expect(declarations('.brandIdentity')?.get('height')).toBe('18px')
    expect(declarations('.brandName')?.get('height')).toBe('18px')
    expect(declarations('.brandName')?.get('line-height')).toBe('18px')
    expect(declarations('.brandName')?.get('font-size')).toBe('14.3px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('14.3px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })
})
