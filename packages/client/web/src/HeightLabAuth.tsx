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
body[data-hl-auth='out'] [data-dsh-panel-host] {
  display: none !important;
}
/* HeightLab 2026-09-20（V30b）：登录页质感——参考现代 SaaS 登录页
   （Linear/Vercel 式极简单列）：高按钮大圆角、输入框白底浮起+focus 光晕、
   邀请码弱化置底。登录卡本身无底色（嵌在页面背景上）。 */
@keyframes hl-auth-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
.hl-auth-btn {
  width: 100%;
  padding: 13px 0;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: inherit;
  transition: opacity 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.hl-auth-btn:active:not(:disabled) { transform: scale(0.985); }
.hl-auth-btn:disabled { opacity: 0.6; cursor: default; }
.hl-auth-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.hl-auth-btn-primary:hover:not(:disabled) { opacity: 0.88; }
.hl-auth-btn-ghost {
  background: transparent;
  color: var(--dsw-alias-label-primary, #111);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14));
}
.hl-auth-btn-ghost:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.32)); }
#hl-invite-code {
  /* 2026-10-23：原来写死 #fff，暗色下登录框是一片白。改用语义面 token。 */
  background: var(--dsw-alias-surface-primary, #fff);
}
#hl-invite-code:focus {
  border-color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 0 0 3px var(--dsw-alias-border-l2, rgba(15, 17, 21, 0.08));
}
#hl-invite-code::placeholder { color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.28)); }
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
/** 从 JWT 里取 sub（仅解码 payload，不验签——验签由宿主/网关负责）。 */
function jwtSub(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (part === undefined || part === '') return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const payload = JSON.parse(json) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null
  } catch {
    return null
  }
}

async function hostAcceptsToken(token: string): Promise<boolean> {
  try {
    const res = await Promise.race([
      // 2026-11-02 修复（未登录可直接进软件的 BUG）：
      // 原实现只看 res.ok。但 /hl/me 是宿主路由，它返回的是**宿主当前会话**，
      // 与前端传入的 token 无关——只要宿主有会话，假 token 也返回 200
      // （实测：Bearer invalid-fake-token-xxx → 200）。于是前端把过期/伪造的
      // 本地 token 当成有效，直接放行进主界面 = 未登录也能用。
      // 现在必须**回显的 userId 与本地 token 的 sub 一致**才算通过。
      fetch('/hl/me', {
        headers: { authorization: `Bearer ${token}` },
      }),
      new Promise<never>((_resolve, reject) => {
        // 校验请求挂起时不能让登录门永远停在 checking（卡粒子）：8s 后按
        // 无效凭据处理，清掉并落到登录页，用户可重试。
        window.setTimeout(() => reject(new Error('me timeout')), 8_000)
      }),
    ])
    if (!res.ok) return false
    // token 自校验：解析 JWT payload 的 sub，与 /hl/me 回显的 userId 比对。
    // 拿不到 payload 或对不上 → 视为无效（宁可让用户重登，也不放行）。
    const expectedSub = jwtSub(token)
    if (expectedSub === null) return false
    const body = (await res.json().catch(() => null)) as { userId?: string } | null
    /* 2026-11-03 调试：记录 hostAcceptsToken 结果 */
    console.log('[hl/auth] hostAcceptsToken:', { expectedSub, bodyUserId: body?.userId, match: body?.userId === expectedSub })
    return body?.userId === expectedSub
  } catch (error) {
    console.log('[hl/auth] hostAcceptsToken error:', error)
    return false
  }
}

/**
 * HeightLab 2026-09-11：等待本地宿主就绪。
 *
 * 干净机器首次启动时宿主需先完成 provision 才能注册 `/hl/*` 路由；
 * 此前若过早提交，请求会落到静态页回退（返回 HTML），前端只能给出
 * 含糊的"邀请码校验失败"。这里显式探测 `/hl/app-info`，未就绪时给出
 * 明确提示并让用户稍候，避免把产品初始化过程误报成"邀请码无效"。
 * @param timeoutMs - 探测上限（毫秒）。
 * @returns 宿主是否在超时内就绪。
 */
async function waitForHostReady(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch('/hl/app-info', { cache: 'no-store' })
      if (res.ok) return true
    } catch { /* 宿主尚未监听，继续等 */ }
    if (Date.now() >= deadline) return false
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 400) })
  }
}

/**
 * HeightLab 2026-09-11：从宿主响应提取精确错误信息。
 * 宿主未就绪时该路由会落到静态页回退（返回 HTML），此时给出"服务正在
 * 初始化"而不是把 HTML 误当成邀请码校验失败。
 * @param res - 宿主响应。
 * @returns 面向用户的错误文案。
 */
