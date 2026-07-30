import { MS_PER_DAY } from './constants/time'

interface StoredTokenRecord {
  token: string
  expiresAt: number
  integrity: string
}

export const DEFAULT_TOKEN_TTL_MS = MS_PER_DAY

function getStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage
  }

  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Compute cryptographic integrity hash for stored token record.
 * Uses SHA-256 via Web Crypto API to prevent XSS-based token substitution.
 * Falls back to non-crypto hash only when crypto.subtle is unavailable.
 */
async function computeIntegrity(key: string, token: string, expiresAt: number): Promise<string> {
  const value = `${key}:${token}:${expiresAt}`
  const data = new TextEncoder().encode(value)

  // Prefer crypto.subtle.digest (SHA-256) for cryptographic integrity.
  // Guard both `crypto` and `crypto.subtle` — some browsers (Safari on HTTP)
  // have `crypto` but `subtle` is undefined; others lack `crypto` entirely.
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback for non-secure contexts (HTTP, older browsers).
  // FNV-1a is not cryptographically secure but provides basic tamper detection.
  const FNV_OFFSET_BASIS = 0x811c9dc5
  const FNV_PRIME = 0x01000193
  let hash = FNV_OFFSET_BASIS
  for (const byte of data) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function isStoredTokenRecord(value: unknown): value is StoredTokenRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<StoredTokenRecord>
  return typeof candidate.token === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.integrity === 'string'
}

function parseStoredValue(rawValue: string): StoredTokenRecord | string | null {
  try {
    const parsed: unknown = JSON.parse(rawValue)
    return isStoredTokenRecord(parsed) ? parsed : null
  } catch {
    return rawValue
  }
}

export async function setToken(key: string, value: string, ttlMs: number = DEFAULT_TOKEN_TTL_MS, storage?: Storage): Promise<void> {
  const activeStorage = getStorage(storage)
  if (!activeStorage) {
    return
  }

  const expiresAt = Date.now() + ttlMs
  const record: StoredTokenRecord = {
    token: value,
    expiresAt,
    integrity: await computeIntegrity(key, value, expiresAt),
  }

  try {
    activeStorage.setItem(key, JSON.stringify(record))
  } catch {
    // Storage may be unavailable or quota-limited — ignore.
  }
}

export async function getToken(key: string, storage?: Storage): Promise<string | null> {
  const activeStorage = getStorage(storage)
  if (!activeStorage) {
    return null
  }

  let storedValue: string | null
  try {
    storedValue = activeStorage.getItem(key)
  } catch {
    return null
  }

  if (!storedValue) {
    return null
  }

  const parsedValue = parseStoredValue(storedValue)
  if (typeof parsedValue === 'string') {
    await setToken(key, parsedValue, DEFAULT_TOKEN_TTL_MS, activeStorage)
    return parsedValue
  }

  if (!parsedValue) {
    clearToken(key, activeStorage)
    return null
  }

  if (parsedValue.expiresAt <= Date.now()) {
    clearToken(key, activeStorage)
    return null
  }

  const expectedIntegrity = await computeIntegrity(key, parsedValue.token, parsedValue.expiresAt)
  if (parsedValue.integrity !== expectedIntegrity) {
    clearToken(key, activeStorage)
    return null
  }

  return parsedValue.token
}

export function clearToken(key: string, storage?: Storage): void {
  const activeStorage = getStorage(storage)
  if (!activeStorage) {
    return
  }

  try {
    activeStorage.removeItem(key)
  } catch {
    // Storage may be unavailable — ignore.
  }
}
