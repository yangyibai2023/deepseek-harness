/**
 * HeightLab 展示层脱敏工具（仅展示，不改会话原文/模型可见内容）。
 * 用于会话错误行、未知内容块等会把内部信息露给用户的兜底展示。
 */

const MCP_TOOL_RE = /mcp__[A-Za-z0-9_]+__[A-Za-z0-9_]+/g
const ABSOLUTE_PATH_RE = /(?:\/Users\/[^\s"')\]]+|\/home\/[^\s"')\]]+|\/private\/[^\s"')\]]+|\/var\/[^\s"')\]]+|\/tmp\/[^\s"')\]]+|[A-Za-z]:\\[^\s"')\]]+|~\/[^\s"')\]]+)/g
const MODEL_NAME_RE = /(?:deepseek|gpt|claude|minimax|qwen|glm)-[a-z0-9._-]+/gi
const DSH_HARNESS_RE = /\bDeepSeek Harness\b/gi
const DSH_WORD_RE = /\b(?:cordis|harness)\b/gi
const DSH_UI_RE = /\bdsh-ui\b/gi
const DSH_PACKAGE_RE = /@deepseek-ai\/[a-z0-9-]+/gi

/** 错误原文脱敏：本地路径/内部工具名/模型名/DSH 字样 → 友好中文。 */
export function heightlabFriendlyErrorText(text: string): string {
  let t = text
    .replace(MCP_TOOL_RE, '平台工具')
    .replace(ABSOLUTE_PATH_RE, '本地路径（已隐藏）')
    .replace(MODEL_NAME_RE, '当前模型')
    .replace(DSH_UI_RE, '界面')
    .replace(DSH_PACKAGE_RE, '平台组件')
    .replace(DSH_HARNESS_RE, 'HeightLab 平台')
    .replace(DSH_WORD_RE, '平台')
  t = t.replace(/Error: tools\.restrict\(\)[^\n]*/g, '工具配置错误：当前环境缺少所需工具，请稍后重试。')
  t = t.replace(
    /Error: cannot read "[^"]+" as an image:[^\n]*/gi,
    '图片读取失败：当前模型不支持直接读取该图片，请使用支持图片的模型。',
  )
  t = t.replace(/Error: unknown tool "[^"]+"/gi, '调用失败：所需工具当前不可用。')
  t = t.replace(/\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i, '当前余额不足，请充值后继续使用。')
  t = t.replace(/额度不足|余额不足|credits? insufficient/i, '当前余额不足，请充值后继续使用。')
  t = t.replace(/rate limit|too many requests|requests? too frequent/i, '请求过于频繁，请稍后重试。')
  t = t.replace(/context length|maximum context|input exceeds|token limit/i, '内容超出模型可处理范围，请精简后重试。')
  t = t.replace(/api key|authentication failed|unauthorized|invalid key/i, '服务鉴权失败，请稍后重试或重新登录。')
  t = t.replace(/upstream|timed out|timeout|network error/i, '上游服务暂时不可用，请稍后重试。')
  t = t.replace(/video_url is empty|not a douyin\.com URL|invalid URL/i, '链接无效，请检查输入后重试。')
  t = t.replace(/\bError:/gi, '失败：')
  return t
}

/** 未知/内部内容块的展示占位，不暴露原始 JSON 与内部类型名。 */
export const HEIGHTLAB_UNKNOWN_BLOCK_TEXT = '未知内容块（内容已隐藏）'
