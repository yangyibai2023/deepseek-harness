/** Copy dictionaries for the plugin inventory Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '插件列表',
  loading: '正在读取插件…',
  error: '暂时无法读取插件。',
  retry: '重试',
  search: '搜索插件',
  empty: '暂无插件。',
  emptySearch: '没有匹配的插件。',
  presetTitle: '会话插件',
  presetSubtitle: '由 Agent 预设按会话组成',
  countUnit: '个',
  switcherLabel: '选择要查看的 Agent 预设',
  presetOptionDefault: '{name}（默认）',
  presetOptionBroken: '{name}（加载失败）',
  globalTitle: '全局插件',
  globalSubtitle: '系统与所有会话共用',
  presetProvidedDetail: '全局已停用，由 Agent 预设按会话提供',
  enabledIn: '启用于',
  viewInPreset: '去预设分组查看',
  matchesInOtherPresets: '其他预设中还有 {count} 个匹配：',
  failedCountLabel: '个失败',
  enabledTag: '已启用',
  disabledTag: '已停用',
  enable: '启用',
  disable: '停用',
  delete: '删除',
  confirmDelete: '确认删除',
  removedNote: '已删除，重启后生效',
  actionError: '操作失败，请重试',
  systemBuiltinHint: '系统内置，仅可停用',
  conditionalTag: '条件启用',
  presetEnabledTag: '预设中启用',
  failedTag: '启动失败',
  moduleLabel: '完整名称',
  fromPreset: '来自',
  condition: '禁用条件',
  configuration: '配置状态',
  runtime: '运行状态',
  unobserved: '未运行',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '运行中',
  failed: '启动失败',
  unloading: '卸载中',
} satisfies Record<string, string>

/** Plugin inventory locale key union. */
export type PluginInventoryLocaleKey = keyof typeof zh

/** 可被标签页覆盖的文案键（HeightLab：MCP 服务标签页覆盖空态/搜索等文案）。 */
export type PluginInventoryCopyKey =
  | 'loading' | 'error' | 'retry' | 'search' | 'empty' | 'emptySearch'

/** 标签页可覆盖的文案子集。 */
export type PluginInventoryCopy = Pick<typeof zh, PluginInventoryCopyKey>

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Plugin list',
  loading: 'Reading plugins…',
  error: 'Plugins are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search plugins',
  empty: 'No plugins are available.',
  emptySearch: 'No matching plugins.',
  presetTitle: 'Session plugins',
  presetSubtitle: 'Composed per session by agent presets',
  countUnit: 'plugins',
  switcherLabel: 'Choose the agent preset to inspect',
  presetOptionDefault: '{name} (default)',
  presetOptionBroken: '{name} (failed to load)',
  globalTitle: 'Global plugins',
  globalSubtitle: 'Shared by the system and every session',
  presetProvidedDetail: 'Disabled globally; agent presets provide it per session',
  enabledIn: 'Enabled in',
  viewInPreset: 'View in the preset group',
  matchesInOtherPresets: '{count} more matches in other presets: ',
  failedCountLabel: 'failed',
  enabledTag: 'Enabled',
  disabledTag: 'Disabled',
  enable: 'Enable',
  disable: 'Disable',
  delete: 'Remove',
  confirmDelete: 'Confirm remove',
  removedNote: 'Removed; restart to apply',
  actionError: 'Action failed, please retry',
  systemBuiltinHint: 'Built-in; disable only',
  conditionalTag: 'Conditional',
  presetEnabledTag: 'Enabled via presets',
  failedTag: 'Failed',
  moduleLabel: 'Module',
  fromPreset: 'From',
  condition: 'Disabled when',
  configuration: 'Configuration',
  runtime: 'Status',
  unobserved: 'Not running',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Running',
  failed: 'Failed to start',
  unloading: 'Unloading',
} satisfies Record<PluginInventoryLocaleKey, string>

/** MCP 服务标签页中文 copy（插件扩展页）。 */
export const mcpZh = {
  tab: 'MCP 服务',
  loading: '正在读取 MCP 服务…',
  error: '暂时无法读取 MCP 服务。',
  retry: '重试',
  search: '搜索 MCP 服务',
  empty: '暂无 MCP 服务。',
  emptySearch: '没有匹配的 MCP 服务。',
} satisfies Record<string, string>

/** MCP 服务标签页英文 copy。 */
export const mcpEn = {
  tab: 'MCP servers',
  loading: 'Reading MCP servers…',
  error: 'MCP servers are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search MCP servers',
  empty: 'No MCP servers are available.',
  emptySearch: 'No matching MCP servers.',
} satisfies Record<string, string>

/** MCP inventory locale key union. */
export type MCPInventoryLocaleKey = keyof typeof mcpZh
