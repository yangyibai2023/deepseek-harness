/** 版本标识（2026-11-01 用户定稿）：体验版=灰字；标准版/旗舰版=黑标白字。
 *
 * 2026-11-04（0.5.5 FIX-23，用户旗舰账号被误显示「体验版」事故）：新增**未知态**。
 * tierLabel 缺失（credits 拉取失败：404 runtime 过旧 / 401 未登录 / 网络错）时显示
 * 灰字「—」，**绝不再把「体验版」当兜底**——那是把一个真实档位冒充成查询结果，
 * 用户会据此误判自己的会员身份。未知态与「体验版」视觉同为灰字，但内容是占位符
 * 「—」并带 title 提示，一眼可区分「查到了=体验版」与「没查到=未知」。 */
export type TierBadgeProps = {
  tierLabel?: string | null | undefined
  /** 压缩模式（头像弹框等窄处）。 */
  compact?: boolean
}

function tierLabelUnknown(tierLabel?: string | null | undefined): boolean {
  return tierLabel === undefined || tierLabel === null || tierLabel === ''
}

export function tierBadgeStyle(tierLabel?: string | null | undefined): React.CSSProperties {
  return tierLabel === '体验版' || tierLabelUnknown(tierLabel)
    ? {
      color: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.9))',
      fontSize: 12,
      fontWeight: 500,
    }
    : {
      background: 'var(--dsw-alias-button-primary-fill, #111)',
      color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 6,
      lineHeight: '16px',
    }
}

/** 版本标识：体验版灰字；标准版/旗舰版黑标白字（尊贵会员感）；未知灰字「—」。 */
export function TierBadge({ tierLabel, compact }: TierBadgeProps): React.ReactElement {
  const unknown = tierLabelUnknown(tierLabel)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }} title={unknown ? '会员状态暂不可用' : undefined}>
      <span style={tierBadgeStyle(tierLabel)}>{unknown ? '—' : tierLabel}</span>
      {!compact && !unknown && tierLabel !== '体验版' ? <span style={{ width: 0 }} /> : null}
    </span>
  )
}
