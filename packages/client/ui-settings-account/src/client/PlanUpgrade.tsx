/**
 * HeightLab 升级套餐（2026-10-30 用户定稿）——照 Z 扣形态的全屏覆盖层。
 *
 * 结构：个人套餐 | 团队套餐（团队置灰「即将上线」）
 *       连续包月 | 连续包年（无包季；年付角标「省 2 个月」）
 *       卡片：标准版 / 旗舰版（照 planCatalog 下发数据渲染，前端不硬编码价格）
 *
 * 打开方式：账户菜单「升级套餐」。样式沿用应用既有的中性卡片 + 黑色主按钮，
 * 不引入新的设计语言（与「页级统一」偏好一致）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import css from './PlanUpgrade.module.css'

type PlanCycle = 'monthly' | 'yearly'

interface PlanPrice {
  amount: number
  includedTokens: number
  displayCycle: '月' | '年'
  badge?: string
}

interface PlanTier {
  id: string
  name: string
  audience: string
  slogan: string
  features: string[]
  prices: Record<PlanCycle, PlanPrice>
  purchasable: boolean
}

interface TeamPlanPlaceholder {
  id: string
  name: string
  audience: string
  status: string
  note: string
}

interface PlanCatalogResponse {
  plans?: { personal?: PlanTier[]; team?: TeamPlanPlaceholder }
}

const TOKEN_UNITS: Array<{ threshold: number; label: string }> = [
  { threshold: 1e8, label: '亿' },
  { threshold: 1e4, label: '万' },
]

/** 1.5亿 / 1250万 这类中文额度口径（保留至多一位小数）。 */
function formatTokens(tokens: number): string {
  for (const unit of TOKEN_UNITS) {
    if (tokens >= unit.threshold) {
      const value = tokens / unit.threshold
      const text = Number.isInteger(value) ? String(value) : value.toFixed(1)
      return `${text} ${unit.label}`
    }
  }
  return String(tokens)
}

function formatCny(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN')}`
}

export interface PlanUpgradeProps {
  readonly close: () => void
}

export function PlanUpgrade({ close }: PlanUpgradeProps) {
  const [catalog, setCatalog] = useState<PlanCatalogResponse['plans']>()
  const [cycle, setCycle] = useState<PlanCycle>('monthly')
  const [busyTier, setBusyTier] = useState<string>()
  const [error, setError] = useState<string>()
  const [tab, setTab] = useState<'personal' | 'team'>('personal')

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch('/api/commercial/plans', { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as PlanCatalogResponse
        setCatalog(data.plans)
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { controller.abort() }
  }, [])

  const tiers = catalog?.personal ?? []
  const team = catalog?.team

  const startCheckout = useCallback(async (tier: PlanTier) => {
    const price = tier.prices[cycle]
    setBusyTier(tier.id)
    setError(undefined)
    try {
      // 支付方式由用户在下单弹窗选择；这里先按微信发起（易支付/原生均支持）。
      const res = await fetch('/api/commercial/payment-topups/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: price.amount,
          paymentMethod: 'wxpay',
          planTier: tier.id,
          planCycle: cycle,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        checkout?: { checkoutUrl?: string; checkout_url?: string }
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const url = data.checkout?.checkoutUrl ?? data.checkout?.checkout_url
      if (url !== undefined && url !== '') {
        // 桌面 WebView 内直接打开支付页（微信/支付宝 H5 可拉起 App）。
        window.open(url, '_blank', 'noopener')
      } else {
        setError('下单成功但未返回支付地址，请稍后重试或联系客服。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyTier(undefined)
    }
  }, [cycle])

  const cycleOptions = useMemo(() => ([
    { id: 'monthly' as const, label: '连续包月' },
    { id: 'yearly' as const, label: '连续包年', badge: tiers[0]?.prices.yearly.badge },
  ]), [tiers])

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label="升级套餐">
      <div className={css.sheet}>
        <header className={css.header}>
          <h1 className={css.title}>升级套餐</h1>
          <button type="button" className={css.close} aria-label="关闭" onClick={close}>×</button>
        </header>

        <div className={css.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'personal'}
            className={tab === 'personal' ? css.tabActive : css.tab}
            onClick={() => { setTab('personal') }}>个人套餐</button>
          <button type="button" role="tab" aria-selected={tab === 'team'}
            className={tab === 'team' ? css.tabActive : css.tabDisabled}
            onClick={() => { setTab('team') }}>团队套餐</button>
        </div>

        {tab === 'team'
          ? (
            <div className={css.comingSoon}>
              <p className={css.comingSoonTitle}>{team?.note ?? '即将上线'}</p>
              <p className={css.comingSoonBody}>
                {team?.audience ?? '团队套餐支持多个账号共享同一份额度'}
                <br />
                需要席位与组织体系支持，正在开发中。
              </p>
            </div>
          )
          : (
            <>
              <div className={css.cycles} role="radiogroup" aria-label="计费周期">
                {cycleOptions.map(option => (
                  <button key={option.id} type="button" role="radio" aria-checked={cycle === option.id}
                    className={cycle === option.id ? css.cycleActive : css.cycle}
                    onClick={() => { setCycle(option.id) }}>
                    {option.label}
                    {option.badge !== undefined && <span className={css.cycleBadge}>{option.badge}</span>}
                  </button>
                ))}
              </div>

              {error !== undefined && <p className={css.error} role="alert">下单失败：{error}</p>}

              <div className={css.cards}>
                {tiers.length === 0 && error === undefined && <p className={css.loading}>套餐加载中…</p>}
                {tiers.map((tier) => {
                  const price = tier.prices[cycle]
                  const busy = busyTier === tier.id
                  return (
                    <article key={tier.id} className={css.card}>
                      <h2 className={css.cardName}>{tier.name}</h2>
                      <p className={css.price}>
                        {formatCny(price.amount)}
                        <span className={css.per}>/{price.displayCycle}</span>
                      </p>
                      <p className={css.included}>
                        包含约 <strong>{formatTokens(price.includedTokens)}</strong> Token
                      </p>
                      <p className={css.audience}>{tier.audience}</p>
                      <ul className={css.features}>
                        {tier.features.map(feature => <li key={feature}>{feature}</li>)}
                      </ul>
                      <p className={css.slogan}>{tier.slogan}</p>
                      <button type="button" className={css.buy} disabled={busy || !tier.purchasable}
                        onClick={() => { void startCheckout(tier) }}>
                        {busy ? '正在下单…' : tier.purchasable ? '升级订阅' : '暂不可购'}
                      </button>
                    </article>
                  )
                })}
              </div>
            </>
          )}
      </div>
    </div>
  )
}
