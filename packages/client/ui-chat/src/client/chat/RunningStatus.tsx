/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState, useSyncExternalStore } from 'react'
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import { RunningWhaleTail } from './RunningWhaleTail.tsx'
import { getReasoningTail, subscribeReasoningTail } from './ReasoningLiveTail.ts'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

interface RunningStatusProps {
  readonly startTime: number | undefined
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * HeightLab（B1 方案② V2）：思考内容以独立一行（.runningTailLine）显示在用时行
 * 上方，折叠态单行持续滚动更新；用时行本身保持原样（用户 2026-10-30 拍板）。
 * @param props - Current Turn start time and localized copy.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  const tail = useSyncExternalStore(subscribeReasoningTail, getReasoningTail)
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t).map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running>
      {/* B1_NOJITTER：占位常驻（空时 hidden），运行期间行高恒定，页面零抖动 */}
      {/* B1 V4（2026-10-31 用户定稿）：有思考内容才出现该行；灰色；页面抖动另查 */}
      {tail !== '' && <div className={css.runningTailLine} data-b1="v4" aria-hidden="true">{tail}</div>}
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
