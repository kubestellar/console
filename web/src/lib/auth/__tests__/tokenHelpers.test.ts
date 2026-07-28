import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../i18n', () => ({
  default: { t: (key: string) => key },
}))

import {
  getJwtExpiryMs,
  isJWTExpired,
  getCachedUser,
  cacheUser,
  AUTH_USER_CACHE_KEY,
} from '../tokenHelpers'
import type { User } from '../types'

// Build a minimal JWT with standard base64 encoding
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

// Build a JWT using URL-safe base64 (- and _)
function makeUrlSafeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${header}.${body}.sig`
}

beforeEach(() => {
  localStorage.clear()
})

describe('getJwtExpiryMs', () => {
  it('returns exp * 1000 for a 3-part JWT with numeric exp', () => {
    const exp = 1_700_000_000
    expect(getJwtExpiryMs(makeJwt({ exp }))).toBe(exp * 1000)
  })

  it('returns null for a 3-part JWT with missing exp', () => {
    expect(getJwtExpiryMs(makeJwt({ sub: 'user' }))).toBeNull()
  })

  it('returns null for a 3-part JWT with non-numeric exp', () => {
    expect(getJwtExpiryMs(makeJwt({ exp: 'never', sub: 'user' }))).toBeNull()
  })

  it('returns null for a 2-part opaque token', () => {
    expect(getJwtExpiryMs('header.payload')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(getJwtExpiryMs('')).toBeNull()
  })

  it('returns null and does not throw for a malformed base64 payload', () => {
    expect(() => getJwtExpiryMs('aaa.!!!.bbb')).not.toThrow()
    expect(getJwtExpiryMs('aaa.!!!.bbb')).toBeNull()
  })

  it('decodes URL-safe base64 (- and _) correctly', () => {
    const exp = 1_700_003_600
    expect(getJwtExpiryMs(makeUrlSafeJwt({ exp }))).toBe(exp * 1000)
  })
})

describe('isJWTExpired', () => {
  it('returns false for a non-JWT opaque token (#6058 documented behaviour)', () => {
    expect(isJWTExpired('opaque-token-value')).toBe(false)
  })

  it('returns false for a JWT with exp in the far future', () => {
    // exp = year 2286 — always in the future
    expect(isJWTExpired(makeJwt({ exp: 9_999_999_999 }))).toBe(false)
  })

  it('returns true for a JWT with exp in the distant past', () => {
    // exp = 1970-01-01T00:00:01Z — always expired
    expect(isJWTExpired(makeJwt({ exp: 1 }))).toBe(true)
  })

  it('returns false for a JWT with a malformed payload (does not falsely log user out)', () => {
    expect(isJWTExpired('header.!!!.sig')).toBe(false)
  })
})

describe('getCachedUser / cacheUser', () => {
  const sampleUser: User = {
    id: 'u1',
    github_id: 'gh1',
    github_login: 'testuser',
    onboarded: true,
  }

  it('round-trips: cacheUser then getCachedUser returns the same object', () => {
    cacheUser(sampleUser)
    expect(getCachedUser()).toEqual(sampleUser)
  })

  it('getCachedUser returns null when storage is empty', () => {
    expect(getCachedUser()).toBeNull()
  })

  it('getCachedUser returns null and does not throw for malformed JSON', () => {
    localStorage.setItem(AUTH_USER_CACHE_KEY, 'not-json!!!')
    expect(() => getCachedUser()).not.toThrow()
    expect(getCachedUser()).toBeNull()
  })

  it('cacheUser(null) removes the storage key', () => {
    cacheUser(sampleUser)
    cacheUser(null)
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
  })
})
