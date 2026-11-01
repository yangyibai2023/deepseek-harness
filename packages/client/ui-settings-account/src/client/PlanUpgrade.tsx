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
import { AgreementModal } from './AgreementModal.tsx'
import { MEMBER_AGREEMENT_TITLE } from './MemberAgreement.ts'

type PlanCycle = 'monthly' | 'yearly'

interface PlanPrice {
  amount: number
  includedTokens: number
  displayCycle: '月' | '年'
  badge?: string
}

interface PlanTier {
  credits: { base: number; bonus: number; total: number }
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

/** 1.5亿 / 1250万 这类中文额度口径（保留至多一位小数）。 */

function formatCny(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN')}`
}

/** 2026-11-01：个人/团队页签开关——团队档位上线后改 true 恢复。 */
const SHOW_TEAM_TAB = false

export interface PlanUpgradeProps {
  readonly close: () => void
}

export function PlanUpgrade({ close }: PlanUpgradeProps) {
  const [catalog, setCatalog] = useState<PlanCatalogResponse['plans']>()
  const [cycle, setCycle] = useState<PlanCycle>('yearly')
  const [busyTier, setBusyTier] = useState<string>()
  const [error, setError] = useState<string>()
  // 支付前协议（2026-11-01）：默认勾选，取消勾选则购买按钮置灰；点协议名看全文。
  const [agreementAccepted, setAgreementAccepted] = useState(true)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [tab, setTab] = useState<'personal' | 'team'>('personal')
  void tab
  void setTab

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
    { id: 'monthly' as const, label: '按月付费' },
    { id: 'yearly' as const, label: '按年付费', badge: tiers[0]?.prices.yearly.badge },
  ]), [tiers])

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label="升级套餐">
      <div className={css.sheet}>
        <header className={css.header}>
          <h1 className={css.title}>升级套餐</h1>
          <button type="button" className={css.close} aria-label="关闭" onClick={close}>×</button>
        </header>

        {/* 2026-11-01：个人/团队页签暂不展示（当前只有个人档位）；恢复=SHOW_TEAM_TAB 改 true */}
        {SHOW_TEAM_TAB && (
          <div className={css.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'personal'}
              className={tab === 'personal' ? css.tabActive : css.tab}
              onClick={() => { setTab('personal') }}>个人套餐</button>
            <button type="button" role="tab" aria-selected={tab === 'team'}
              className={tab === 'team' ? css.tabActive : css.tabDisabled}
              onClick={() => { setTab('team') }}>团队套餐</button>
          </div>

        )}

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
                      <p className={css.audience}>{tier.credits.total.toLocaleString('zh-CN')} 积分/月，{tier.slogan}</p>
                      <p className={css.price}>
                        {formatCny(price.amount)}
                        <span className={css.per}>/{price.displayCycle}</span>
                      </p>
                      <p className={css.included}>
                        每月基础 <strong>{tier.credits.base.toLocaleString('zh-CN')}</strong> 积分
                      </p>
                      <p className={css.included}>
                        每月赠送 <strong>{tier.credits.bonus.toLocaleString('zh-CN')}</strong> 积分
                      </p>
                      <p className={css.audience}>{tier.audience}</p>
                      <ul className={css.features}>
                        {tier.features.map(feature => <li key={feature}>{feature}</li>)}
                      </ul>
                      <p className={css.slogan}>{tier.slogan}</p>
                      <button type="button" className={css.buy} disabled={busy || !tier.purchasable || !agreementAccepted}
                        onClick={() => { void startCheckout(tier) }}>
                        {busy ? '正在下单…' : tier.purchasable ? '升级订阅' : '暂不可购'}
                      </button>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        {/* 支付协议（2026-11-01 复测）：页面最下方居中、灰色弱化，点击看全文 */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap' }}>
          <input type="checkbox" checked={agreementAccepted} onChange={(event) => { setAgreementAccepted(event.target.checked) }} style={{ margin: 0, cursor: 'pointer' }} />
          <span>
            我已阅读并同意
            <a
              role="button"
              tabIndex={0}
              onClick={(event) => { event.preventDefault(); setAgreementOpen(true) }}
              onKeyDown={(event) => { if (event.key === 'Enter') setAgreementOpen(true) }}
              style={{ color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))', textDecoration: 'underline', cursor: 'pointer' }}
            >《{MEMBER_AGREEMENT_TITLE}》</a>
          </span>
        </label>
        {agreementOpen && <AgreementModal close={() => { setAgreementOpen(false) }} />}
      </div>
    </div>
  )
}
