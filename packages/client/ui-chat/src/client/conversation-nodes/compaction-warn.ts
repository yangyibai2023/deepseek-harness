import type { Context } from '@deepseek-ai/cordis'
import type {
  CompactionWarnNode, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-compaction/types'
import { chatNode } from './common.ts'

declare module '../contract/chat-nodes.ts' {
  interface ChatNodeDataMap {
    /** O77 R3：压缩前预警（compaction/warn 事件的可见形态，log-only）。 */
    'compaction-warn': CompactionWarnNode
  }
}

/** O77 R3：压缩前预警 Definition——每个 compaction/warn 事件一个提醒节点。 */
export const compactionWarnDefinition: ConversationNodeDefinition<Record<string, never>> = {
  kind: 'compaction-warn',
  target: 'chat',
  match: (event) => {
    if (event.type !== 'compaction/warn') return null
    return { id: `warn-${event.seq}`, role: 'start' }
  },
  start: () => ({}),
  update: context => context.state ?? {},
  buildViewNode: (context) => {
    const event = context.matches[0]?.event
    if (event?.type !== 'compaction/warn') return null
    const data = event.data
    return chatNode(context, 'compaction-warn', event.seq, {
      kind: 'compaction-warn',
      seq: event.seq,
      time: event.time,
      estimatedTokens: data.estimatedTokens,
      thresholdTokens: data.thresholdTokens,
      contextWindow: data.contextWindow ?? null,
    } satisfies CompactionWarnNode)
  },
}

/**
 * Register the compaction-warn business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerCompactionWarnConversationNode(ctx: Context): void {
  ctx.uiConversation.events.register(compactionWarnDefinition)
}
