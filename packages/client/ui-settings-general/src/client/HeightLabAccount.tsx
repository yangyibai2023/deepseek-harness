/**
 * HeightLab account section (0.3.0 overlay): balance display + in-app
 * recharge modal. Backed by the heightlab-host-api plugin routes
 * (/hl/balance, /hl/recharge).
 */
import { useEffect, useState } from 'react'

interface Balance {
  balance?: number
  currency?: string
  unit?: string
  creditsPerCny?: number
  mock?: boolean
}

interface Profile {
  name?: string
  username?: string
  email?: string
  avatar?: string
  hasPassword?: boolean
}

interface TopupOrder {
  id: string
  amount: number
  paymentMethod: string
  status: string
  callbackVerified?: boolean
  settlement?: { status?: string; final?: boolean }
  createdAt?: string
}

const sectionStyle: React.CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  maxWidth: '560px',
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid currentColor',
  background: 'transparent',
  cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '14px',
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const cellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '10px 8px',
  borderRadius: '10px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)',
  textAlign: 'left',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: '10px',
  border: 'none',
  cursor: 'pointer',
  background: 'var(--dsw-alias-button-primary-fill)',
  color: 'var(--dsw-alias-label-primary-foreground)',
  fontWeight: 600,
  fontSize: 13,
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--color-bg-1, #fff)',
  color: 'var(--color-text-1, #111)',
  borderRadius: '12px',
  padding: '20px',
  minWidth: '280px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
}