async function hostErrorMessage(res: Response): Promise<string> {
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    return '服务正在初始化，请稍候几秒后重试'
  }
  const data = await res.json().catch(() => null)
  if (typeof data?.message === 'string' && data.message !== '') return data.message
  return '邀请码校验失败，请稍后重试'
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
    /* 2026-11-03（0.5.3 批 3，B3 登出免密重登修复）：
     * prompt=login 强制 Logto 显示登录页，即使用户已有 SSO 会话。
     * 没有这个参数，登出后点击登录会复用旧 SSO 会话直接免密进入，
     * 用户无法切换账号（退出失去意义）。 */
    prompt: 'login',
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

// HeightLab 2026-09-20（V30）：登录卡去白底/阴影/圆角——直接嵌在页面背景上；
// 质感靠排版与按钮层级（黑主按钮+幽灵副按钮）+ 进场淡入上移（见 AUTH_CSS）。
const cardStyle: React.CSSProperties = {
  width: 'min(380px, calc(100vw - 48px))',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  textAlign: 'center',
  animation: 'hl-auth-fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))',
  background: 'var(--dsw-alias-surface-primary, #fff)',
  color: 'var(--dsw-alias-label-primary, #111)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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
      // 宿主未就绪时先等待（干净机器首次启动需完成初始化），
      // 避免把初始化过程误报为"邀请码无效"。
      if (!(await waitForHostReady())) {
        setError('服务正在初始化，请稍候几秒后重试')
        return
      }
      const res = await fetch('/hl/invite/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        setError(await hostErrorMessage(res))
        return
      }
      const data = await res.json().catch(() => null)
      if (!data?.ok) {
        setError(await hostErrorMessage(res))
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
        {/* HeightLab：登录页品牌区 = 原图 logo + 品牌名。V30 删老标语
            「一句话，启动你的营销引擎」（与官网 v2 口径不符，宪法铁律 19）。 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          {/* HeightLab 2026-08-26：黑色胶囊 PNG（透明底），已随 build:web
              进 public→dist，不再依赖运行时拷贝；内联 potrace SVG 会把
              负形底色画成黑方块，弃用。 */}
          <img
            src="/heightlab-logo.png"
            alt=""
            width={42}
            height={42}
            style={{ display: 'block', userSelect: 'none', objectFit: 'contain' }}
          />
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.2px' }}>HeightLab</span>
        </div>

        <button
          type="button"
          className="hl-auth-btn hl-auth-btn-primary"
          disabled={busy}
          onClick={() => void startLogin()}
        >
          登录
        </button>
        <button
          type="button"
          className="hl-auth-btn hl-auth-btn-ghost"
          disabled={busy}
          onClick={() => void startRegister()}
        >
          注册新账号
        </button>

        {error && (
          <div role="alert" style={{ ...errorStyle, textAlign: 'center' }}>{error}</div>
        )}

        {/* HeightLab V30：邀请码从最上方移到最下方并弱化（仅注册需要；
            校验/绑定逻辑不变）。 */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))' }}>
          <label
            htmlFor="hl-invite-code"
            style={{ display: 'block', fontSize: 12, marginBottom: 8, color: 'var(--dsw-alias-label-secondary, #8a9097)' }}
          >
            新用户注册需要邀请码
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

        {devMode && (
          <button
            type="button"
            className="hl-auth-btn hl-auth-btn-ghost"
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
          console.log('[hl/auth] exchangeCode start, code length:', code.length)
          const auth = await exchangeCode(code)
          console.log('[hl/auth] exchangeCode result:', auth ? 'success' : 'null')
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
            // 绝不能在旧文档上 finish(signed-in)：10s 空等后挂载真实 UI
            // 会撞上正在重启的 Host，例子页/工作区会永远停在 loading。
            if (pushed.restartExpected) {
              /* 2026-11-03 修复：restartExpected 时不能清除 watchdog——
               * 如果壳 watcher 没有导航（如开发版 HOME 不一致），前端会永远卡住。
               * 让 watchdog 继续运行，12s 后超时显示登录页，用户可重试。
               * 2026-11-03 深夜修正：restartExpected 时必须调用 finish('signed-in')——
               * 否则 AppRoot 永远停留在 checking 阶段（粒子页面）。
               * 壳导航会重启宿主并刷新页面，所以这里先进入主界面没关系。 */
              console.log('[hl/auth] restartExpected, finishing signed-in and waiting for shell navigation')
              window.history.replaceState({}, '', window.location.pathname)
              finish('signed-in')
              return
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
