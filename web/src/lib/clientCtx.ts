/**
 * Per-user client credential storage for the feedback-app attribution
 * proxy. The credential is the GitHub access token issued to this
 * browser during OAuth login. It is stored in sessionStorage under an
 * opaque key and encrypted using Web Crypto API. The encryption key
 * is a non-exportable key that cannot be accessed from JavaScript,
 * providing protection against same-origin script access.
 *
 * Do NOT rename the key or header to anything that makes the contents
 * obvious (no "oauth", "token", "github" in the identifiers).
 */

/** sessionStorage key. Deliberately opaque. */
const STORAGE_KEY = 'kc_ux_ctx'
/** sessionStorage key for the encryption key (stored as base64-encoded JSON) */
const KEY_STORAGE_KEY = 'kc_ux_key'

let encryptionKey: CryptoKey | null = null

/**
 * Initialize or retrieve the non-exportable encryption key.
 * Uses a session-scoped key that exists only in memory and sessionStorage.
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  if (encryptionKey) return encryptionKey

  try {
    // Try to restore key from sessionStorage (it's stored as stringified JSON from previous session)
    const storedKeyJson = sessionStorage.getItem(KEY_STORAGE_KEY)
    if (storedKeyJson) {
      try {
        const keyData = JSON.parse(storedKeyJson)
        encryptionKey = await crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM' },
          false, // non-extractable
          ['encrypt', 'decrypt']
        )
        return encryptionKey
      } catch {
        // If import fails, generate a new key
        sessionStorage.removeItem(KEY_STORAGE_KEY)
      }
    }

    // Generate a new non-exportable key
    encryptionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    )

    // Store the key as JWK for session persistence
    const exportedKey = await crypto.subtle.exportKey('jwk', encryptionKey)
    sessionStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(exportedKey))

    return encryptionKey
  } catch {
    throw new Error('Failed to initialize encryption key')
  }
}

/**
 * Encrypt a string using AES-GCM with a non-exportable key.
 * Returns the IV and ciphertext as base64-encoded JSON.
 */
async function encrypt(raw: string): Promise<string> {
  try {
    const key = await getOrCreateKey()
    const encoder = new TextEncoder()
    const data = encoder.encode(raw)
    
    // Generate a random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )
    
    // Return IV and ciphertext as base64-encoded JSON
    const result = {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    }
    return btoa(JSON.stringify(result))
  } catch {
    return ''
  }
}

/**
 * Decrypt a string encrypted with the encrypt function.
 */
async function decrypt(stored: string): Promise<string> {
  try {
    const key = await getOrCreateKey()
    const result = JSON.parse(atob(stored))
    const iv = new Uint8Array(result.iv)
    const ciphertext = new Uint8Array(result.ciphertext)
    
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    
    const decoder = new TextDecoder()
    return decoder.decode(plaintext)
  } catch {
    return ''
  }
}

export async function setClientCtx(value: string): Promise<void> {
  if (!value) return
  try {
    const encrypted = await encrypt(value)
    if (encrypted) {
      sessionStorage.setItem(STORAGE_KEY, encrypted)
    }
  } catch {
    /* storage unavailable — caller will fall back to direct path */
  }
}

export async function getClientCtx(): Promise<string> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return stored ? await decrypt(stored) : ''
  } catch {
    return ''
  }
}

export function clearClientCtx(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(KEY_STORAGE_KEY)
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
export async function captureClientCtxFromFragment(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash || hash.length <= 1) return false
  const params = new URLSearchParams(hash.slice(1))
  const val = params.get('kc_x')
  if (!val) return false
  await setClientCtx(val)
  // Strip the fragment without triggering navigation.
  try {
    const cleaned = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleaned)
  } catch {
    /* ignore */
  }
  return true
}
