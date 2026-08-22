/**
 * Pure row-model derivation for tool summary rows: variant classification,
 * one-line summary, expanded-body text, and flattened result output from the
 * frozen call slice. Input material comes from the call ARGUMENTS; output and
 * error material from the settled result node. A call whose render intent is
 * a terminal card gets its expanded body from the views instead, through
 * `terminalCardModel` in terminal-card-model.ts.
 */
// The block union's defining home is runtime (fold-product types); this
// contract only forwards it (type-definition authority stays with the layer
// that produces the values).
import { abbreviateHomePath } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

export type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Tool-call row variants selected by the generic atomic renderer. */
export type ToolRowVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

/** Row state semantic; colors self-supplied via StateDot (design gives none). */
export type ToolRowState = 'running' | 'ok' | 'error' | 'stopped'

/** HeightLab：工具行标题中文化（原为 Figma 英文设计字面量）。 */
export const VARIANT_TITLES: Record<ToolRowVariant, string> = {
  search: '搜索', read: '读取', bash: '终端',
  write: '写入', edit: '编辑', code: '代码', others: '工具调用',
}

/**
 * Known tool name -> variant.
 *
 * `cordis_define` is deliberately absent: ui-cordis registers a keyed
 * `tool.call.toolview` entry for it, and a keyed hit REPLACES the generic row
 * (this table is only reached through GenericToolCard, the dispatch fallback in
 * ToolCallTree). An entry here would be unreachable, and a second title for the
 * same call would be a second answer to a question the card already owns.
 */
const TOOL_VARIANTS: Record<string, ToolRowVariant> = {
  bash: 'bash',
  // The PowerShell twin is a shell tool: the bash row family (icon, colors)
  // with its own title from TOOL_TITLES, not the generic `others` row.
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  cordis_package_inspect: 'read',
  cordis_runtime_inspect: 'read',
  // The three run-control verbs take one package id and produce a receipt, so
  // the generic row is the decided intent, not an unclassified default: there is
  // no program to show (that is `cordis_define`'s card) and no file to open. The
  // id lands in the summary slot, and the titles below name the act.
  cordis_run: 'others',
  cordis_stop: 'others',
  cordis_undefine: 'others',
}

/** Tool-owned titles that refine a generic row variant without replacing it. */
const TOOL_TITLES: Record<string, string> = {
  cordis_package_inspect: '检查',
  cordis_runtime_inspect: '检查',
  cordis_run: '运行插件',
  cordis_stop: '停止插件',
  cordis_undefine: '移除插件',
  pwsh: '终端',
}

/** HeightLab：内部/平台工具名 → 用户友好中文（仅展示，不改模型可见名）。 */
const HEIGHTLAB_TOOL_LABELS: Readonly<Record<string, string>> = {
  validate_dsh_ui: '界面渲染',
  subagent: '子任务',
  subagent_fork: '分支子任务',
  subagent_image: '图片制作专家',
  subagent_content: '内容创作专家',
  subagent_video: '视频制作专家',
  subagent_research: '研究分析专家',
  ask_user_question: '询问用户',
  create_goal: '创建目标',
  get_goal: '查看目标',
  list_agents: '智能体列表',
  interrupt_agent: '中断任务',
  job_kill: '终止任务',
  job_list: '任务列表',
  job_output: '任务输出',
  'mcp__heightlab-tools__heightlab_image_generate': '图片生成',
  'mcp__heightlab-tools__heightlab_image_analyze': '图片理解',
  'mcp__heightlab-tools__video_replication': '视频生成',
  'mcp__heightlab-tools__heightlab_video_generate': '视频生成',
  'mcp__heightlab-tools__video_edit': '视频剪辑',
  'mcp__heightlab-tools__video_storyboard': '分镜故事板',
  'mcp__heightlab-tools__talking_head_production': '数字人口播',
  'mcp__heightlab-tools__heightlab_video_analyze': '视频分析',
  'mcp__heightlab-tools__xiaohongshu_content': '小红书内容',
  'mcp__heightlab-tools__xiaohongshu_copy': '小红书文案',
  'mcp__heightlab-tools__xiaohongshu_extract': '小红书提取',
  'mcp__heightlab-tools__douyin_video_analysis': '抖音视频分析',
  'mcp__heightlab-tools__dydata_account_analysis': '账号数据分析',
  'mcp__heightlab-tools__dydata_account_status': '账号状态',
  'mcp__heightlab-tools__heightlab_live_search': '直播搜索',
  'mcp__minimax__understand_image': '图片理解',
}

