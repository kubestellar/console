import { MS_PER_DAY } from './constants/time'

interface StoredTokenRecord {
  token: string
  expiresAt: number
  integrity: string
}

const INTEGRITY_HASH_SEED = 5_381
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

function computeIntegrity(key: string, token: string, expiresAt: number): string {
  const value = `${key}:${token}:${expiresAt}`
  let hash = INTEGRITY_HASH_SEED

  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
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

export function setToken(key: string, value: string, ttlMs: number = DEFAULT_TOKEN_TTL_MS, storage?: Storage): void {
  const activeStorage = getStorage(storage)
  if (!activeStorage) {
    return
  }

  const expiresAt = Date.now() + ttlMs
  const record: StoredTokenRecord = {
    token: value,
    expiresAt,
    integrity: computeIntegrity(key, value, expiresAt),
  }

  try {
    activeStorage.setItem(key, JSON.stringify(record))
  } catch {
    // Storage may be unavailable or quota-limited — ignore.
  }
}

export function getToken(key: string, storage?: Storage): string | null {
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
    setToken(key, parsedValue, DEFAULT_TOKEN_TTL_MS, activeStorage)
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

  if (parsedValue.integrity !== computeIntegrity(key, parsedValue.token, parsedValue.expiresAt)) {
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
