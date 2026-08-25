/**
 * HeightLab login gate (0.3.0 overlay). Wraps the real UI: until a valid
 * token exists the app shows the HeightLab login page instead of the DSH UI.
 *
 * Auth: Logto hosted login (email/password). On success the access token is
 * stored in localStorage and pushed to the Host via /hl/auth so the
 * heightlab-host-api routes (balance/recharge) can call the cloud with it.
 *
 * 内测邀请码（2026-08-18）：
 *   - 仅在“注册”时需要；一码一账号，注册成功即绑定；
 *   - “登录”不需要邀请码；绑定后该账号以后登录永久免码；
 *   - 内置邀请码 HLBETA-20260818（不限邮箱，拿到有效码即可注册）。
 */
import { useEffect, useRef, useState } from 'react'

const LOGTO_ENDPOINT = 'https://auth.heightlabai.com'
const LOGTO_APP_ID = 'u3icuh7r31p3jkhrfhjfx'
const TOKEN_KEY = 'heightlab-token'
const REFRESH_TOKEN_KEY = 'heightlab-refresh-token'
const ACCOUNT_TOKEN_KEY = 'heightlab-account-token'
const PKCE_VERIFIER_KEY = 'heightlab-pkce-verifier'
const INVITE_CODE_KEY = 'heightlab-invite-code'
const INVITE_MODE_KEY = 'heightlab-invite-mode'
const REDIRECT_URI = `${window.location.origin}/callback`

type AuthState = 'checking' | 'signed-out' | 'signed-in'
type InteractionMode = 'signIn' | 'signUp'

/**
 * Some DSH plugins (e.g. dsh-better-sidebar) mount their chrome directly on
 * document.body, outside the #root React tree, so the login gate alone cannot
 * remove them. Sync a body-level auth marker and hide that body-mounted chrome
 * while signed out — the login page must be the ONLY thing on screen.
 */
const AUTH_CSS_ID = 'heightlab-auth-gate-css'
const AUTH_CSS = `
body[data-hl-auth='out'] [data-dsh-better-sidebar],
body[data-hl-auth='out'] .W-zNGW_panel,
body[data-hl-auth='out'] .W-zNGW_toggleCluster,
body[data-hl-auth='out'] .W-zNGW_bottomPanel,
body[data-hl-auth='out'] .W-zNGW_cornerHandle,
body[data-hl-auth='out'] .W-zNGW_selectionPopup,
body[data-hl-auth='out'] .W-zNGW_boundaryError {
  display: none !important;
}
`

function ensureAuthCss(): void {
  try {
    if (document.getElementById(AUTH_CSS_ID) === null) {
      const style = document.createElement('style')
      style.id = AUTH_CSS_ID
      style.textContent = AUTH_CSS
      document.head.appendChild(style)
    }
  } catch { /* non-fatal */ }
}

function syncAuthMarker(state: AuthState): void {
  try {
    ensureAuthCss()
    document.body.dataset.hlAuth = state === 'signed-in' ? 'in' : 'out'
  } catch { /* non-fatal */ }
}

// 模块加载即生效（app bundle 在插件挂载前执行）：默认按“未登录”隐藏
// body 级插件 chrome，避免登录页出现侧栏滑入动画；登录校验完成后由
// syncAuthMarker 切换到 in/out。
try {
  ensureAuthCss()
  document.body.dataset.hlAuth = 'out'
} catch { /* non-fatal */ }

function storedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function setStoredToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* ignore */ }
}

function storedRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_TOKEN_KEY) } catch { return null }
}

function setStoredRefreshToken(token: string): void {
  try { localStorage.setItem(REFRESH_TOKEN_KEY, token) } catch { /* ignore */ }
}

function storedAccountToken(): string | null {
  try { return localStorage.getItem(ACCOUNT_TOKEN_KEY) } catch { return null }
}

function setStoredAccountToken(token: string): void {
  try { localStorage.setItem(ACCOUNT_TOKEN_KEY, token) } catch { /* ignore */ }
}

function storedInviteCode(): string | null {
  try { return localStorage.getItem(INVITE_CODE_KEY) } catch { return null }
}

function storedInviteMode(): InteractionMode | null {
  try {
    const mode = localStorage.getItem(INVITE_MODE_KEY)
    return mode === 'signUp' || mode === 'signIn' ? mode : null
  } catch { return null }
}

function clearInviteState(): void {
  try {
    localStorage.removeItem(INVITE_CODE_KEY)
    localStorage.removeItem(INVITE_MODE_KEY)
  } catch { /* ignore */ }
}