/** HeightLab：展示层脱敏（仅展示，不改模型可见内容/会话原文）。 */
const MCP_TOOL_RE = /mcp__[A-Za-z0-9_]+__[A-Za-z0-9_]+/g
const ABSOLUTE_PATH_RE = /(?:\/Users\/[^\s"')\]]+|\/home\/[^\s"')\]]+|\/private\/[^\s"')\]]+|\/var\/[^\s"')\]]+|\/tmp\/[^\s"')\]]+|[A-Za-z]:\\[^\s"')\]]+|~\/[^\s"')\]]+)/g
const MODEL_NAME_RE = /(?:deepseek|gpt|claude|minimax|qwen|glm)-[a-z0-9._-]+/gi
const DSH_HARNESS_RE = /\bDeepSeek Harness\b/gi
const DSH_WORD_RE = /\b(?:cordis|harness)\b/gi
const DSH_UI_RE = /\bdsh-ui\b/gi
const DSH_PACKAGE_RE = /@deepseek-ai\/[a-z0-9-]+/gi

function heightlabSanitizeInternal(text: string): string {
  return text
    .replace(MCP_TOOL_RE, full => HEIGHTLAB_TOOL_LABELS[full] ?? '平台工具')
    .replace(ABSOLUTE_PATH_RE, '本地路径（已隐藏）')
    .replace(MODEL_NAME_RE, '当前模型')
    .replace(DSH_UI_RE, '界面')
    .replace(DSH_PACKAGE_RE, '平台组件')
    .replace(DSH_HARNESS_RE, 'HeightLab 平台')
    .replace(DSH_WORD_RE, '平台')
}

/** HeightLab：错误原文脱敏，替换为友好中文（仅工具错误结果展示层）。 */
function heightlabSanitizeErrorText(text: string): string {
  let t = heightlabSanitizeInternal(text)
  t = t.replace(
    /Error: tools\.restrict\(\) names unknown global tool "[^"]+"; known global tools:[^"]*/g,
    '工具配置错误：当前环境缺少所需工具，请稍后重试。',
  )
  t = t.replace(
    /Error: cannot read "[^"]+" as an image:[^\n]*/gi,
    '图片读取失败：当前模型不支持直接读取该图片，请使用支持图片的模型。',
  )
  t = t.replace(/Error: unknown tool "[^"]+"/gi, '调用失败：所需工具当前不可用。')
  t = t.replace(/\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i, '当前余额不足，请充值后继续使用。')
  t = t.replace(/rate limit|too many requests|requests? too frequent/i, '请求过于频繁，请稍后重试。')
  t = t.replace(/context length|maximum context|input exceeds|token limit/i, '内容超出模型可处理范围，请精简后重试。')
  t = t.replace(/api key|authentication failed|unauthorized|invalid key/i, '服务鉴权失败，请稍后重试或重新登录。')
  t = t.replace(/upstream|timed out|timeout|network error/i, '上游服务暂时不可用，请稍后重试。')
  t = t.replace(/video_url is empty|not a douyin\.com URL|invalid URL/i, '链接无效，请检查输入后重试。')
  t = t.replace(/\bError:/gi, '失败：')
  return t
}

/**
 * Classify a tool name into its row variant.
 * @param toolName - wire tool name.
 * @returns matching variant, others when unknown.
 */
export function classifyTool(toolName: string): ToolRowVariant {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

/** Everything ToolRow needs, derived once from the frozen slice. */
export interface ToolRowModel {
  variant: ToolRowVariant
  title: string
  summary: string
  /**
   * Filesystem path from args (`path` / `file_path`) when the row is a file
   * tool; absent for URL reads and non-file tools. The chat view resolves
   * relative values against the session cwd before opening.
   */
  filePath: string | undefined
  /** Expanded-body input text (pretty args); null = no input section. */
  body: string | null
  /** Flattened result text ({@link resultText}); null while running or when the result carries no text. */
  output: string | null
  /** First line of the result text on an error row; null for every other state. */
  errorSummary: string | null
  state: ToolRowState
}

/**
 * Flatten a settled result's content blocks to display text: text blocks
 * verbatim, other block shapes as pretty JSON. Empty content on a failed call
 * falls back to the structured error's `name: code` line.
 * @param node - the settled result node.
 * @returns the flattened result text (may be empty).
 */
export function resultText(node: ToolResultNode): string {
  const error = node.isError === true
  const parts: string[] = []
  for (const block of node.content) {
    if (block.type === 'text') {
      parts.push(error ? heightlabSanitizeErrorText(block.text) : block.text)
    } else {
      const text = JSON.stringify(block, null, 2)
      parts.push(error ? heightlabSanitizeErrorText(text) : text)
    }
  }
  if (parts.length === 0 && node.error !== undefined) {
    const text = `${node.error.name}: ${node.error.code}`
    parts.push(error ? heightlabSanitizeErrorText(text) : text)
  }
  return parts.join('\n')
}

function parseArgs(argsRaw: string): unknown {
  try {
    return JSON.parse(argsRaw)
  } catch {
    // Non-JSON args (mid-stream truncation): summary/body fall back to the raw string.
    return undefined
  }
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = args[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return undefined
}

/** Summary key preference per variant (args-derived; result-derived summaries are a ledger item). */
const SUMMARY_KEYS: Record<ToolRowVariant, readonly string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}

/**
 * Strip the workspace root from a workspace-rooted absolute path (display only).
 * @param text - the path to shorten.
 * @param cwd - session workspace root; absent or empty leaves the path unchanged.
 * @returns the path relative to the workspace root, or unchanged when it is not rooted there.
 */
export function relativizeToCwd(text: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return text
  const root = cwd.replace(/[/\\]+$/, '')
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1)
  return text
}

