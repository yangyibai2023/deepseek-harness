/**
 * The frame-wide `shell.overlay` host for quota notices. It holds the one live
 * notice for the whole app, so leaving the Chat panel does not drop it. A
 * `shell.quota-notice` entry may replace the generic Toast for codes it claims.
 */
import { Fragment } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaNoticeHostProps, QuotaNoticeOwnerProps } from '../contract/slots.ts'

/**
 * @param props - the live notice, its dismissal, the chain outlet, and the locale seat.
 * @returns the notice on display, or null while none is live.
 */
export function QuotaNoticeHost({ useNotice, dismissNotice, keepNoticeOpen, renderSlotChain, t }: QuotaNoticeHostProps) {
  const notice = useNotice(current => current)
  if (notice === null) return null
  /* L2（0.5.7 verdict 横幅消费）：banner 类判决按 code 取场景化文案（仲裁器
   * titleKey 同源），quota 类沿用原键。判决种类即通知种类，一处宿主两种呈现。 */
  const bannerKeys: Partial<Record<string, 'message.turnError.auth' | 'message.turnError.modelUnavailable' | 'message.turnError.rateLimited'>> = {
    AUTH: 'message.turnError.auth',
    MODEL_UNAVAILABLE: 'message.turnError.modelUnavailable',
    RATE_LIMITED: 'message.turnError.rateLimited',
  }
  const bannerKey = bannerKeys[notice.code]
  const message = bannerKey !== undefined ? t(bannerKey) : t('message.failure.quota')
  const owner: QuotaNoticeOwnerProps = {
    code: notice.code as QuotaNoticeOwnerProps['code'], message, dismiss: dismissNotice, keepOpen: keepNoticeOpen,
  }
  return (
    <Fragment key={`quota-notice-${String(notice.seq)}`}>
      {renderSlotChain('shell.quota-notice', owner, {
        fallback: <Toast text={owner.message} icon={<IconWarningOutlineRegular size={18} />} onDone={dismissNotice} />,
      })}
    </Fragment>
  )
}
