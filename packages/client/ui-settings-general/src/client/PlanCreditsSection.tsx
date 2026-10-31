/**
 * HeightLab「套餐与积分」section（2026-11-01，对标 WorkBuddy 信息结构）：
 * 当前套餐卡 → 积分总览（套餐基础/加油包与奖励）→ 积分明细（概览/消耗）→ 加油包购买。
 * 数据源：/hl/credits 桥代理（= 网关 /api/commercial/credits/overview，单一事实源）。
 */
import { useCallback, useEffect, useState } from 'react'
import { PlanUpgrade } from './PlanUpgrade.tsx'
import { TierBadge } from './TierBadge.tsx'
import { AgreementModal } from './AgreementModal.tsx'
import { MEMBER_AGREEMENT_TITLE } from './MemberAgreement.ts'

interface CreditBucketView {
  kind: 'plan' | 'booster' | 'reward'
  units: number
  unitsInitial: number
  expiresAt: number
  displayUnits?: number
}

interface LedgerRow {
  id: string
  kind: string
  units: number
  modelId: string | null
  createdAt: string | null
}

interface BoosterSkuView {
  id: string
  name: string
  amount: number
  credits: number
  displayCredits?: number
  tagline: string
}

interface CreditsOverview {
  tier: string
  tierLabel: string
  canBuyBooster: boolean
  plan: { name?: string; cycle?: string; periodEnd?: number; remainingMs?: number } | null
  totalUnits?: number
  displayTotalUnits?: number
  planUnits?: number
  boosterUnits?: number
  rewardUnits?: number
  buckets: CreditBucketView[]
  latestExpiry: number | null
  ledger: LedgerRow[]
  boosters: BoosterSkuView[]
}

const cardStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: 14,
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const bigNumberStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 700,
  lineHeight: 1.1,
}

function formatUnits(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—'
}

