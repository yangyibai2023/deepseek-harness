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

/* 2026-11-03（0.5.4 FIX-8，用户实测）：阈值 1,000 太晚——按 ¥1=452 积分口径
 * 只相当于 ¥2.2，用户早就该被提醒了。而且轮询 5 分钟一次，跨过阈值到提醒
 * 最多延迟 5 分钟，期间可以继续烧。
 *
 * 现在改为按「一次典型生成的预估成本」定阈值：
 *   · 旗舰 2K 视频 203 积分/秒 × 5 秒 ≈ 1,015 积分
 *   · 标准图片 225 积分/张 × 4 张 = 900 积分
 *   → 取 5,000 积分（≈¥11）作为提醒线，保证「再做一次任务就可能不够」时就提示。
 * 同时轮询从 5 分钟缩到 1 分钟，并在 turn 失败时立即刷新（已有）。 */
const LOW_CREDITS_THRESHOLD = 5_000
const POLL_MS = 60 * 1000

type Phase =
  | { kind: 'hidden' }
  | { kind: 'empty'; credits: number }
  | { kind: 'low'; credits: number }

/**
 * 把 /hl/balance 的原始余额换算成人民币。
 * 2026-10-19 上线审计 P1-10：换算率缺失时返回 undefined（→ 不显示提醒），
 * 绝不把内部 quota 单位当人民币——否则 ¥10 的余额看起来像 ¥70 万，
 * 低余额提醒永远不会触发。
 */
/** 内部单位 → 展示积分（2026-11-01 新口径：¥1 = 452 积分；1 单位 = 452/71123.7553 积分）。 */
function readCredits(data: { balance?: number } | undefined): number | undefined {
  if (!data || typeof data.balance !== 'number') return undefined
  return Math.round(data.balance * (452 / (500_000 / 7.03)))
}

export function QuotaNotice(): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: 'hidden' })
  const [dismissed, setDismissed] = useState(false)

  const refresh = useCallback((): void => {
    fetch('/hl/balance', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { ok?: boolean; balance?: number; creditsPerCny?: number }) => {
        const credits = readCredits(data)
        if (!data.ok || credits === undefined) {
          setPhase({ kind: 'hidden' })
          return
        }
        if (credits <= 0) setPhase({ kind: 'empty', credits })
        else if (credits < LOW_CREDITS_THRESHOLD) setPhase({ kind: 'low', credits })
        else setPhase({ kind: 'hidden' })
      })
      .catch(() => { /* 拉不到就不显示，不干扰对话 */ })
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    /**
     * AUTH 类失败 → 先让宿主重新拉一次模型密钥（2026-10-21）。
     *
     * 为什么需要：`DEEPSEEK_API_KEY` 只在登录那一刻从网关拉一次。该 key 若
     * 在网关侧失效（另一台设备重登导致轮换、管理员重置），本地就留下死 key，
     * 用户在本机「重新登录」也不会刷新它 —— 表现为登录成功但一聊天就报
     * 「登录已过期」（Windows 用户实测，反复重登无效）。
     * 这里在失败时打一次自愈端点，下一个回合即可用新 key。
     * 只在 AUTH 触发，且 30s 内最多一次，避免失败风暴里反复请求。
     */
    let lastHealAt = 0
    const onTurnFailed = (event: Event): void => {
      const code = (event as CustomEvent<{ code?: unknown }>).detail.code
      if (code === 'AUTH' && Date.now() - lastHealAt > 30_000) {
        lastHealAt = Date.now()
        void fetch('/hl/refresh-model-key', { method: 'POST' }).catch(() => { /* 失败就交给用户重登 */ })
      }
      refresh()
    }
    window.addEventListener('hl:turn-failed', onTurnFailed)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('hl:turn-failed', onTurnFailed)
    }
  }, [refresh])

  if (dismissed || phase.kind === 'hidden') return null
  const empty = phase.kind === 'empty'
  const cnyText = `${phase.credits.toLocaleString('zh-CN')} 积分`
  const openRecharge = (): void => {
    window.dispatchEvent(new CustomEvent('hl:open-settings-section', { detail: { section: 'heightlab-account' } }))
  }
  return (
    <div className={css.notice} role="status" data-quota-notice={empty ? 'empty' : 'low'}>
      <span className={empty ? `${css.dot} ${css.dotEmpty}` : css.dot} aria-hidden />
      <span className={css.text}>
        {empty
          ? `积分已用尽，充值后即可继续使用（当前剩余 ${cnyText}）`
          : `积分即将用尽（当前剩余 ${cnyText}），建议及时充值`}
      </span>
      <button type="button" className={css.recharge} onClick={openRecharge}>
        充值
      </button>
      <button type="button" className={css.close} aria-label="关闭提醒" onClick={() => { setDismissed(true) }}>
        ×
      </button>
    </div>
  )
}