function deriveSummary(variant: ToolRowVariant, argsRaw: string): string {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return firstLine(argsRaw)
  const args = parsed as Record<string, unknown>
  if (variant === 'search' && Array.isArray(args.queries)) {
    const queries = args.queries.filter((query): query is string => typeof query === 'string' && query !== '')
    if (queries.length > 0) return queries.map(firstLine).join(', ')
  }
  const picked = pickString(args, SUMMARY_KEYS[variant])
  if (picked !== undefined) return firstLine(picked)
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v !== '') return firstLine(v)
  }
  return firstLine(argsRaw)
}

/** Path keys only — never `url` (web_fetch lands on the read variant). */
const FILE_PATH_KEYS = ['path', 'file_path'] as const

/** File-tool variants whose summary may be an openable workspace path. */
const FILE_PATH_VARIANTS: ReadonlySet<ToolRowVariant> = new Set(['read', 'write', 'edit'])

function deriveFilePath(variant: ToolRowVariant, argsRaw: string): string | undefined {
  if (!FILE_PATH_VARIANTS.has(variant)) return undefined
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const picked = pickString(parsed as Record<string, unknown>, FILE_PATH_KEYS)
  return picked === undefined ? undefined : firstLine(picked)
}

function deriveBody(variant: ToolRowVariant, argsRaw: string): string | null {
  if (argsRaw === '') return null
  const parsed = parseArgs(argsRaw)
  if (parsed === undefined) return heightlabSanitizeInternal(argsRaw)
  // The code row's expanded body IS the program (monospace via the row's
  // variant styling), not the args JSON envelope around it.
  if (variant === 'code' && typeof parsed === 'object' && parsed !== null) {
    const code = (parsed as Record<string, unknown>).code
    if (typeof code === 'string' && code !== '') return code
  }
  return heightlabSanitizeInternal(JSON.stringify(parsed, null, 2))
}

/**
 * Derive the full row model from a frozen call slice.
 * @param toolName - wire tool name (dispatch-supplied; survives windowless results).
 * @param block - RunningToolCall or ToolResultNode off the snapshot caches.
 * @param cwd - session workspace root; workspace-rooted path summaries display relative to it.
 * @param home - host account home; a leftover POSIX home path displays as `~`.
 * @returns the row model.
 */
export function toolRowModel(toolName: string, block: ToolCallBlock, cwd?: string, home?: string): ToolRowModel {
  const variant = classifyTool(toolName)
  const done = 'kind' in block
  const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? ''
  const state: ToolRowState = !done ? 'running'
    : block.error?.code === 'interrupted' ? 'stopped'
      : block.isError ? 'error' : 'ok'
  const base = argsRaw === ''
    ? block.callId
    : abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home)
  const toolTitle = TOOL_TITLES[toolName]
  // Others keeps the static "Tool call" title (figma literal); the real tool
  // name rides the mutable summary slot unless the tool owns a specific title.
  // HeightLab：内部工具名映射为中文；未知工具只显示「已调用」，不露原始名/参数。
  const summary = variant === 'others' && toolName !== '' && toolTitle === undefined
    ? (HEIGHTLAB_TOOL_LABELS[toolName] ?? '已调用')
    : base
  // The empty string is "no text" for both derived result fields: a settled
  // call with blank content has nothing to expand, and a blank first line
  // would erase the collapsed error row's summary slot.
  const output = done ? (resultText(block) || null) : null
  const errorSummary = state === 'error' && output !== null ? firstLine(output) : null
  return {
    variant,
    title: toolTitle ?? VARIANT_TITLES[variant],
    summary,
    filePath: deriveFilePath(variant, argsRaw),
    body: deriveBody(variant, argsRaw),
    output,
    errorSummary,
    state,
  }
}
