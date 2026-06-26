/**
 * Legacy client-credential helpers.
 *
 * GitHub OAuth access tokens now live in an HttpOnly cookie set by the backend,
 * so browser JavaScript must not persist or expose them. These helpers remain
 * as no-op compatibility shims for older call sites and tests.
 */
const LEGACY_STORAGE_KEY = 'kc_ux_ctx'

export function setClientCtx(_value: string): void {
  clearClientCtx()
}

export function getClientCtx(): string {
  clearClientCtx()
  return ''
}

export function clearClientCtx(): void {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Strips a legacy kc_x fragment without ever storing the credential in
 * JavaScript-accessible storage.
 */
export function captureClientCtxFromFragment(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash || hash.length <= 1) return false
  const params = new URLSearchParams(hash.slice(1))
  const hasLegacyValue = Boolean(params.get('kc_x'))
  if (!hasLegacyValue) return false
  clearClientCtx()
  try {
    const cleaned = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleaned)
  } catch {
    /* ignore */
  }
  return true
}