export function HeightLabAccount() {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<TopupOrder[]>([])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wxpay'>('alipay')
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<string | null>(null)
  const [accountModal, setAccountModal] = useState<'email' | 'password' | null>(null)
  const [accountStep, setAccountStep] = useState<'identity' | 'change' | 'done'>('identity')
  const [identityMethod, setIdentityMethod] = useState<'password' | 'email-code'>('password')
  const [identityPassword, setIdentityPassword] = useState('')
  const [identityCodeSent, setIdentityCodeSent] = useState(false)
  const [identityCode, setIdentityCode] = useState('')
  const [identityEmailVerificationId, setIdentityEmailVerificationId] = useState('')
  const [identityVerificationId, setIdentityVerificationId] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newEmailCodeSent, setNewEmailCodeSent] = useState(false)
  const [newEmailCode, setNewEmailCode] = useState('')
  const [newEmailVerificationId, setNewEmailVerificationId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountStatus, setAccountStatus] = useState<string | null>(null)

  const signOut = (): void => {
    try {
      void fetch('/hl/signout', { method: 'POST' }).catch(() => { /* ignore */ })
      localStorage.removeItem('heightlab-token')
      localStorage.removeItem('heightlab-account-token')
      localStorage.removeItem('heightlab-pkce-verifier')
    } catch { /* ignore */ }
    window.location.reload()
  }

  const refresh = (): void => {
    fetch('/hl/me')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setProfile({
            name: typeof data.name === 'string' ? data.name : undefined,
            username: typeof data.username === 'string' ? data.username : undefined,
            email: typeof data.email === 'string' ? data.email : undefined,
            avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
            hasPassword: typeof data.hasPassword === 'boolean' ? data.hasPassword : undefined,
          })
        }
      })
      .catch(() => { /* 保持默认显示 */ })
    fetch('/hl/balance')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setBalance(data)
          setBalanceError(null)
        } else {
          setBalance(null)
          setBalanceError(data?.message ?? '余额获取失败')
        }
      })
      .catch(() => { setBalance(null); setBalanceError('余额获取失败') })
    fetch('/hl/payment-topups')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) setOrders(Array.isArray(data.entries) ? data.entries : [])
      })
      .catch(() => { /* 记录加载失败不阻塞页面 */ })
  }

  useEffect(() => { refresh() }, [])

  const displayName = profile?.username || profile?.name || 'HeightLab 账户'
  const avatarInitial = displayName.trim().charAt(0).toUpperCase()
  // 前端展示换算：后端积分是 tokens（creditsPerCny 表示 1 元 = N 积分），
  // 展示时按竞品尺度映射（参考腾讯 Work Buddy：299 元 = 5000 积分），
  // 避免出现 7 位数大数；用户充值 ¥299 时正好显示 5000 积分。
  const DISPLAY_CREDITS_PER_CNY = 5000 / 299
  const cnyValue = balance?.creditsPerCny != null && balance.creditsPerCny > 0
    ? (balance.balance ?? 0) / balance.creditsPerCny
    : (balance?.balance ?? 0)
  const displayCredits = cnyValue * DISPLAY_CREDITS_PER_CNY
  const creditsText = `${displayCredits.toFixed(displayCredits >= 100 ? 0 : 2)} 积分`

  const orderStatus = (order: TopupOrder): { label: string; color: string } => {
    const s = order.status ?? ''
    if (s === 'pending_payment' || s === 'pending') return { label: '待支付', color: '#d97706' }
    if (s === 'settled' || (order.settlement?.final === true && order.settlement?.status === 'settled')) {
      return { label: '已到账', color: '#16a34a' }
    }
    if (s === 'expired') return { label: '已过期', color: '#6b7280' }
    if (s === 'reversed') return { label: '已退款', color: '#6b7280' }
    if (s === 'failed' || s === 'checkout_delivery_failed') return { label: '支付失败', color: '#dc2626' }
    return { label: s || '处理中', color: '#6b7280' }
  }

  const fmtOrderTime = (value: string | undefined): string => {
    if (!value) return '—'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }
  const avatarStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-3)',
    objectFit: 'cover',
    flexShrink: 0,
  }

  const pickAvatar = (file: File | undefined): void => {
    setEditError(null)
    if (!file || !file.type.startsWith('image/')) {
      setEditError('请选择图片文件（PNG / JPG / WebP / GIF）。')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setEditError('头像图片不能超过 5MB。')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const openEdit = (): void => {
    setEditUsername(profile?.username || profile?.name || '')
    setAvatarFile(null)
    setAvatarPreview(null)
    setEditError(null)
    setEditStatus(null)
    setEditOpen(true)
  }

  const saveProfile = async (): Promise<void> => {
    setEditError(null)
    setEditStatus(null)
    const username = editUsername.trim()
    if (!username) {
      setEditError('请输入用户名。')
      return
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(username)) {
      setEditError('用户名仅支持 1-32 位字母、数字、下划线或连字符。')
      return
    }
    setSaving(true)
    try {
      let avatarUrl = ''
      if (avatarFile) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(new Error('read'))
          reader.readAsDataURL(avatarFile)
        })
        const comma = dataUrl.indexOf(',')
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
        const up = await fetch('/hl/avatar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            data: base64,
            mimeType: avatarFile.type || 'image/png',
            name: avatarFile.name || 'avatar.png',
          }),
        })
        const upData = await up.json().catch(() => ({})) as { ok?: boolean; url?: string; message?: string }
        if (!up.ok || upData.ok !== true || !upData.url) {
          setEditError(upData.message ?? '头像上传失败，请稍后重试。')
          return
        }
        avatarUrl = upData.url
      }
      const patch: Record<string, string> = { username }
      if (avatarUrl) patch.avatar = avatarUrl
      const res = await fetch('/hl/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      if (!res.ok || data.ok !== true) {
        setEditError(data.message ?? '资料保存失败，请稍后重试。')
        return
      }
      setEditStatus('已保存')
      refresh()
      try { window.dispatchEvent(new CustomEvent('hl:profile-updated')) } catch { /* 非致命 */ }
      setEditOpen(false)
    } catch {
      setEditError('资料保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  const openAccountModal = (mode: 'email' | 'password'): void => {
    setAccountModal(mode)
    setAccountStep('identity')
    setIdentityMethod(profile?.hasPassword === false ? 'email-code' : 'password')
    setIdentityPassword('')
    setIdentityCodeSent(false)
    setIdentityCode('')
    setIdentityEmailVerificationId('')
    setIdentityVerificationId('')
    setNewEmail('')
    setNewEmailCodeSent(false)
    setNewEmailCode('')
    setNewEmailVerificationId('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setAccountError(null)
    setAccountStatus(null)
  }

  const closeAccountModal = (): void => {
    if (!accountBusy) {
      setAccountModal(null)
      setAccountError(null)
      setAccountStatus(null)
    }
  }

  const postAccount = async (path: string, body: Record<string, unknown>): Promise<Record<string, unknown> & { ok: boolean; message?: string }> => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown> & { ok?: boolean; message?: string }
    const result = { ...data, ok: res.ok && data.ok === true } as Record<string, unknown> & { ok: boolean; message?: string }
    if (data.message !== undefined) result.message = data.message
    return result
  }

  const verifyIdentityPassword = async (): Promise<void> => {
    if (!identityPassword) {
      setAccountError('请输入当前密码。')
      return
    }
    setAccountBusy(true)
    setAccountError(null)
    setAccountStatus(null)
    try {
      const r = await postAccount('/hl/account/verify-password', { password: identityPassword })
      if (!r.ok || typeof r.verificationRecordId !== 'string' || !r.verificationRecordId) {
        setAccountError(r.message ?? '身份验证失败，请稍后重试。')
        return
      }
      setIdentityVerificationId(r.verificationRecordId)
      setAccountStep('change')
    } catch {
      setAccountError('身份验证失败，请稍后重试。')
    } finally {
      setAccountBusy(false)
    }
  }

  const sendIdentityEmailCode = async (): Promise<void> => {
    const email = profile?.email
    if (!email) {
      setAccountError('暂时无法获取当前邮箱，请重新登录后再试。')
      return
    }
    setAccountBusy(true)
    setAccountError(null)
    setAccountStatus(null)
    try {
      const r = await postAccount('/hl/account/send-email-code', { email })
      if (!r.ok) {
        setAccountError(r.message ?? '验证码发送失败，请稍后重试。')
        return
      }
      if (typeof r.verificationId === 'string' && r.verificationId) {
        setIdentityEmailVerificationId(r.verificationId)
      }
      setIdentityCodeSent(true)
      setAccountStatus(`验证码已发送到 ${email}，请查收。`)
    } catch {
      setAccountError('验证码发送失败，请稍后重试。')
    } finally {
      setAccountBusy(false)
    }
  }

  const verifyIdentityEmailCode = async (): Promise<void> => {
    const email = profile?.email
    if (!email || !identityEmailVerificationId) {
      setAccountError('请先获取验证码。')
      return
    }
    if (!identityCode) {
      setAccountError('请输入验证码。')
      return
    }
    setAccountBusy(true)
    setAccountError(null)
    setAccountStatus(null)
    try {
      const r = await postAccount('/hl/account/verify-email-code', {
        email,
        verificationId: identityEmailVerificationId,
        code: identityCode,
      })
      if (!r.ok) {
        setAccountError(r.message ?? '验证码不正确或已过期，请重新获取。')
        return
      }
      setIdentityVerificationId(identityEmailVerificationId)
      setAccountStep('change')
    } catch {
      setAccountError('验证码不正确或已过期，请重新获取。')
    } finally {
      setAccountBusy(false)
    }
  }

  const sendNewEmailCode = async (): Promise<void> => {
    const email = newEmail.trim()
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountError('请输入有效的邮箱地址。')
      return
    }
    setAccountBusy(true)
    setAccountError(null)
    setAccountStatus(null)
    try {
      const r = await postAccount('/hl/account/send-email-code', { email })
      if (!r.ok) {
        setAccountError(r.message ?? '验证码发送失败，请稍后重试。')
        return
      }
      if (typeof r.verificationId === 'string' && r.verificationId) {
        setNewEmailVerificationId(r.verificationId)
      }
      setNewEmailCodeSent(true)
      setAccountStatus(`验证码已发送到 ${email}，请查收。`)
    } catch {
      setAccountError('验证码发送失败，请稍后重试。')
    } finally {
      setAccountBusy(false)
    }
  }

  const submitChange = async (): Promise<void> => {
    if (accountModal === 'email') {
      const email = newEmail.trim()
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAccountError('请输入有效的邮箱地址。')
        return
      }
      if (!newEmailCodeSent || !newEmailCode) {
        setAccountError('请先获取并输入新邮箱的验证码。')
        return
      }
      if (!identityVerificationId || !newEmailVerificationId) {
        setAccountError('请先完成身份验证。')
        return
      }
      setAccountBusy(true)
      setAccountError(null)
      setAccountStatus(null)
      try {
        const verify = await postAccount('/hl/account/verify-email-code', {
          email,
          verificationId: newEmailVerificationId,
          code: newEmailCode,
        })
        if (!verify.ok) {
          setAccountError(verify.message ?? '验证码不正确或已过期，请重新获取。')
          return
        }
        const r = await postAccount('/hl/account/change-email', {
          email,
          identityVerificationId,
          newIdentifierVerificationRecordId: newEmailVerificationId,
        })
        if (!r.ok) {
          setAccountError(r.message ?? '邮箱更换失败，请稍后重试。')
          return
        }
        setAccountStep('done')
        setAccountStatus('邮箱已更新')
        refresh()
        window.setTimeout(closeAccountModal, 1200)
      } catch {
        setAccountError('邮箱更换失败，请稍后重试。')
      } finally {
        setAccountBusy(false)
      }
      return
    }
    if (!identityVerificationId) {
      setAccountError('请先完成身份验证。')
      return
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setAccountError('新密码长度需为 8-128 位。')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setAccountError('两次输入的新密码不一致。')
      return
    }
    setAccountBusy(true)
    setAccountError(null)
    setAccountStatus(null)
    try {
      const r = await postAccount('/hl/account/change-password', {
        verificationId: identityVerificationId,
        password: newPassword,
      })
      if (!r.ok) {
        setAccountError(r.message ?? '密码修改失败，请稍后重试。')
        return
      }
      setAccountStep('done')
      setAccountStatus('密码已更新')
      window.setTimeout(closeAccountModal, 1200)
    } catch {
      setAccountError('密码修改失败，请稍后重试。')
    } finally {
      setAccountBusy(false)
    }
  }

  const recharge = async (amount: number): Promise<void> => {
    setBusy(true)
    setStatus('处理中…')
    try {
      const r = await fetch('/hl/recharge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount, paymentMethod: payMethod }),
      })
      const data = await r.json()
      if (!data.ok) {
        setStatus(`充值失败：${data.error ?? '未知错误'}`)
      } else if (data.mock) {
        setStatus(`充值成功（测试）：+${amount} 元`)
        refresh()
      } else if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl)
        setStatus('请在下方完成支付，完成后点"刷新余额"')
      } else {
        setStatus(`充值失败：${data.error ?? '未返回支付地址'}`)
      }
    } catch {
      setStatus('充值失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={sectionStyle}>
      {/* 资料卡：头像 / 用户名 / 邮箱 / 编辑资料 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {profile?.avatar
            ? <img src={profile.avatar} alt={displayName} style={{ ...avatarStyle, width: 56, height: 56 }} />
            : (
              <div style={{
                ...avatarStyle,
                width: 56,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--dsw-alias-label-secondary)',
              }}>
                {avatarInitial}
              </div>
            )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--dsw-alias-label-primary)' }}>
              {displayName}
            </div>
            {profile?.email ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--dsw-alias-label-tertiary)',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {profile.email}
              </div>
            ) : null}
          </div>
          <button type="button" style={ghostButtonStyle} onClick={openEdit}>编辑资料</button>
        </div>
      </div>

      {/* 账户安全：更换邮箱 / 修改密码 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, opacity: 0.55, fontWeight: 500 }}>账户安全</div>
        <button type="button" style={cellStyle} onClick={() => openAccountModal('email')}>
          <span style={{ flex: 1, fontSize: 13 }}>更换邮箱</span>
          <span style={{ fontSize: 12, opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {profile?.email ?? '—'}
          </span>
          <span style={{ opacity: 0.4 }}>›</span>
        </button>
        <button type="button" style={cellStyle} onClick={() => openAccountModal('password')}>
          <span style={{ flex: 1, fontSize: 13 }}>修改密码</span>
          <span style={{ fontSize: 12, opacity: 0.55 }}>
            {profile?.hasPassword === false ? '未设置' : '已设置'}
          </span>
          <span style={{ opacity: 0.4 }}>›</span>
        </button>
      </div>

      {/* 余额卡 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.55 }}>当前余额</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
              {balance ? creditsText : (balanceError ?? '加载中…')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
              ≈ ¥{cnyValue.toFixed(2)}{balance?.mock ? '（测试数据）' : ''}
            </div>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={() => { setOpen(true); setStatus(null); setCheckoutUrl(null) }}>
            充值
          </button>
        </div>
      </div>

      {/* 充值记录 */}
      {orders.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.55, fontWeight: 500 }}>充值记录</div>
          {orders.slice(0, 6).map((order) => {
            const st = orderStatus(order)
            return (
              <div
                key={order.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 4px',
                  borderTop: '1px solid var(--dsw-alias-border-l1)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>充值 ¥{order.amount}</div>
                  <div style={{ fontSize: 12, opacity: 0.55, marginTop: 1 }}>
                    {order.paymentMethod === 'alipay' ? '支付宝' : order.paymentMethod === 'wxpay' ? '微信支付' : order.paymentMethod} · {fmtOrderTime(order.createdAt)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: st.color,
                    background: `${st.color}1a`,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {st.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        style={{ ...ghostButtonStyle, alignSelf: 'flex-start', color: 'var(--dsw-alias-state-error-primary)' }}
        onClick={signOut}
      >
        退出登录
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => { if (!busy) { setOpen(false); setCheckoutUrl(null) } }}>
        <div style={{ ...modalStyle, width: checkoutUrl ? 480 : undefined }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 600 }}>充值</div>
          {!checkoutUrl && (
            <>
              {/* 内测专享：月度会员 ¥299/月（原价 ¥599/月 五折） */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--dsw-alias-brand-primary)',
                  background: 'var(--dsw-alias-bg-layer-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>内测专享 · 月度会员</div>
                  <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                    原价 ¥599/月 · 内测期间五折优惠
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>¥299/月</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                历史订单不影响新充值，可随时创建并支付。
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['alipay', 'wxpay'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    style={{ ...buttonStyle, flex: 1, border: payMethod === method ? '2px solid var(--dsw-alias-brand-primary)' : '1px solid currentColor' }}
                    onClick={() => setPayMethod(method)}
                  >
                    {method === 'alipay' ? '支付宝' : '微信支付'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                style={{ ...primaryButtonStyle, width: '100%', justifyContent: 'center', padding: '10px 0' }}
                disabled={busy}
                onClick={() => { void recharge(299) }}
              >
                {busy ? '处理中…' : '立即充值 ¥299/月'}
              </button>
            </>
          )}
          {checkoutUrl && (
            <iframe
              src={checkoutUrl}
              title="支付"
              style={{ width: '100%', height: 560, border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}
            />
          )}
            {status && <div style={{ opacity: 0.8, fontSize: 13 }}>{status}</div>}
            {checkoutUrl && (
              <button type="button" style={buttonStyle} onClick={() => { refresh(); setStatus('余额已刷新') }}>
                刷新余额
              </button>
            )}
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {editOpen && (
        <div style={overlayStyle} onClick={() => { if (!saving) { setEditOpen(false); setEditError(null) } }}>
          <div style={{ ...modalStyle, width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600 }}>编辑资料</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="" style={{ ...avatarStyle, width: 64, height: 64 }} />
                : (profile?.avatar
                  ? <img src={profile.avatar} alt="" style={{ ...avatarStyle, width: 64, height: 64 }} />
                  : (
                    <div style={{
                      ...avatarStyle,
                      width: 64,
                      height: 64,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      fontWeight: 600,
                      color: 'var(--dsw-alias-label-secondary)',
                    }}>
                      {avatarInitial}
                    </div>
                  ))}
              <label style={{ ...buttonStyle, display: 'inline-block', cursor: 'pointer' }}>
                选择头像图片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => pickAvatar(e.target.files?.[0])}
                />
              </label>
            </div>
            <div>
              <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>用户名</div>
              <input
                value={editUsername}
                style={inputStyle}
                maxLength={32}
                placeholder="1-32 位字母、数字、下划线或连字符"
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </div>
            {editError && <div style={{ fontSize: 12, color: '#d1242f' }}>{editError}</div>}
            {editStatus && <div style={{ fontSize: 12, opacity: 0.8 }}>{editStatus}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={buttonStyle} disabled={saving} onClick={() => { setEditOpen(false); setEditError(null) }}>
                取消
              </button>
              <button type="button" style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }} disabled={saving} onClick={() => { void saveProfile() }}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {accountModal && (
        <div style={overlayStyle} onClick={closeAccountModal}>
          <div style={{ ...modalStyle, width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600 }}>
              {accountModal === 'email' ? '更换邮箱' : '修改密码'}
            </div>

            {accountStep === 'identity' && (
              <>
                {identityMethod === 'password' ? (
                  <>
                    <div>
                      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>当前密码</div>
                      <input
                        value={identityPassword}
                        style={inputStyle}
                        type="password"
                        maxLength={128}
                        placeholder="用于验证身份"
                        onChange={(e) => setIdentityPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                      disabled={accountBusy}
                      onClick={() => { void verifyIdentityPassword() }}
                    >
                      {accountBusy ? '验证中…' : '验证身份'}
                    </button>
                    <button
                      type="button"
                      style={{ ...buttonStyle, alignSelf: 'flex-start', opacity: 0.7 }}
                      onClick={() => { setIdentityMethod('email-code'); setAccountError(null) }}
                    >
                      改用邮箱验证码
                    </button>
                  </>
                ) : (
                  <>
                    {!identityCodeSent ? (
                      <button
                        type="button"
                        style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                        disabled={accountBusy}
                        onClick={() => { void sendIdentityEmailCode() }}
                      >
                        {accountBusy ? '发送中…' : `发送验证码到当前邮箱${profile?.email ? `（${profile.email}）` : ''}`}
                      </button>
                    ) : (
                      <>
                        <div>
                          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>验证码</div>
                          <input
                            value={identityCode}
                            style={inputStyle}
                            inputMode="numeric"
                            placeholder="输入邮件中的验证码"
                            onChange={(e) => setIdentityCode(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                          disabled={accountBusy}
                          onClick={() => { void verifyIdentityEmailCode() }}
                        >
                          {accountBusy ? '验证中…' : '验证身份'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      style={{ ...buttonStyle, alignSelf: 'flex-start', opacity: 0.7 }}
                      onClick={() => { setIdentityMethod('password'); setAccountError(null) }}
                    >
                      改用当前密码
                    </button>
                  </>
                )}
              </>
            )}

            {accountStep === 'change' && accountModal === 'email' && (
              <>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>新邮箱地址</div>
                  <input
                    value={newEmail}
                    style={inputStyle}
                    maxLength={254}
                    type="email"
                    placeholder="you@example.com"
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                {!newEmailCodeSent ? (
                  <button
                    type="button"
                    style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                    disabled={accountBusy}
                    onClick={() => { void sendNewEmailCode() }}
                  >
                    {accountBusy ? '发送中…' : '发送验证码到新邮箱'}
                  </button>
                ) : (
                  <>
                    <div>
                      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>新邮箱验证码</div>
                      <input
                        value={newEmailCode}
                        style={inputStyle}
                        inputMode="numeric"
                        placeholder="输入新邮箱收到的验证码"
                        onChange={(e) => setNewEmailCode(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                      disabled={accountBusy}
                      onClick={() => { void submitChange() }}
                    >
                      {accountBusy ? '提交中…' : '验证并更换'}
                    </button>
                  </>
                )}
              </>
            )}

            {accountStep === 'change' && accountModal === 'password' && (
              <>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>新密码</div>
                  <input
                    value={newPassword}
                    style={inputStyle}
                    type="password"
                    maxLength={128}
                    placeholder="8-128 位"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>确认新密码</div>
                  <input
                    value={newPasswordConfirm}
                    style={inputStyle}
                    type="password"
                    maxLength={128}
                    placeholder="再次输入新密码"
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600 }}
                  disabled={accountBusy}
                  onClick={() => { void submitChange() }}
                >
                  {accountBusy ? '提交中…' : '确认修改'}
                </button>
              </>
            )}

            {accountStep === 'done' && (
              <div style={{ textAlign: 'center', padding: '14px 0', fontWeight: 600 }}>
                {accountStatus ?? '已完成'}
              </div>
            )}

            {accountError && <div style={{ fontSize: 12, color: '#d1242f' }}>{accountError}</div>}
            {accountStatus && accountStep !== 'done' && (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{accountStatus}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={buttonStyle} disabled={accountBusy} onClick={closeAccountModal}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
