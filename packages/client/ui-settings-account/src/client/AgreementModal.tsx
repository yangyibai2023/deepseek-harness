/** 协议全文弹窗（2026-11-01）：支付前勾选的《会员订阅服务协议》点开即读。 */
import { MEMBER_AGREEMENT_BODY, MEMBER_AGREEMENT_TITLE } from './MemberAgreement.ts'

export interface AgreementModalProps {
  close: () => void
}

export function AgreementModal({ close }: AgreementModalProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={MEMBER_AGREEMENT_TITLE}
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(event) => { event.stopPropagation() }}
        style={{
          width: 'min(640px, 92vw)', maxHeight: '80vh',
          background: 'var(--dsw-alias-surface-primary, #fff)',
          color: 'var(--dsw-alias-label-primary, #111)',
          borderRadius: 16, padding: '22px 26px',
          display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{MEMBER_AGREEMENT_TITLE}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={close}
            style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>
        <div
          style={{ overflow: 'auto', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', paddingRight: 4 }}
        >{MEMBER_AGREEMENT_BODY}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={close}
            style={{
              padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--dsw-alias-button-primary-fill, #111)',
              color: 'var(--dsw-alias-label-primary-foreground, #fff)', fontSize: 13,
            }}
          >我已阅读</button>
        </div>
      </div>
    </div>
  )
}
