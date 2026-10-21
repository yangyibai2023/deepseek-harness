/**
 * Built-in plugins settings section, browser half: the shell around the
 * feature-owned tabs registered into `settings.plugins.tab` (the read-only
 * inventory ships one). The configuration pages of the host-plane plugins
 * live in their own companion packages, which register into the Plugins
 * page; this section owns the Settings navigation entry and the tab chrome
 * only.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section'
// entry). Cross-plugin collaboration goes through slots, never a value import
// (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginsSettingsSection } from './PluginsSettingsSection.tsx'
import type { PluginsSettingsSectionInjected, PluginsSettingsTabEntry } from './PluginsSettingsSection.tsx'
import { en, zh } from './locales.ts'

export type { PluginsSettingsSectionInjected, PluginsSettingsSectionProps } from './PluginsSettingsSection.tsx'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.plugins'

/**
 * 设置 →「内置插件」里允许渲染的 tab id（白名单，Fail-closed）。
 *
 * 2026-10-21 用户再次强调：「我们底层用的是 DSH，很多功能用的是社区插件，
 * 但全部做了封装，所以不要对用户展示、也不要让用户看到。」
 *
 * 白名单而不是黑名单：将来任何第三方插件往这个 slot 注册 tab，默认都不显示，
 * 不需要我们再追着补隐藏名单（黑名单已经在 dshmarket 1.66.44 上失效过一次）。
 *
 *   all —— 插件列表（内容已按 isUserInstalled 过滤到只剩用户自装）
 *   mcp —— MCP 服务
 */
const SHIPPED_SETTINGS_TABS: ReadonlySet<string> = new Set(['all', 'mcp'])

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Mount the built-in plugins section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugins: section dictionaries')

  let tabsVersion = -1
  let tabsRevision = -1
  let tabs: readonly PluginsSettingsTabEntry[] = []
  const sectionInjected = (): PluginsSettingsSectionInjected => ({
    hooks: {
      tabs: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.plugins.tab')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== tabsVersion || revision !== tabsRevision) {
            tabsVersion = version
            tabsRevision = revision
            tabs = ctx.slots.entries('settings.plugins.tab')
              // HeightLab：设置→内置插件里的**非官方 tab 一律隐藏**。
              //
              // 产品设定（2026-08-16 定，2026-10-21 用户再次强调）：底层用的
              // 是 DSH 与社区插件，但我们全部做了封装，用户不应该看到任何
              // 第三方来源的入口。内置插件页只保留两个我们自己的 tab：
              //   · 'all'  —— 插件列表（已按 isUserInstalled 过滤到只剩用户自装）
              //   · 'mcp'  —— MCP 服务
              // 其余（'configurable' 插件配置、dshmarket 的 'dsh-market' 插件市场）
              // 一律不渲染。
              //
              // 为什么在这里挡而不是改 dshmarket：市场会自更新（v1.66.21 →
              // 1.66.44 就冲掉过一次注释掉的注册块），打第三方补丁不可持续；
              // slot 消费端过滤是**我们的包**，升级上游也不会丢。
              .filter(entry => SHIPPED_SETTINGS_TABS.has(entry.options.id ?? ''))
              .map(entry => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: entry.options.id ?? '',
                order: entry.options.order ?? 0,
                label: resolveSlotLabel(entry.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return tabs
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.plugins.tab', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
    },
  })

  // This package owns the one Built-in plugins navigation entry and the tab
  // chrome; feature plugins contribute pages without competing for Settings nav rows.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'plugins',
    // HeightLab：插件扩展排到 Agent 管理（20）之后。
    order: 25,
    label: () => t('nav'),
    locale: NS,
    inject: sectionInjected,
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  }, PluginsSettingsSection))
}