function formatDate(ms: number | null | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return '—'
  const date = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const KIND_LABEL: Record<CreditBucketView['kind'], string> = {
  plan: '套餐基础积分',
  booster: '加油包积分',
  reward: '平台奖励积分',
}

const LEDGER_KIND: Record<string, string> = {
  recharge: '充值到账',
  consume: '消耗',
  reserve: '预留',
  release: '释放',
  refund: '退款',
  adjust: '调整',
}

/** 「套餐与积分」设置页：单一数据源 /hl/credits。 */
export function PlanCreditsSection(): React.ReactElement {
  const [data, setData] = useState<CreditsOverview | null>(null)
  const [loadError, setLoadError] = useState<string>()
  const [tab, setTab] = useState<'overview' | 'ledger'>('overview')
  const [planUpgradeOpen, setPlanUpgradeOpen] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [agreementAccepted, setAgreementAccepted] = useState(true)
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [busySku, setBusySku] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string>()

  const reload = useCallback((): void => {
    void fetch('/hl/credits').then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((json) => { setData(json as CreditsOverview); setLoadError(undefined) })
      .catch((err) => { setLoadError(err instanceof Error ? err.message : String(err)) })
  }, [])
  useEffect(() => { reload() }, [reload])

  const buyBooster = useCallback(async (skuId: string, amount: number) => {
    setBusySku(skuId)
    setBuyError(undefined)
    try {
      const res = await fetch('/hl/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount, paymentMethod: 'alipay', planTier: skuId }),
      })
      const body = await res.json().catch(() => ({}) as { checkout?: { checkoutUrl?: string } }) as { checkout?: { checkoutUrl?: string } }
      if (res.ok && body.checkout?.checkoutUrl !== undefined && body.checkout.checkoutUrl !== '') {
        const tauri = (globalThis as { __TAURI__?: { core?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } } }).__TAURI__
        if (typeof tauri?.core?.invoke === 'function') {
          await tauri.core.invoke('open_payment', { url: body.checkout.checkoutUrl }).catch(() => undefined)
        } else {
          window.open(body.checkout.checkoutUrl, '_blank', 'noopener')
        }
      } else {
        setBuyError('下单失败，请稍后重试或联系客服。')
      }
    } catch (error) {
      setBuyError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusySku(null)
      reload()
    }
  }, [reload])

  const canBuyBooster = data?.canBuyBooster === true
  const boosters = data?.boosters ?? []

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      {/* 当前套餐卡 */}
      <div style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TierBadge tierLabel={data?.tierLabel ?? '…'} />
          {data?.plan?.name !== undefined && data.plan.name !== ''
            ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{data.plan.name}</span>
            : null}
        </div>
        <button
          type="button"
          onClick={() => { setPlanUpgradeOpen(true) }}
          style={{
            padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--dsw-alias-button-primary-fill, #111)',
            color: 'var(--dsw-alias-label-primary-foreground, #fff)', fontSize: 13, fontWeight: 600,
          }}
        >升级套餐</button>
      </div>

      {/* 积分总览 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={bigNumberStyle}>{formatUnits(data?.displayTotalUnits ?? data?.totalUnits ?? 0)}</span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>总剩余积分</span>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>套餐基础积分</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{formatUnits(data?.planUnits ?? 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>加油包与奖励积分</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
              {formatUnits((data?.boosterUnits ?? 0) + (data?.rewardUnits ?? 0))}
            </div>
          </div>
        </div>
        {data?.latestExpiry !== null && data?.latestExpiry !== undefined
          ? <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>最近一批积分到期：{formatDate(data.latestExpiry)}</div>
          : null}
        {loadError !== undefined && <div style={{ fontSize: 12, color: 'var(--dsw-alias-danger, #c0392b)' }}>加载失败：{loadError}</div>}
      </div>

      {/* 积分明细（概览 / 消耗） */}
      <div style={{ ...cardStyle, gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['overview', 'ledger'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key) }}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                border: tab === key ? 'none' : '1px solid var(--dsw-alias-border-l2)',
                background: tab === key ? 'var(--dsw-alias-button-primary-fill, #111)' : 'transparent',
                color: tab === key ? 'var(--dsw-alias-label-primary-foreground, #fff)' : 'var(--dsw-alias-label-primary, #111)',
                fontWeight: tab === key ? 600 : 400,
              }}
            >{key === 'overview' ? '积分概览' : '消耗明细'}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(data?.buckets ?? []).length === 0
              ? <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>暂无可用积分。升级套餐或购买加油包后，积分会在这里按来源与有效期展示。</div>
              : (data?.buckets ?? []).map(bucket => (
                <div key={`${bucket.kind}-${bucket.expiresAt}-${bucket.units}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{KIND_LABEL[bucket.kind]}</span>
                    <span>剩余 {formatUnits(bucket.displayUnits ?? bucket.units)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', margin: '2px 0 6px' }}>
                    到期 {formatDate(bucket.expiresAt)}
                    · 占总额 {bucket.unitsInitial > 0 ? Math.round(bucket.units / bucket.unitsInitial * 100) : 0}%
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.05))' }}>
                    <div style={{
                      height: 6, borderRadius: 3,
                      width: `${bucket.unitsInitial > 0 ? Math.min(100, Math.max(0, Math.round(bucket.units / bucket.unitsInitial * 100))) : 0}%`,
                      background: 'var(--dsw-alias-button-primary-fill, #111)',
                    }} />
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === 'ledger' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(data?.ledger ?? []).length === 0
              ? <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>暂无消耗记录。</div>
              : (data?.ledger ?? []).map(row => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.05))', fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}>
                    <div>{LEDGER_KIND[row.kind] ?? row.kind}{row.modelId !== null && row.modelId !== '' ? ` · ${row.modelId}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{row.createdAt !== null ? formatDate(new Date(row.createdAt).getTime()) : ''}</div>
                  </div>
                  <div style={{ fontWeight: 600, flexShrink: 0 }}>{row.units > 0 ? '+' : ''}{formatUnits(row.units)}</div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 加油包（未购套餐 → 整区灰置 + 悬浮提示） */}
      <div style={{ ...cardStyle }} title={canBuyBooster ? undefined : '成为标准或旗舰会员后才能单独购买加油包'}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>加油包</div>
        {!canBuyBooster && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
            成为标准或旗舰会员后才能单独购买加油包。升级套餐后即可按需补充积分。
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {boosters.map((sku) => {
            const selected = selectedSku === sku.id
            const disabled = !canBuyBooster || busySku !== null
            return (
              <div
                key={sku.id}
                onClick={() => { if (!disabled) setSelectedSku(sku.id) }}
                style={{
                  flex: '1 1 160px', padding: '12px 14px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
                  border: selected ? '2px solid var(--dsw-alias-button-primary-fill, #111)' : '1px solid var(--dsw-alias-border-l2)',
                  background: disabled ? 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.03))' : selected ? 'rgba(0,0,0,0.03)' : 'transparent',
                  opacity: disabled ? 0.55 : 1,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{sku.tagline}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sku.name}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>¥{sku.amount}</div>
                <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{formatUnits(sku.displayCredits ?? sku.credits)} 积分 · 12 个月有效</div>
              </div>
            )
          })}
        </div>
        {canBuyBooster && boosters.length > 0 && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={agreementAccepted} onChange={(event) => { setAgreementAccepted(event.target.checked) }} style={{ margin: 0, cursor: 'pointer' }} />
              <span>
                我已阅读并同意
                <a
                  role="button"
                  tabIndex={0}
                  onClick={(event) => { event.preventDefault(); setAgreementOpen(true) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') setAgreementOpen(true) }}
                  style={{ color: 'var(--dsw-alias-label-primary, #111)', textDecoration: 'underline', cursor: 'pointer', marginLeft: 2 }}
                >《{MEMBER_AGREEMENT_TITLE}》</a>
              </span>
            </label>
            <button
              type="button"
              disabled={selectedSku === null || !agreementAccepted || busySku !== null}
              onClick={() => {
                const sku = boosters.find(item => item.id === selectedSku)
                if (sku !== undefined) void buyBooster(sku.id, sku.amount)
              }}
              style={{
                alignSelf: 'flex-start', padding: '9px 26px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--dsw-alias-button-primary-fill, #111)',
                color: 'var(--dsw-alias-label-primary-foreground, #fff)', fontSize: 13, fontWeight: 600,
                opacity: selectedSku === null || !agreementAccepted || busySku !== null ? 0.5 : 1,
              }}
            >{busySku !== null ? '正在下单…' : '购买加油包'}</button>
            {buyError !== undefined && <div style={{ fontSize: 12, color: 'var(--dsw-alias-danger, #c0392b)' }}>{buyError}</div>}
          </>
        )}
      </div>

      {planUpgradeOpen && <PlanUpgrade close={() => { setPlanUpgradeOpen(false) }} />}
      {agreementOpen && <AgreementModal close={() => { setAgreementOpen(false) }} />}
    </div>
  )
}
