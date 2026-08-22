/** Copy dictionaries for the plugin inventory Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '插件列表',
  loading: '正在读取插件…',
  error: '暂时无法读取插件。',
  retry: '重试',
  search: '搜索插件',
  catalog: '插件列表',
  empty: '暂无插件。',
  emptySearch: '没有匹配的插件。',
  enabledTag: '已启用',
  disabledTag: '已停用',
  enable: '启用',
  disable: '停用',
  delete: '删除',
  confirmDelete: '确认删除',
  removedNote: '已删除，重启后生效',
  actionError: '操作失败，请重试',
  systemBuiltinHint: '系统内置，仅可停用',
  configuration: '配置状态',
  cordis: 'Cordis 状态',
  unobserved: '未挂载',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
} satisfies Record<string, string>

/** Plugin inventory locale key union. */
export type PluginInventoryLocaleKey = keyof typeof zh

/** 可被标签页覆盖的文案键（HeightLab：MCP 服务标签页覆盖空态/搜索等文案）。 */
export type PluginInventoryCopyKey =
  | 'loading' | 'error' | 'retry' | 'search' | 'catalog' | 'empty' | 'emptySearch'

/** 标签页可覆盖的文案子集。 */
export type PluginInventoryCopy = Pick<typeof zh, PluginInventoryCopyKey>

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Plugin list',
  loading: 'Reading plugins…',
  error: 'Plugins are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search plugins',
  catalog: 'Plugin list',
  empty: 'No plugins are available.',
  emptySearch: 'No matching plugins.',
  enabledTag: 'Enabled',
  disabledTag: 'Disabled',
  enable: 'Enable',
  disable: 'Disable',
  delete: 'Remove',
  confirmDelete: 'Confirm remove',
  removedNote: 'Removed; restart to apply',
  actionError: 'Action failed, please retry',
  systemBuiltinHint: 'Built-in; disable only',
  configuration: 'Configuration',
  cordis: 'Cordis status',
  unobserved: 'Not mounted',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Mount failed',
  unloading: 'Unloading',
} satisfies Record<PluginInventoryLocaleKey, string>

/** MCP 服务标签页中文 copy（插件扩展页）。 */
export const mcpZh = {
  tab: 'MCP 服务',
  loading: '正在读取 MCP 服务…',
  error: '暂时无法读取 MCP 服务。',
  retry: '重试',
  search: '搜索 MCP 服务',
  catalog: 'MCP 服务',
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
  catalog: 'MCP servers',
  empty: 'No MCP servers are available.',
  emptySearch: 'No matching MCP servers.',
} satisfies Record<string, string>

/** MCP inventory locale key union. */
export type MCPInventoryLocaleKey = keyof typeof mcpZh
