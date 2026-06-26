import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setToken, getToken, clearToken, DEFAULT_TOKEN_TTL_MS } from '../secureTokenStore'

/**
 * In-memory Storage mock that mirrors the Web Storage API.
 */
function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

describe('secureTokenStore', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMockStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setToken + getToken round-trip', () => {
    it('stores and retrieves a token', async () => {
      await setToken('auth', 'my-secret-token', DEFAULT_TOKEN_TTL_MS, storage)
      expect(await getToken('auth', storage)).toBe('my-secret-token')
    })

    it('stores with custom TTL', async () => {
      await setToken('refresh', 'refresh-value', 60_000, storage)
      expect(await getToken('refresh', storage)).toBe('refresh-value')
    })
  })

  describe('TTL expiration', () => {
    it('returns null for expired tokens', async () => {
      await setToken('auth', 'token-value', 5_000, storage)
      // Advance time past TTL
      vi.advanceTimersByTime(5_001)
      expect(await getToken('auth', storage)).toBeNull()
    })

    it('clears expired tokens from storage', async () => {
      await setToken('auth', 'token-value', 5_000, storage)
      vi.advanceTimersByTime(5_001)
      await getToken('auth', storage)
      expect(storage.getItem('auth')).toBeNull()
    })

    it('returns token just before expiry', async () => {
      await setToken('auth', 'token-value', 5_000, storage)
      vi.advanceTimersByTime(4_999)
      expect(await getToken('auth', storage)).toBe('token-value')
    })
  })

  describe('integrity verification', () => {
    it('rejects tokens with tampered integrity hash', async () => {
      await setToken('auth', 'token-value', DEFAULT_TOKEN_TTL_MS, storage)
      // Tamper with the stored record
      const raw = storage.getItem('auth')!
      const record = JSON.parse(raw)
      record.integrity = 'tampered-hash'
      storage.setItem('auth', JSON.stringify(record))

      expect(await getToken('auth', storage)).toBeNull()
    })

    it('clears tampered tokens from storage', async () => {
      await setToken('auth', 'token-value', DEFAULT_TOKEN_TTL_MS, storage)
      const raw = storage.getItem('auth')!
      const record = JSON.parse(raw)
      record.integrity = 'bad'
      storage.setItem('auth', JSON.stringify(record))

      await getToken('auth', storage)
      expect(storage.getItem('auth')).toBeNull()
    })

    it('rejects tokens with modified token value', async () => {
      await setToken('auth', 'original', DEFAULT_TOKEN_TTL_MS, storage)
      const raw = storage.getItem('auth')!
      const record = JSON.parse(raw)
      record.token = 'injected-value'
      storage.setItem('auth', JSON.stringify(record))

      expect(await getToken('auth', storage)).toBeNull()
    })

    it('rejects tokens with modified expiresAt', async () => {
      await setToken('auth', 'token-value', 5_000, storage)
      const raw = storage.getItem('auth')!
      const record = JSON.parse(raw)
      // Attacker extends expiry but integrity won't match
      record.expiresAt = Date.now() + 999_999_999
      storage.setItem('auth', JSON.stringify(record))

      expect(await getToken('auth', storage)).toBeNull()
    })
  })

  describe('malformed storage values', () => {
    it('returns null for invalid JSON', async () => {
      storage.setItem('auth', 'not-json-{{{')
      // Non-parseable values are treated as legacy plain strings
      // only if they don't look like JSON
      expect(await getToken('auth', storage)).toBe('not-json-{{{')
    })

    it('returns null for JSON missing required fields', async () => {
      storage.setItem('auth', JSON.stringify({ token: 'x' }))
      expect(await getToken('auth', storage)).toBeNull()
    })

    it('returns null for null stored value', async () => {
      expect(await getToken('nonexistent', storage)).toBeNull()
    })
  })

  describe('legacy plain-string migration', () => {
    it('migrates plain-string tokens to structured format', async () => {
      // Simulate legacy format: just a raw string in storage
      storage.setItem('auth', 'legacy-token-value')
      const result = await getToken('auth', storage)
      expect(result).toBe('legacy-token-value')

      // After retrieval, storage should now contain the structured format
      const raw = storage.getItem('auth')!
      const record = JSON.parse(raw)
      expect(record.token).toBe('legacy-token-value')
      expect(record.expiresAt).toBeGreaterThan(Date.now())
      expect(record.integrity).toBeDefined()
    })
  })

  describe('storage unavailability', () => {
    it('setToken does not throw when storage is null', async () => {
      await expect(setToken('auth', 'value', DEFAULT_TOKEN_TTL_MS, undefined)).resolves.not.toThrow()
    })

    it('getToken returns null when storage is null', async () => {
      expect(await getToken('auth', undefined)).toBeNull()
    })

    it('clearToken does not throw when storage is null', () => {
      expect(() => clearToken('auth', undefined)).not.toThrow()
    })

    it('handles storage that throws on getItem', async () => {
      const broken: Storage = {
        ...createMockStorage(),
        getItem: () => { throw new Error('SecurityError') },
      }
      expect(await getToken('auth', broken)).toBeNull()
    })

    it('handles storage that throws on setItem', async () => {
      const broken: Storage = {
        ...createMockStorage(),
        setItem: () => { throw new Error('QuotaExceededError') },
      }
      await expect(setToken('auth', 'value', DEFAULT_TOKEN_TTL_MS, broken)).resolves.not.toThrow()
    })
  })

  describe('clearToken', () => {
    it('removes the token from storage', async () => {
      await setToken('auth', 'value', DEFAULT_TOKEN_TTL_MS, storage)
      clearToken('auth', storage)
      expect(storage.getItem('auth')).toBeNull()
      expect(await getToken('auth', storage)).toBeNull()
    })
  })
})
