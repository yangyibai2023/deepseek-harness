/**
 * HeightLab：插件清单的预装隐藏策略 + MCP 服务标签页（2026-11-10 从
 * `index.ts` 抽离，C 阶段「降低 vendor 渗透」首个试点）。
 *
 * ## 为什么抽离
 * 这段定制原本直接写在上游文件
 * `ui-settings-plugin-inventory/src/client/index.ts` 里（171 行新增），
 * 属于「深度渗透」——上游升级会整段覆盖/冲突，而这段逻辑本身与上游的
 * 清单读取毫无耦合，抽出来零成本。
 *
 * 抽离后：**原生文件只留 import + 一行接线**，本文件是我们的自有文件
 * （上游不存在此路径，升级零冲突）。这是 .claude/rules/19-vendor-upstream.md
 * 三级裁决里的第 2 类处置（「结构变了 → 抽成独立文件」）的标准做法。
 *
 * ## 产品语义（沿革）
 * 「预装一律隐藏，只显示用户自己装的」——用户 2026-10-21 截图确认漏出 4 条
 * 后确立的规则。三个隐藏维度互补：
 *   ① entryId 名单（精确，上游改名就失效）
 *   ② moduleName 前缀（scope 更稳，改名也命中）
 *   ③ agentPreset 组 id 名单（0.1.5 新增的「会话插件」列表）
 */
import type { AgentPresetPluginGroup } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { PluginInventorySettingsTab, type PluginInventorySettingsTabInjected } from './PluginInventorySettingsTab.tsx'
import { mcpEn, mcpZh, type MCPInventoryLocaleKey } from './locales.ts'

/** MCP 服务标签页 dictionary namespace。 */
export const MCP_NS = 'settings.pluginInventoryMCP'

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
 * 预装插件的 entryId 名单。
 *
 * ⚠️ 2026-10-21 实测漏出 4 条（用户截图确认）：video-downloader / 插件市场 /
 * ds-bot / ds-bot/web-search。它们都是我们**随包预装**的社区插件，属「预装
 * 一律隐藏」。漏的原因是新装插件只加了模块名、没加 entryId，而 entryId 与
 * 模块名不一定同名（market 的 entryId 是 `dsh-market`、模块名是 `dshmarket`；
 * ds-bot 的 web search 行模块名是 `ds-bot/web-search`）。因此下面同时按
 * **entryId** 与**模块名**收录，并在 isUserInstalled 里加 scope 前缀兜底。
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
  // 2026-10-21 补：预装但此前漏出的四条。
  'video-downloader',
  'dsh-market',
  'bot',
  'web-search-auto',
])

/**
 * 预装社区插件的**模块名前缀**。
 * 与 entryId 名单互补：entryId 会随上游改名，模块名 scope 更稳。
 * 判据是「我们随包预装了它」——用户自己装的同 scope 包目前不存在，
 * 若将来出现，应改为白名单而不是放宽这里。
 */
const SHIPPED_MODULE_PREFIXES: ReadonlyArray<string> = [
  '@omdsh-dev/',
  '@changfenhuang/',
  '@liustack/',
  '@dsh-external/',
  '@heightlab/',
  'dsh-knowledge',
  'dsh-better-sidebar',
  'dshmarket',
  'ds-bot',
  'dsh-video-downloader',
]

/** Whether one Loader entry is user-installed (visible in the list). */
function isUserInstalled(entry: { entryId: string; moduleName: string }): boolean {
  // Loader id 可能带 'include:' 等前缀，短 id 与全 id 都比对。
  const shortId = entry.entryId.split(':').pop() ?? entry.entryId
  if (HEIGHTLAB_ENTRY_IDS.has(shortId) || HEIGHTLAB_ENTRY_IDS.has(entry.entryId)) return false
  // 2026-10-21 补：`heightlab-*` 的 entryId 有十几个（film / canvas-tools /
  // enterprise / team-welcome / local-guard / customization-guard / …），
  // 逐个列名单必然漏（实测 heightlab-film 就会漏出）。前缀判据一次覆盖。
  if (shortId.startsWith('heightlab')) return false
  const name = entry.moduleName
  // 用户自装的 MCP 客户端行（module 也是 @deepseek-ai/dsh-mcp-client）只要
  // 不是内置的 heightlab-tools，就算用户自装，两个标签页都会显示并可管理。
  if (name === MCP_CLIENT_MODULE) return !isShippedMcpEntry(entry)
  // 预装社区插件的模块名前缀（scope 与包名两类）——比 entryId 更稳，
  // 上游改 id 也不会漏（2026-10-21 漏出四条后补）。
  for (const prefix of SHIPPED_MODULE_PREFIXES) {
    if (name.startsWith(prefix)) return false
  }
  if (name.includes('heightlab')) return false
  if (name.startsWith('@deepseek-ai/')) return false
  if (name.startsWith('cordis-plugin-') || name === 'cordis') return false
  if (name.startsWith('cordis:')) return false
  return true
}

