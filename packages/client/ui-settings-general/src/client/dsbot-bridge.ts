/**
 * ds-bot 设置桥的共享访问层（2026-10-19）。
 *
 * `window.dshBot.settings` 由 `desktop-dsh/scripts/patch-ds-bot.mjs` 在 ds-bot
 * 客户端 apply 时挂出。团队设置（TeamSettingsSection）与全局用量
 * （GlobalUsageSection）都从这里取，避免两处各写一份读取逻辑后漂移。
 *
 * 注意：桥里的页面组件属于 **ds-bot 模块内的 React 实例**，只能经
 * `mount()` 交给它自己的 ReactDOM 渲染；跨实例直接渲染会抛 Invalid hook call。
 */
import type { ComponentType, ReactNode } from 'react'

/** The shape the ds-bot patch publishes on window.dshBot.settings. */
export interface DsBotSettingsBridge {
  roster: unknown
  actions: Record<string, (...args: never[]) => unknown>
  SetSection: ComponentType<{ title?: ReactNode; children?: ReactNode }>
  SetRow: ComponentType<{ label?: ReactNode; hint?: ReactNode; children?: ReactNode }>
  run: (promise: unknown) => Promise<boolean>
  pages: Record<string, ComponentType<Record<string, unknown>>>
  /** Render one team page into a container using ds-bot's own ReactDOM. */
  mount?: (container: Element, pageId: string) => () => void
}

interface DsBotHub {
  settings?: DsBotSettingsBridge
  styles?: { ensure?: () => void }
}

const hub = (): DsBotHub | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { dshBot?: DsBotHub }).dshBot
}

export const readDsBotBridge = (): DsBotSettingsBridge | undefined => hub()?.settings

/**
 * ds-bot 的样式表只在它的团队 surface 挂载；在个人模式下打开这些页面会只剩
 * 裸文字。桥提供 styles.ensure()，用独立 tag 常驻安装一份（只装一次）。
 */
export const ensureDsBotStyles = (): void => {
  try {
    hub()?.styles?.ensure?.()
  } catch {
    // 样式缺失不应阻断页面挂载：页面仍可渲染（只是观感退化），失败留给回读提示。
  }
}

/**
 * 桥在 ds-bot 客户端 apply 时才挂出；轮询等待，让「先开设置」也能最终拿到。
 * 返回清理函数。
 */
export const pollDsBotBridge = (onReady: (bridge: DsBotSettingsBridge) => void): (() => void) => {
  const id = window.setInterval(() => {
    const next = readDsBotBridge()
    if (next !== undefined) onReady(next)
  }, 400)
  return () => { window.clearInterval(id) }
}
