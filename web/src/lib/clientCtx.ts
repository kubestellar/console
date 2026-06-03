/**
 * Per-user client credential storage for the feedback-app attribution
 * proxy. The credential is the GitHub access token issued to this
 * browser during OAuth login. It is kept only in module scope so it is
 * not exposed via storage APIs, and the URL fragment is stripped
 * synchronously as soon as this module loads.
 *
 * Do NOT rename the key or header to anything that makes the contents
 * obvious (no "oauth", "token", "github" in the identifiers).
 */

/** Legacy sessionStorage key kept only so older stored values can be removed. */
const LEGACY_STORAGE_KEY = 'kc_ux_ctx'
const CLIENT_CTX_FRAGMENT_PARAM = 'kc_x'
const FRAGMENT_PREFIX_LENGTH = 1
const EMPTY_CLIENT_CTX = ''

let clientCtxValue = EMPTY_CLIENT_CTX
let pendingInitialCapture = false

function clearLegacyClientCtxStorage(): void {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function captureClientCtxFromCurrentFragment(): boolean {
  if (typeof window === 'undefined') return false

  const hash = window.location.hash
  if (!hash || hash.length <= FRAGMENT_PREFIX_LENGTH) return false

  const params = new URLSearchParams(hash.slice(FRAGMENT_PREFIX_LENGTH))
  const value = params.get(CLIENT_CTX_FRAGMENT_PARAM)
  if (!value) return false

  try {
    const cleaned = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleaned)
  } catch {
    /* ignore */
  }

  clientCtxValue = value
  clearLegacyClientCtxStorage()
  return true
}

pendingInitialCapture = captureClientCtxFromCurrentFragment()
if (!pendingInitialCapture) {
  clearLegacyClientCtxStorage()
}

export function setClientCtx(value: string): void {
  if (!value) return
  clientCtxValue = value
  pendingInitialCapture = false
  clearLegacyClientCtxStorage()
}

export function getClientCtx(): string {
  return clientCtxValue
}

export function clearClientCtx(): void {
  clientCtxValue = EMPTY_CLIENT_CTX
  pendingInitialCapture = false
  clearLegacyClientCtxStorage()
}

/**
 * Reads the one-shot credential from the URL fragment set by the
 * backend's OAuth callback redirect and strips the fragment so it does
 * not survive in browser history.
 *
 * Returns true if a credential was captured.
 */
export function captureClientCtxFromFragment(): boolean {
  if (pendingInitialCapture) {
    pendingInitialCapture = false
    return true
  }

  return captureClientCtxFromCurrentFragment()
}
