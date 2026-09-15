/** Read-only Host plugin inventory registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the 'settings.agentPreset' LocaleNamespaceMap merge, whose
// dictionaries the shipped-preset name resolution below reads.
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
// Inline-safe shared fold: shipped ids map to dictionary keys in one home.
import { presetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
import { PluginInventorySettingsTab, type PluginInventorySettingsTabInjected } from './PluginInventorySettingsTab.tsx'
import { en, mcpEn, mcpZh, zh, type MCPInventoryLocaleKey, type PluginInventoryLocaleKey } from './locales.ts'

export type { PluginInventorySettingsTabInjected, PluginInventorySettingsTabProps } from './PluginInventorySettingsTab.tsx'
export type { PluginInventoryLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Read-only Host plugin inventory copy. */
    'settings.pluginInventory': PluginInventoryLocaleKey
    /** HeightLab MCP 服务标签页 copy. */
    'settings.pluginInventoryMCP': MCPInventoryLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'
/** MCP 服务标签页 dictionary namespace. */
const MCP_NS = 'settings.pluginInventoryMCP'

/** MCP 客户端插件的 Loader 模块标识。 */
const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** 我们内置的 MCP 客户端条目 id（运行时可能带 include: 前缀）。 */
const SHIPPED_MCP_IDS: ReadonlySet<string> = new Set(['mcp-heightlab-tools'])

/** 是否为系统内置的 MCP 客户端行。 */
function isShippedMcpEntry(entry: { entryId: string; moduleName: string }): boolean {
  if (entry.moduleName !== MCP_CLIENT_MODULE) return false
  const shortId = entry.entryId.split(':').pop() ?? entry.entryId
  return SHIPPED_MCP_IDS.has(shortId)
}

/**
 * HeightLab 技能白名单策略：
 * 列表默认全部隐藏（DSH 官方、HeightLab 自研、预装社区插件一律不显示），
 * 只显示用户自己后来安装的插件（白名单之外安装的 skill）。
 * 以后我们新增/更新任何预装插件，必须把它的 entryId 或模块名前缀加入下面的
 * 隐藏名单，否则会出现在用户列表里。
 */
const HEIGHTLAB_ENTRY_IDS: ReadonlySet<string> = new Set([
  'heightlab-brand',
  'heightlab-host-api',
  'heightlab-tool-scope',
  'heightlab-dispatch',
  'mcp-heightlab-tools',
  'dsh-automation',
  'knowledge',
  'tool-knowledge',
  'ui-knowledge',
  'artifact-library',
  'include',
  // 社区预装（better-sidebar / genui / modlens）按 id 兜底隐藏。
  'better-sidebar',
  'genui',
  'modlens',
])

/** Whether one Loader entry is user-installed (visible in the list). */
function isUserInstalled(entry: { entryId: string; moduleName: string }): boolean {
  if (HEIGHTLAB_ENTRY_IDS.has(entry.entryId)) return false
  const name = entry.moduleName
  // 用户自装的 MCP 客户端行（module 也是 @deepseek-ai/dsh-mcp-client）只要
  // 不是内置的 heightlab-tools，就算用户自装，两个标签页都会显示并可管理。
  if (name === MCP_CLIENT_MODULE) return !isShippedMcpEntry(entry)
  if (name.startsWith('@heightlab/')) return false
  if (name.includes('heightlab')) return false
  if (name.startsWith('@deepseek-ai/')) return false
  if (name.startsWith('cordis-plugin-') || name === 'cordis') return false
  if (name.startsWith('cordis:')) return false
  // 我们随产品预装的社区插件也算 shipped（按作者 scope 前缀兜底，防止新版本改 id）。
  if (name.startsWith('@omdsh-dev/')) return false
  if (name.startsWith('@liustack/')) return false
  if (name.startsWith('@dsh-external/')) return false
  if (name.startsWith('dsh-knowledge')) return false
  if (name === 'dsh-better-sidebar' || name === '@omdsh-dev/dsh-genui') return false
  return true
}

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/** Contribute the lazy inventory tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-inventory: dictionaries')
  ctx.effect(() => ctx.locale.register(MCP_NS, { zh: mcpZh, en: mcpEn }), 'ui-settings-plugin-inventory: mcp dictionaries')

  const t = ctx.locale.bind(NS)
  const tMCP = ctx.locale.bind(MCP_NS)
  /**
   * HeightLab：除 Loader `entries` 外，还要过滤 DSH 0.1.5 **新增**的
   * `agentPresets`（界面上的「会话插件」列表）。
   *
   * 0.3.30 的快照只有 `entries`，我们的 isUserInstalled 只作用于它；
   * 0.1.5 新增 agentPresets（按 Agent 预设组成的内部工具行，如 persona /
   * tool-bash / tool-fs …），客户端原样渲染 → 商业版里冒出 28 个内部工具，
   * 违背「预装一律隐藏、只显示用户自装」的产品设定。
   * 该列表按组带 `trust: 'system' | 'user'`，只保留用户自建的组。
   */
  const keepUserPresetGroups = <T extends { readonly trust: string }>(
    groups: readonly T[] | undefined,
  ): readonly T[] | undefined => groups?.filter(group => group.trust === 'user')
  const list: PluginInventorySettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    const agentPresets = keepUserPresetGroups(result.value.agentPresets)
    return {
      ...result.value,
      ...(agentPresets === undefined ? {} : { agentPresets }),
      entries: result.value.entries.filter(isUserInstalled),
    }
  }
  const mcpList: PluginInventorySettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return {
      ...result.value,
      // MCP 标签页只显示用户自装的 MCP（系统内置的 heightlab-tools 隐藏）。
      entries: result.value.entries.filter(entry => entry.moduleName === MCP_CLIENT_MODULE && isUserInstalled(entry)),
    }
  }
  // Resolved per call over ui-agent-preset's dictionaries, so a language
  // switch re-resolves shipped names; user-authored metadata passes through.
  const agentPresetCopy = ctx.locale.bind('settings.agentPreset')
  const presetName: PluginInventorySettingsTabInjected['presetName'] = preset =>
    presetDisplayText(preset, agentPresetCopy).name
  const injected = (): PluginInventorySettingsTabInjected => ({
    list,
    presetName,
    // 插件列表标签页：显示的条目已过滤为“用户自装”，全部可管理。
    canManage: () => true,
    canDelete: () => true,
  })
  const mcpInjected = (): PluginInventorySettingsTabInjected => ({
    list: mcpList,
    presetName,
    // MCP 标签页只显示用户自装条目，全部可管理。
    canManage: () => true,
    canDelete: () => true,
    copy: {
      loading: tMCP('loading'),
      error: tMCP('error'),
      retry: tMCP('retry'),
      search: tMCP('search'),
      empty: tMCP('empty'),
      emptySearch: tMCP('emptySearch'),
    },
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginInventorySettingsTab))

  // HeightLab：插件扩展页新增「MCP 服务」标签页（只读查看 Loader 中挂载的
  // MCP 客户端条目；点击卡片可展开查看标识与状态）。
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'mcp',
    order: 20,
    label: () => tMCP('tab'),
    locale: NS,
    inject: mcpInjected,
  }, PluginInventorySettingsTab))
}
