/**
 * Per-user client credential storage for the feedback-app attribution
 * proxy. The credential is the GitHub access token issued to this
 * browser during OAuth login. It is stored in sessionStorage under an
 * opaque key and obfuscated at rest so it is not readable at a glance
 * from DevTools. Obfuscation is NOT cryptographic — the real security
 * property is that the credential is a per-user bearer token GitHub
 * can revoke, and that the proxy verifies it against GitHub on every
 * call.
 *
 * Do NOT rename the key or header to anything that makes the contents
 * obvious (no "oauth", "token", "github" in the identifiers).
 */

/** sessionStorage key. Deliberately opaque. */
const STORAGE_KEY = 'kc_ux_ctx'
/** Salt xor'd with the bytes before base64 so the value isn't directly recognizable. */
const XOR_SALT = 'kc-ux-v1'

function xor(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ XOR_SALT.charCodeAt(i % XOR_SALT.length))
  }
  return out
}

function obfuscate(raw: string): string {
  try {
    return btoa(xor(raw))
  } catch {
    return ''
  }
}

function deobfuscate(stored: string): string {
  try {
    return xor(atob(stored))
  } catch {
    return ''
  }
}

export function setClientCtx(value: string): void {
  if (!value) return
  try {
    sessionStorage.setItem(STORAGE_KEY, obfuscate(value))
  } catch {
    /* storage unavailable — caller will fall back to direct path */
  }
}

export function getClientCtx(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return stored ? deobfuscate(stored) : ''
  } catch {
    return ''
  }
}

export function clearClientCtx(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Reads the one-shot credential from the URL fragment set by the
 * backend's OAuth callback redirect, stores it (obfuscated), and
 * strips the fragment so it doesn't survive in browser history.
 *
 * Returns true if a credential was captured.
 */
export function captureClientCtxFromFragment(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash || hash.length <= 1) return false
  const params = new URLSearchParams(hash.slice(1))
  const val = params.get('kc_x')
  if (!val) return false
  setClientCtx(val)
  // Strip the fragment without triggering navigation.
  try {
    const cleaned = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleaned)
  } catch {
    /* ignore */
  }
  return true
}
