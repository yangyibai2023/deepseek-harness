/** Address parsing for the Sidebar browser's HTTP(S) allowlist. */

/** Maximum accepted address length; this bounds persisted navigation state. */
export const MAX_BROWSER_URL_LENGTH = 16 * 1024

/** A normalized Browser navigation target. */
export type BrowserTarget =
  | { readonly kind: 'https'; readonly url: string; readonly title: string }
  | { readonly kind: 'http'; readonly url: string; readonly title: string }

/** Why an address was refused before navigation. */
export type BrowserAddressFailure = 'empty' | 'invalid' | 'protocol' | 'credentials' | 'application-origin'

/** Result of parsing an address-bar value. */
export type BrowserAddressResult =
  | { readonly ok: true; readonly target: BrowserTarget }
  | { readonly ok: false; readonly reason: BrowserAddressFailure }

/**
 * Parse one address-bar value into the fixed protocol allowlist.
 * @param input - user or typed-open input.
 * @param applicationOrigin - current DSH document origin, blocked for HTTPS.
 * @returns a canonical target or the refusal reason.
 */
export function parseBrowserAddress(input: string, applicationOrigin?: string): BrowserAddressResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_BROWSER_URL_LENGTH) return { ok: false, reason: 'invalid' }
  const explicitScheme = /^[A-Za-z][A-Za-z\d+.-]*:(?!\d+(?:[/?#]|$))/u.test(trimmed)
  const candidate = explicitScheme ? trimmed : `https://${trimmed}`
  let url: URL
  try { url = new URL(candidate) } catch { return { ok: false, reason: 'invalid' } }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'credentials' }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    if (applicationOrigin !== undefined && applicationOrigin !== 'null') {
      try {
        // HeightLab（2026-10-17 媒体链路修复）：同源 /hl/ 前缀是我们自己的媒体
        // 预览端点（/hl/media-preview、/hl/local-media、/hl/videos、/hl/images），
        // 放行给右侧边栏 browser 标签——否则聊天媒体点击无法在侧栏预览/播放。
        if (url.origin === new URL(applicationOrigin).origin && !url.pathname.startsWith('/hl/')) {
          return { ok: false, reason: 'application-origin' }
        }
      } catch {
        // An unavailable application origin cannot grant access to a target.
      }
    }
    return { ok: true, target: { kind: url.protocol === 'https:' ? 'https' : 'http', url: url.href, title: url.hostname } }
  }
  return { ok: false, reason: 'protocol' }
}
