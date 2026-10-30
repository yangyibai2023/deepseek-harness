/**
 * HeightLab（B1 方案② V2，2026-10-30 用户反馈定形）：思考内容以**独立一行**
 * 持续滚动展示（折叠态、单行、随流式不断更新），位于「高能研究中·用时」行
 * 的上方；该行本身不做任何改动（用户明确要求不动）。
 *
 * 为什么用模块级发布器而不是 store 选择器：思考正文经由 reasoning content Factory
 * 进入 ReasoningContent（折叠时保持挂载，ProcessReasoning 只切 data 属性），
 * 而流程尾部的 RunningStatus 拿不到同一 store 的 reasoning 文本切片；两者同属
 * ui-chat，模块级单订阅通道是最小接线。同一窗口同时跑多个运行轮的场景极罕见，
 * 且本通道只影响一行装饰性摘要（带 8 秒新鲜度兜底，陈旧自动隐藏）。
 */

/** 尾部保留长度：足够看出「正在做什么」，又不至于把折叠行顶成两行。 */
const TAIL_CHARS = 96
/** 新鲜度：超过该毫秒数没有新思考文本就不再展示（卡死/纯工具轮回落原样式）。 */
const FRESH_MS = 8000

interface TailState {
  text: string
  at: number
}

let state: TailState = { text: '', at: 0 }
const subscribers = new Set<() => void>()

const emit = (): void => { for (const notify of subscribers) notify() }

/** 单行化并截尾：思考文本换行密集，折叠行只容一行。 */
const singleLineTail = (text: string): string => {
  const line = text.replace(/\s+/gu, ' ').trim()
  return line.length <= TAIL_CHARS ? line : '…' + line.slice(-TAIL_CHARS)
}

/**
 * 发布当前思考尾部；空串表示本轮思考结束或不可用（订阅方随即隐藏）。
 * @param text 最新累计思考文本（原样，调用方无须预处理）。
 */
export function publishReasoningTail(text: string): void {
  const line = text === '' ? '' : singleLineTail(text)
  if (line === state.text && state.text !== '') return
  state = { text: line, at: text === '' ? 0 : Date.now() }
  emit()
}

/** 订阅尾部变化（useSyncExternalStore 用）。 */
export function subscribeReasoningTail(notify: () => void): () => void {
  subscribers.add(notify)
  return () => { subscribers.delete(notify) }
}

/** 当前尾部快照；超过新鲜度视为空（运行卡住时不假装还在想）。 */
export function getReasoningTail(): string {
  return state.text !== '' && Date.now() - state.at <= FRESH_MS ? state.text : ''
}