async function pushTokenToHost(token: string, refreshToken?: string, accountToken?: string): Promise<{ restartExpected: boolean }> {
  try {
    const res = await fetch('/hl/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        refreshToken: refreshToken || undefined,
        accountToken: accountToken || undefined,
      }),
    })
    const data = await res.json().catch(() => null)
    return { restartExpected: data?.restartExpected === true }
  } catch {
    // non-fatal: balance routes fall back；无法得知是否需重启时按“不等待”处理。
    return { restartExpected: false }
  }
}

/** Ask the Host to validate the credential; only a valid login passes. */
async function hostAcceptsToken(token: string): Promise<boolean> {
  try {
    const res = await Promise.race([
      fetch('/hl/me', {
        headers: { authorization: `Bearer ${token}` },
      }),
      new Promise<never>((_resolve, reject) => {
        // 校验请求挂起时不能让登录门永远停在 checking（卡粒子）：8s 后按
        // 无效凭据处理，清掉并落到登录页，用户可重试。
        window.setTimeout(() => reject(new Error('me timeout')), 8_000)
      }),
    ])
    return res.ok
  } catch {
    return false
  }
}

/** 注册成功后把邀请码绑定到当前账号（宿主代理云端，失败则拒绝进入）。 */
async function bindInviteToHost(token: string, code: string): Promise<string | null> {
  try {
    const res = await fetch('/hl/invite/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok) return null
    return typeof data?.message === 'string' ? data.message : '邀请码绑定失败，请重新注册'
  } catch {
    return '网络异常，邀请码绑定失败，请稍后重试'
  }
}

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

async function exchangeCode(code: string): Promise<{ token: string; refreshToken: string | null; accountToken: string | null } | null> {
  try {
    // localStorage, not sessionStorage: WKWebView clears sessionStorage on a
    // cross-origin navigation (127.0.0.1 -> auth.heightlab.cn and back), which
    // silently destroyed the PKCE verifier and made the callback flash back.
    const verifier = localStorage.getItem(PKCE_VERIFIER_KEY) ?? ''
    localStorage.removeItem(PKCE_VERIFIER_KEY)
    const res = await Promise.race([
      fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: LOGTO_APP_ID,
          redirect_uri: REDIRECT_URI,
          code,
          code_verifier: verifier,
        }).toString(),
      }),
      new Promise<Response>((_resolve, reject) => {
        // 换码请求挂起时不能让登录门永远停在 checking（卡粒子）：15s 后
        // 按失败处理并落到登录页，用户可重试。
        window.setTimeout(() => reject(new Error('exchange timeout')), 15_000)
      }),
    ])
    if (!res.ok) return null
    const data = await res.json()
    // HeightLab cloud APIs authenticate with the Logto ID token (JWT), the
    // same credential the legacy frontend used; access_token alone is
    // rejected with AUTH_TOKEN_INVALID.
    const token = typeof data.id_token === 'string'
      ? data.id_token
      : (typeof data.access_token === 'string' ? data.access_token : null)
    if (!token) return null
    return {
      token,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      // Logto Account API 需要 OP 签发的 opaque access token（不是 ID token）。
      accountToken: typeof data.access_token === 'string' ? data.access_token : null,
    }
  } catch {
    return null
  }
}

async function signInRedirect(mode: InteractionMode): Promise<void> {
  const { verifier, challenge } = await pkcePair()
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  const params = new URLSearchParams({
    client_id: LOGTO_APP_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    // offline_access：让 Logto 返回 refresh_token，宿主可在 access token
    // 过期前静默续期，避免会话中途所有工具调用 401。
    scope: 'openid profile email offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: Math.random().toString(36).slice(2),
    // Logto 支持 interaction_mode：注册直达注册页，登录直达登录页。
    interaction_mode: mode,
  })
  const loginUrl = `${LOGTO_ENDPOINT}/oidc/auth?${params.toString()}`
  // 0.3.17 成熟逻辑：主窗口原地跳转（嵌入式登录，无弹窗）。WKWebView 在同一
  // 窗口内完成 Logto 交互并回到 /callback，SPA 回退保证回调页能换码登录。
  window.location.href = loginUrl
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--dsw-alias-bg-base, #f5f6f7)',
  color: 'var(--dsw-alias-label-primary, #111)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-1, #fff)',
  borderRadius: '16px',
  padding: '40px 36px',
  minWidth: '320px',
  maxWidth: '400px',
  boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  textAlign: 'center',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 0',
  borderRadius: '10px',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  background: 'var(--dsw-alias-button-primary-fill, #0f1115)',
  color: 'var(--dsw-alias-label-primary-foreground, #fff)',
  transition: 'background 0.15s ease',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))',
  background: 'var(--dsw-alias-bg-base, #fff)',
  color: 'var(--dsw-alias-label-primary, #111)',
  fontSize: 14,
  outline: 'none',
}

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-state-error-primary, #ec1313)',
  textAlign: 'left',
}

