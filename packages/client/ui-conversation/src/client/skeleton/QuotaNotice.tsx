/**
 * HeightLab 2026-10-13：余额提醒条。余额充足时完全不渲染；低于阈值提醒；
 * 耗尽时阻断提醒，并提供「充值」直达入口（账户设置的充值区）。
 * 数据源 /hl/balance，刷新时机 = 挂载 / 每 5 分钟 / hl:turn-failed。
 *
 * 2026-10-21 用户拍板两处调整：
 *  ① 位置：挪到**大标题上方**（那里本来是空白）。原先夹在标题与输入框之间，
 *     把输入框左上角「我的工作区」的布局挤变了形。
 *  ② 样式：原内联样式是自定义的琥珀/红色块，与本产品（DSH 原生设计语言）
 *     不协调。改为**纯令牌实现**：底色用 --dsw-alias-bg-layer-1、描边用
 *     --dsw-alias-border-l2、主文字用 --dsw-alias-label-primary、强调用
 *     --dsw-alias-state-business-primary。告警程度只体现在小圆点与文字上，
 *     不再整条换底色——视觉噪声更低，也更贴近原生。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import css from './QuotaNotice.module.css'

const LOW_CNY_THRESHOLD = 10
const POLL_MS = 5 * 60 * 1000

type Phase =
  | { kind: 'hidden' }
  | { kind: 'empty'; cny: number }
  | { kind: 'low'; cny: number }

/**
 * 把 /hl/balance 的原始余额换算成人民币。
 * 2026-10-19 上线审计 P1-10：换算率缺失时返回 undefined（→ 不显示提醒），
 * 绝不把内部 quota 单位当人民币——否则 ¥10 的余额看起来像 ¥70 万，
 * 低余额提醒永远不会触发。
 */
function readCny(data: { balance?: number; creditsPerCny?: number } | undefined): number | undefined {
  if (!data || typeof data.balance !== 'number') return undefined
  if (typeof data.creditsPerCny !== 'number' || !(data.creditsPerCny > 0)) return undefined
  return data.balance / data.creditsPerCny
}

export function QuotaNotice(): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: 'hidden' })
  const [dismissed, setDismissed] = useState(false)

  const refresh = useCallback((): void => {
    fetch('/hl/balance', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { ok?: boolean; balance?: number; creditsPerCny?: number }) => {
        const cny = readCny(data)
        if (!data?.ok || cny === undefined) {
          setPhase({ kind: 'hidden' })
          return
        }
        if (cny <= 0.01) setPhase({ kind: 'empty', cny })
        else if (cny < LOW_CNY_THRESHOLD) setPhase({ kind: 'low', cny })
        else setPhase({ kind: 'hidden' })
      })
      .catch(() => { /* 拉不到就不显示，不干扰对话 */ })
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    const onTurnFailed = (): void => refresh()
    window.addEventListener('hl:turn-failed', onTurnFailed)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('hl:turn-failed', onTurnFailed)
    }
  }, [refresh])

  if (dismissed || phase.kind === 'hidden') return null
  const empty = phase.kind === 'empty'
  const cnyText = `¥${phase.cny.toFixed(2)}`
  const openRecharge = (): void => {
    window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
  }
  return (
    <div className={css.notice} role="status" data-quota-notice={empty ? 'empty' : 'low'}>
      <span className={empty ? `${css.dot} ${css.dotEmpty}` : css.dot} aria-hidden />
      <span className={css.text}>
        {empty
          ? `额度已用尽，充值后即可继续使用（当前余额 ${cnyText}）`
          : `额度即将用尽（当前余额 ${cnyText}），建议及时充值`}
      </span>
      <button type="button" className={css.recharge} onClick={openRecharge}>
        充值
      </button>
      <button type="button" className={css.close} aria-label="关闭提醒" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  )
}
