/** 版本标识（2026-11-01 用户定稿）：体验版=灰字；标准版/旗舰版=黑标白字。 */
export type TierBadgeProps = {
  tierLabel: string
  /** 压缩模式（头像弹框等窄处）。 */
  compact?: boolean
}

export function tierBadgeStyle(tierLabel: string): React.CSSProperties {
  return tierLabel === '体验版'
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

/** 版本标识：体验版灰字；标准版/旗舰版黑标白字（尊贵会员感）。 */
export function TierBadge({ tierLabel, compact }: TierBadgeProps): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span style={tierBadgeStyle(tierLabel)}>{tierLabel}</span>
      {!compact && tierLabel !== '体验版' ? <span style={{ width: 0 }} /> : null}
    </span>
  )
}
