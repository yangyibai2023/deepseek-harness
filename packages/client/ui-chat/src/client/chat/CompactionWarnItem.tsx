// O77 R3：压缩前预警提醒条（compaction/warn 节点的渲染形态）。
// 与 CompactionItem（已落地压缩标记）不同：这是「即将压缩」的预先提醒，
// 事件 log-only 不进模型上下文；建议用户开新会话或 @ 引用关键内容，
// 把「圆环还一半就被压」的突袭感变成有心理准备的过渡。
import { memo } from 'react'
import type { CompactionWarnNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatViewSlotProps } from '../contract/slots.ts'

/** 紧凑数字（1.2万 / 3.4M），与 ContextMeter 的 formatTokens 同风格。 */
function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export const CompactionWarnItem = memo(function CompactionWarnItem({
  node,
  t,
}: {
  node: CompactionWarnNode
  t: ChatViewSlotProps['t']
}) {
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '8px 0',
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))',
        background: 'rgba(245, 158, 11, 0.08)',
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary, #1a1a1a)',
      }}
    >
      <span aria-hidden="true" style={{
        flex: 'none',
        width: 7,
        height: 7,
        borderRadius: 4,
        background: 'var(--dsw-alias-label-warning, #B45309)',
      }} />
      <span>
        {t('message.compaction-warn', {
          tokens: compactTokens(node.estimatedTokens),
          threshold: compactTokens(node.thresholdTokens),
        })}
      </span>
    </div>
  )
})
