/**
 * HeightLab 2026-10-13：输入框上方余额提示条（对标 ZCode/Cursor 的前置
 * 额度提醒）。余额充足时完全不渲染；低于阈值琥珀色提醒；耗尽红色阻断提醒
 * 并提供「充值」直达入口（打开账户设置的充值区）。数据源 /hl/balance，
 * 刷新时机 = 挂载 / 每 5 分钟 / 收到 hl:turn-failed（额度类失败即时刷新）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

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
  const cnyText = `\¥${phase.cny.toFixed(2)}`
  const openRecharge = (): void => {
    window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
  }
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 640, margin: '0 auto 10px', padding: '8px 14px',
        borderRadius: 10, fontSize: 13,
        background: empty ? '#fff1f0' : '#fffbe6',
        border: empty ? '1px solid #ffa39e' : '1px solid #ffe58f',
        color: '#1a1a1a',
      }}
    >
      <span style={{ flex: 1 }}>
        {empty
          ? `额度已用尽，充值后即可继续使用（当前余额 ${cnyText}）`
          : `额度即将用尽（当前余额 ${cnyText}），建议及时充值`}
      </span>
      <button
        type="button"
        onClick={openRecharge}
        style={{
          padding: '4px 14px', borderRadius: 6, border: 'none',
          background: empty ? '#cf1322' : '#d48806', color: '#fff',
          fontSize: 12, cursor: 'pointer', flexShrink: 0,
        }}
      >
        充值
      </button>
      <button
        type="button"
        aria-label="关闭提醒"
        onClick={() => setDismissed(true)}
        style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
