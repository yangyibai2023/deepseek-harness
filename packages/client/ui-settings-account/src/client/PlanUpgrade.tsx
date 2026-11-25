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
  /** 基础 / 赠送拆分（网关 2026-11-25 起下发；旧网关无此字段时回退到 credits × 周期）。 */
  baseCredits?: number
  bonusCredits?: number
  displayCycle: '月' | '年'
  badge?: string
}

interface PlanCapacity {
  images: number
  videoSeconds: number
}

interface PlanPresentation {
  /**
   * 「积分相当于 N 倍轻量版」。网关可能给字符串（当前只展示年付）或
   * 按月付/年付分别给的对象（月付恢复展示时）。两种都要能吃。
   */
  creditMultiple?: string | Record<PlanCycle, string>
  capacityMonthly: PlanCapacity
  capacityYearly: PlanCapacity
  features: string[]
}

/** creditMultiple 归一化：字符串直接用，对象按周期取。 */
function creditMultipleText(
  value: PlanPresentation['creditMultiple'],
  cycle: PlanCycle,
): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : value[cycle]
}

interface PlanTier {
  credits: { base: number; bonus: number; total: number }
  id: string
  name: string
  audience: string
  slogan: string
  features: string[]
  presentation?: PlanPresentation
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

/**
 * 2026-11-25 用户拍板：当前**只展示年付档**，月付档隐藏。
 *
 * 月付档位在 planCatalog / checkout / 媒体定价里都是完整可用的（六档），
 * 只是前端不展示。后期要推月付时把这个开关改 true 即恢复「按月付费 ｜ 按年付费」切换条。
 */
const SHOW_MONTHLY_CYCLE = false

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
        // L3-B6（0.5.7）：window.open 被弹窗拦截/失败时返回 null——原实现完全
        // 吞掉，用户点购买无反应还留下未支付订单。失败必须显性报错。
        const payWin = window.open(url, '_blank', 'noopener')
        if (payWin === null) {
          setError('支付页面未能打开（可能被浏览器拦截）。请在设置中允许弹窗后重试；若已扣款请勿重复支付。')
        }
      } else {
        setError('下单成功但未返回支付地址，请稍后重试或联系客服。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyTier(undefined)
    }
  }, [cycle])

  /**
   * 周期选项。2026-11-25：月付隐藏时这里为空数组（不渲染切换条，改渲染「套餐」静态标签）；
   * 打开 SHOW_MONTHLY_CYCLE 即恢复两项切换。
   *
   * 角标从切换条移到卡片上（每档省的钱数不同，切换条上写不下）。
   */
  const cycleOptions = useMemo(() => {
    const options: Array<{ id: PlanCycle; label: string }> = [
      { id: 'monthly', label: '按月付费' },
      { id: 'yearly', label: '按年付费' },
    ]
    return SHOW_MONTHLY_CYCLE ? options : []
  }, [])

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
              {/* 2026-11-25：只展示年付 → **完全不渲染**周期行。
               * 中途曾放一个静态「套餐」chip 占位，用户反馈「没有月付/年付之分，
               * 它白占一行，导致必须滚动」——那行整个去掉，卡片区随之上移。
               * 恢复月付时把 SHOW_MONTHLY_CYCLE 改 true，切换条会自动回到这里。 */}
              {SHOW_MONTHLY_CYCLE && (
                <div className={css.cycles} role="radiogroup" aria-label="计费周期">
                  {cycleOptions.map(option => (
                    <button key={option.id} type="button" role="radio" aria-checked={cycle === option.id}
                      className={cycle === option.id ? css.cycleActive : css.cycle}
                      onClick={() => { setCycle(option.id) }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {error !== undefined && <p className={css.error} role="alert">下单失败：{error}</p>}

              <div className={css.cards}>
                {tiers.length === 0 && error === undefined && <p className={css.loading}>套餐加载中…</p>}
                {tiers.map((tier) => {
                  const price = tier.prices[cycle]
                  const busy = busyTier === tier.id
                  /* 基础/赠送拆分。网关 2026-11-25 起直接下发 baseCredits/bonusCredits；
                   * 旧网关没有这两个字段时按周期回退（年=×12 的旧口径，仅兼容用）。 */
                  const isYearly = price.displayCycle === '年'
                  const baseCredits = price.baseCredits
                    ?? (isYearly ? tier.credits.base * 12 : tier.credits.base)
                  const bonusCredits = price.bonusCredits
                    ?? (isYearly ? tier.credits.bonus * 12 : tier.credits.bonus)
                  return (
                    <article key={tier.id} className={css.card}>
                      <div className={css.cardHead}>
                        <h2 className={css.cardName}>{tier.name}</h2>
                        {price.badge !== undefined && <span className={css.cardBadge}>{price.badge}</span>}
                      </div>
                      <p className={css.audience}>{price.includedTokens.toLocaleString('zh-CN')} 积分，{tier.slogan}</p>
                      <p className={css.price}>
                        {formatCny(price.amount)}
                      </p>
                      <p className={css.included}>
                        基础 <strong>{baseCredits.toLocaleString('zh-CN')}</strong> 积分
                      </p>
                      {/* 2026-11-25（用户拍板）：赠送为 0 时整行不显示——「不赠送就不用写」。
                          不要显示「赠送 0 积分」，那是负数信息。 */}
                      {bonusCredits > 0 && (
                        <p className={css.included}>
                          赠送 <strong>{bonusCredits.toLocaleString('zh-CN')}</strong> 积分
                        </p>
                      )}
                      <p className={css.included}>
                        约 <strong>{(isYearly ? tier.presentation?.capacityYearly.images ?? 0 : tier.presentation?.capacityMonthly.images ?? 0).toLocaleString('zh-CN')}</strong> 张高清图片，或 <strong>{(isYearly ? tier.presentation?.capacityYearly.videoSeconds ?? 0 : tier.presentation?.capacityMonthly.videoSeconds ?? 0).toLocaleString('zh-CN')}</strong> 秒高清视频
                      </p>
                      {creditMultipleText(tier.presentation?.creditMultiple, cycle) !== undefined && (
                        <p className={css.included}>
                          积分相当于 {creditMultipleText(tier.presentation?.creditMultiple, cycle)}
                        </p>
                      )}
                      <p className={css.audience}>{tier.audience}</p>
                      <ul className={css.features}>
                        {(tier.presentation?.features ?? tier.features).map(feature => <li key={feature}>{feature}</li>)}
                      </ul>
                      {/* slogan 已在首行（…积分，{tier.slogan}），此处不再重复 —— 省一行高度 */}
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
