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
  /* O6（2026-11-08 用户实测「思考时整页偶尔抖动」）：思考内容是**阵发性**的——
   * tail 在「有片段」和「空」之间交替，下面的 `tail !== '' &&` 条件行随之
   * 反复挂载/卸载，块高每次 ±20px -> 整页内容上下移 = 抖动。
   * 历史：B1_NOJITTER 曾用「占位常驻」零抖动，但 2026-10-31 用户定稿
   * 「有思考内容才出现该行」（不要常驻空行）——两个要求冲突。
   * 本修法同时满足两者：行**一旦出现就保留到本回合结束**（短暂变空时冻结
   * 最后一帧，不卸载）——首现仍由思考内容触发（10-31 决策不变），其后行高
   * 恒定零抖动。新回合（startTime 变化）时重置。 */
  const [tailHold, setTailHold] = useState('')
  useEffect(() => {
    if (tail !== '') setTailHold(tail)
  }, [tail])
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    setTailHold('')
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
      {(tail !== '' || tailHold !== '') && (
        <div className={css.runningTailLine} data-b1="v5" aria-hidden="true">{tail !== '' ? tail : tailHold}</div>
      )}
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