/** 我们预装 / 上游 shipped 的 Agent 预设 id（其内部工具行一律隐藏）。 */
const SHIPPED_PRESET_IDS: ReadonlySet<string> = new Set([
  'content-creator', 'image-generator', 'research-analyst',
  'video-producer', 'general-assistant', 'automation-worker',
  // 2026-10-16 补：上游 shipped 预设（standard=Colin Commander /
  // minimal / ptc）的组合行同样属「预装一律隐藏」——此前漏 standard，
  // Colin Commander 默认组合的 28 个内部工具行全部漏出（用户实测）。
  'standard', 'minimal', 'ptc',
  // 创造模式预设（Creator mode，colin 自定义链）组合行同属预装隐藏。
  'cordis',
])

/**
 * 0.1.5 新增 agentPresets（「会话插件」列表）后必须过滤：
 * 客户端原样渲染会把 28 个内部工具行（persona / tool-bash / tool-fs…）
 * 暴露给用户。0.2.1 起组类型不再带 trust，改以预装 id 集合判定——
 * 用户自建预设的 id 不在集合内，天然保留。
 */
function keepUserPresetGroups(
  groups: readonly AgentPresetPluginGroup[] | undefined,
): readonly AgentPresetPluginGroup[] | undefined {
  return groups?.filter(group => !SHIPPED_PRESET_IDS.has(group.id))
}

/**
 * 构造两个标签页各自的 list：
 *   · list    —— 插件列表（过滤预装 + 保留用户自建预设组）
 *   · mcpList —— MCP 服务（只留用户自装的 MCP；会话插件组整体不进）
 *
 * 抽离后原生 `index.ts` 只调用本函数，不再携带任何策略逻辑。
 * @param ctx - client context（只需 remote.pluginInventory.list）
 * @returns 两个 list 实现
 */
export function makeInventoryLists(ctx: ClientContext): {
  list: PluginInventorySettingsTabInjected['list']
  mcpList: PluginInventorySettingsTabInjected['list']
} {
  // list 的类型是 () => Promise<Snapshot>，故 ReturnType 后再 Awaited。
  type Snapshot = Awaited<ReturnType<PluginInventorySettingsTabInjected['list']>>
  const fetchValue = async (): Promise<Snapshot> => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value as Snapshot
  }

  const list: PluginInventorySettingsTabInjected['list'] = async () => {
    const value = await fetchValue()
    const agentPresets = keepUserPresetGroups(value.agentPresets)
    return {
      ...value,
      ...(agentPresets === undefined ? {} : { agentPresets }),
      entries: value.entries.filter(isUserInstalled),
    }
  }
  const mcpList: PluginInventorySettingsTabInjected['list'] = async () => {
    const value = await fetchValue()
    return {
      ...value,
      // MCP 标签页只显示用户自装的 MCP（系统内置的 heightlab-tools 隐藏）。
      // 会话插件组（agentPresets）整体不进 MCP 标签页——2026-09-16 用户实测
      // 漏出 Colin 指挥官（默认）·28 个内部工具行，即此处漏过滤所致。
      agentPresets: [],
      entries: value.entries.filter(
        (entry: { entryId: string; moduleName: string }) =>
          entry.moduleName === MCP_CLIENT_MODULE && isUserInstalled(entry),
      ),
    }
  }
  return { list, mcpList }
}

/**
 * 注册「MCP 服务」标签页（HeightLab 新增，上游没有）。
 *
 * 只读查看 Loader 中挂载的 MCP 客户端条目；点击卡片可展开查看标识与状态。
 * @param ctx - client context
 * @param deps - 上游侧提供的依赖（组件 / 预设名解析 / 字典 / 基础 namespace）
 */
export function registerHeightLabMcpTab(
  ctx: ClientContext,
  deps: {
    NS: 'settings.pluginInventory'
    presetName: PluginInventorySettingsTabInjected['presetName']
    mcpList: PluginInventorySettingsTabInjected['list']
  },
): void {
  ctx.effect(
    () => ctx.locale.register(MCP_NS, { zh: mcpZh, en: mcpEn }),
    'ui-settings-plugin-inventory: mcp dictionaries',
  )
  const tMCP = ctx.locale.bind(MCP_NS)
  const injected = (): PluginInventorySettingsTabInjected => ({
    list: deps.mcpList,
    presetName: deps.presetName,
    resolveText: text => ctx.locale.resolveText(text),
    hooks: { clientSync: ctx.modules.entries.state },
    retryClient: () => { void ctx.modules.entries.retry().catch((error: unknown) => { ctx.logger.error(error) }) },
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'mcp',
    order: 20,
    label: () => tMCP('tab'),
    locale: deps.NS,
    inject: injected,
  }, PluginInventorySettingsTab))
}

/** MCP 标签页的 locale 命名空间键（供原生文件声明 augment 用）。 */
export type { MCPInventoryLocaleKey }
