/**
 * Per-user client credential storage for the feedback-app attribution
 * proxy. The credential is the GitHub access token issued to this
 * browser during OAuth login.
 *
 * Security: Uses Web Crypto API (AES-GCM) with a non-exportable
 * session key generated per page load. The key lives only in memory
 * (CryptoKey object) and cannot be extracted via JavaScript, making
 * stored ciphertext useless to scripts that access sessionStorage.
 *
 * Fallback: If Web Crypto is unavailable (older browsers, non-secure
 * contexts), falls back to in-memory-only storage (no persistence).
 *
 * Do NOT rename the key or header to anything that makes the contents
 * obvious (no "oauth", "token", "github" in the identifiers).
 */

/** sessionStorage key. Deliberately opaque. */
const STORAGE_KEY = 'kc_ux_ctx'

/** AES-GCM key generated once per page load — non-exportable. */
let sessionKey: CryptoKey | null = null

/** In-memory fallback when Web Crypto is unavailable. */
let memoryFallback: string = ''

/** IV length for AES-GCM (96 bits recommended by NIST). */
const IV_BYTES = 12

async function getOrCreateKey(): Promise<CryptoKey | null> {
  if (sessionKey) return sessionKey
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  try {
    sessionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-exportable
      ['encrypt', 'decrypt'],
    )
    return sessionKey
  } catch {
    return null
  }
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateKey()
  if (!key) return ''
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  )
  // Prepend IV to ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(stored: string): Promise<string> {
  const key = await getOrCreateKey()
  if (!key) return ''
  try {
    const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    if (combined.length <= IV_BYTES) return ''
    const iv = combined.slice(0, IV_BYTES)
    const ciphertext = combined.slice(IV_BYTES)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    // Key mismatch (page reload) or corrupt data — credential is lost
    return ''
  }
}

export async function setClientCtx(value: string): Promise<void> {
  if (!value) return
  memoryFallback = value
  try {
    const encrypted = await encrypt(value)
    if (encrypted) {
      sessionStorage.setItem(STORAGE_KEY, encrypted)
    }
  } catch {
    /* storage unavailable — in-memory fallback remains */
  }
}

export async function getClientCtx(): Promise<string> {
  // Try in-memory first (fastest, always available if set this session)
  if (memoryFallback) return memoryFallback
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const decrypted = await decrypt(stored)
      if (decrypted) {
        memoryFallback = decrypted
        return decrypted
      }
    }
  } catch {
    /* storage unavailable */
  }
  return ''
}

export function clearClientCtx(): void {
  memoryFallback = ''
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Reads the one-shot credential from the URL fragment set by the
 * backend's OAuth callback redirect, stores it (encrypted), and
 * strips the fragment so it doesn't survive in browser history.
 *
 * Returns true if a credential was captured.
 */
export function captureClientCtxFromFragment(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash || hash.length <= 1) return false

  // Strip the fragment IMMEDIATELY — before any async work — so no
  // script running after us can read the token from the URL.
  const params = new URLSearchParams(hash.slice(1))
  const val = params.get('kc_x')
  try {
    const cleaned = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleaned)
  } catch {
    /* ignore */
  }

  if (!val) return false
  // Store asynchronously — the token is already safe in the closure
  void setClientCtx(val)
  return true
}