export function HeightLabLoginPage({ initialError }: { initialError?: string | null }) {
  const [devMode, setDevMode] = useState(false)
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/hl/dev-mode')
      .then(r => r.json())
      .then((data) => { if (data?.ok && data.dev) setDevMode(true) })
      .catch(() => { /* default: production login only */ })
  }, [])

  // 诊断触发（仅测试用）：URL 带 hl_auto_login=1 时 1.5s 后自动点登录，
  // 用于复现/验证“登录跳转后空白”的完整链路；正式流程不受影响。
  useEffect(() => {
    let auto = false
    try { auto = sessionStorage.getItem('hl-auto-login') === '1' } catch { /* 忽略 */ }
    if (!auto) return
    const timer = window.setTimeout(() => { void startLogin() }, 1200)
    return () => {
      window.clearTimeout(timer)
      try { sessionStorage.removeItem('hl-auto-login') } catch { /* 忽略 */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRegister = async () => {
    const code = invite.trim().toUpperCase()
    if (!code) {
      setError('请输入注册邀请码')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/hl/invite/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setError(typeof data?.message === 'string' ? data.message : '邀请码校验失败，请稍后重试')
        return
      }
      try {
        localStorage.setItem(INVITE_CODE_KEY, code)
        localStorage.setItem(INVITE_MODE_KEY, 'signUp')
      } catch { /* ignore */ }
      await signInRedirect('signUp')
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const startLogin = async () => {
    setError(null)
    setBusy(true)
    try {
      clearInviteState()
      await signInRedirect('signIn')
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* HeightLab：登录页品牌区 = 原图 logo + 品牌名 + 标语。 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {/* HeightLab 2026-08-26：黑色胶囊 PNG（透明底），已随 build:web
              进 public→dist，不再依赖运行时拷贝；内联 potrace SVG 会把
              负形底色画成黑方块，弃用。 */}
          <img
            src="/heightlab-logo.png"
            alt=""
            width={30}
            height={30}
            style={{ display: 'block', userSelect: 'none', objectFit: 'contain' }}
          />
          <span style={{ fontSize: 22, fontWeight: 700 }}>HeightLab</span>
        </div>
        <div style={{ opacity: 0.7, fontSize: 13 }}>一句话，启动你的营销引擎</div>

        <div style={{ textAlign: 'left' }}>
          <label
            htmlFor="hl-invite-code"
            style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--dsw-alias-label-secondary, #61666b)' }}
          >
            注册邀请码（仅注册需要）
          </label>
          <input
            id="hl-invite-code"
            type="text"
            value={invite}
            autoComplete="off"
            spellCheck={false}
            placeholder="请输入邀请码"
            style={inputStyle}
            onChange={(e) => {
              setInvite(e.target.value.toUpperCase())
              if (error) setError(null)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void startRegister() }}
          />
        </div>

        {error && (
          <div role="alert" style={errorStyle}>{error}</div>
        )}

        <button
          type="button"
          style={{ ...primaryButtonStyle, opacity: busy ? 0.65 : 1, cursor: busy ? 'default' : 'pointer' }}
          disabled={busy}
          onClick={() => void startRegister()}
        >
          注册
        </button>
        <button
          type="button"
          style={{ ...primaryButtonStyle, opacity: busy ? 0.65 : 1, cursor: busy ? 'default' : 'pointer' }}
          disabled={busy}
          onClick={() => void startLogin()}
        >
          登录
        </button>

        {devMode && (
          <button
            type="button"
            style={{ ...primaryButtonStyle, background: 'transparent', color: 'inherit', border: '1px solid currentColor' }}
            onClick={() => {
              setStoredToken('hl-local-mock-token')
              void pushTokenToHost('hl-local-mock-token')
              window.location.reload()
            }}
          >
            直接进入（开发测试）
          </button>
        )}
      </div>
    </div>
  )
}

export function HeightLabAuthGate({
  onReady,
}: {
  onReady: (next: 'signed-in' | 'signed-out', errorMessage?: string) => void
}) {
  const [state, setState] = useState<AuthState>('checking')
  const resolvedRef = useRef(false)

  useEffect(() => { syncAuthMarker(state) }, [state])

  useEffect(() => {
    try {
      sessionStorage.removeItem('hl-post-login-reload')
    } catch { /* 忽略 */ }
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    // 诊断触发：URL 带 hl_auto_login=1 时先存 sessionStorage（登录页挂载前
    // 参数会被 replaceState 剥掉），供登录页自动点登录复现完整链路。
    if (params.get('hl_auto_login') === '1') {
      try { sessionStorage.setItem('hl-auto-login', '1') } catch { /* 忽略 */ }
    }
    // 看门狗：无论校验链路（/hl/me、换码、绑定）发生什么，12s 内必须
    // 出结果，否则按未登录落到登录页——商业版绝不允许永久卡在粒子页。
    let resolved = false
    let watchdog = 0
    const finish = (next: AuthState, errorMessage?: string) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      resolved = true
      window.clearTimeout(watchdog)
      setState(next)
      syncAuthMarker(next)
      if (next === 'signed-in') onReady('signed-in')
      else onReady('signed-out', errorMessage)
    }
    void (async () => {
      try {
        if (code) {
          const auth = await exchangeCode(code)
          if (auth && await hostAcceptsToken(auth.token)) {
            const inviteCode = storedInviteCode()
            const inviteMode = storedInviteMode()
            if (inviteMode === 'signUp' && inviteCode) {
              const bindError = await bindInviteToHost(auth.token, inviteCode)
              if (bindError !== null) {
                try {
                  localStorage.removeItem(TOKEN_KEY)
                  localStorage.removeItem(ACCOUNT_TOKEN_KEY)
                } catch { /* ignore */ }
                clearInviteState()
                window.history.replaceState({}, '', window.location.pathname)
                finish('signed-out', bindError)
                return
              }
            }
            clearInviteState()
            setStoredToken(auth.token)
            if (auth.refreshToken) setStoredRefreshToken(auth.refreshToken)
            if (auth.accountToken) setStoredAccountToken(auth.accountToken)
            const pushed = await pushTokenToHost(auth.token, auth.refreshToken ?? undefined, auth.accountToken ?? undefined)
            // HeightLab：首次登录（或登出后重登）宿主会按用户重启并重新导航。
            // 这里保持加载动画等待这次重载，避免“先出界面再闪一下”；
            // 若 10s 内没有重载（理论上不应发生）则按原逻辑直接进入，作为兜底。
            if (pushed.restartExpected) {
              try {
                sessionStorage.setItem('hl-post-login-reload', '1')
              } catch { /* 忽略 */ }
              await new Promise<void>((resolve) => { window.setTimeout(resolve, 10_000) })
              try {
                sessionStorage.removeItem('hl-post-login-reload')
              } catch { /* 忽略 */ }
            }
            // Strip the code from the URL.
            window.history.replaceState({}, '', window.location.pathname)
            finish('signed-in')
            return
          }
          try {
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(ACCOUNT_TOKEN_KEY)
          } catch { /* ignore */ }
        }
        const existing = storedToken()
        if (existing) {
          if (await hostAcceptsToken(existing)) {
            clearInviteState()
            await pushTokenToHost(existing, storedRefreshToken() ?? undefined, storedAccountToken() ?? undefined)
            finish('signed-in')
            return
          }
          // Invalid or expired credential: never grant access, clear it.
          try {
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(ACCOUNT_TOKEN_KEY)
          } catch { /* ignore */ }
        }
        clearInviteState()
        window.history.replaceState({}, '', window.location.pathname)
        finish('signed-out')
      } catch (error) {
        // 登录门任何未预期异常都不能卡在 checking（粒子页）：清理凭据、
        // 剥离回调参数后落到登录页，用户可重试。
        try {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(ACCOUNT_TOKEN_KEY)
        } catch { /* ignore */ }
        try {
          window.history.replaceState({}, '', window.location.pathname)
        } catch { /* ignore */ }
        finish('signed-out', error instanceof Error ? error.message : String(error))
      }
    })()
    watchdog = window.setTimeout(() => {
      if (!resolved) finish('signed-out', '登录状态校验超时，请重新登录')
    }, 12_000)
    return () => window.clearTimeout(watchdog)
  }, [onReady])

  // 动画由 AppRoot 统一挂载；这里只负责登录校验并回报结果。
  return null
}
