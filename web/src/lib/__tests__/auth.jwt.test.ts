import { describe, expect, it } from 'vitest'
import { authMod, getJwtExpiryMs, makeJwt, realGetJwtExpiryMs } from './auth.shared'

describe('getJwtExpiryMs', () => {
  it('returns exp * 1000 for a valid JWT with exp claim', () => {
    const EXP_SECONDS = 1700000000
    const token = makeJwt({ exp: EXP_SECONDS, sub: 'user-123' })
    expect(getJwtExpiryMs(token)).toBe(EXP_SECONDS * 1000)
  })

  it('returns null for a JWT without exp claim', () => {
    const token = makeJwt({ sub: 'user-123' })
    expect(getJwtExpiryMs(token)).toBeNull()
  })

  it('returns null for a JWT with non-numeric exp', () => {
    const token = makeJwt({ exp: 'not-a-number' })
    expect(getJwtExpiryMs(token)).toBeNull()
  })

  it('returns null for a token with fewer than 3 parts', () => {
    expect(getJwtExpiryMs('only-one-part')).toBeNull()
    expect(getJwtExpiryMs('two.parts')).toBeNull()
  })

  it('returns null for a token with more than 3 parts', () => {
    // 4 parts is invalid JWT structure — the function checks length !== 3
    expect(getJwtExpiryMs('a.b.c.d')).toBeNull()
  })

  it('returns null for completely invalid base64 payload', () => {
    expect(getJwtExpiryMs('header.!!!invalid-base64!!!.sig')).toBeNull()
  })

  it('returns null for non-JSON payload', () => {
    const nonJsonBase64 = btoa('this is not json')
    expect(getJwtExpiryMs(`header.${nonJsonBase64}.sig`)).toBeNull()
  })

  it('handles base64url characters (- and _)', () => {
    // Create a payload that when base64-encoded uses + and /,
    // then convert to base64url format
    const EXP_SECONDS = 1700000000
    const payload = JSON.stringify({ exp: EXP_SECONDS })
    const base64 = btoa(payload)
    // Convert to base64url
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_')
    const token = `header.${base64url}.sig`
    expect(getJwtExpiryMs(token)).toBe(EXP_SECONDS * 1000)
  })

  it('returns null for empty string', () => {
    expect(getJwtExpiryMs('')).toBeNull()
  })

  it('handles exp value of 0', () => {
    const token = makeJwt({ exp: 0 })
    expect(getJwtExpiryMs(token)).toBe(0)
  })

  it('handles negative exp value', () => {
    const token = makeJwt({ exp: -100 })
    const MS_PER_SECOND = 1000
    expect(getJwtExpiryMs(token)).toBe(-100 * MS_PER_SECOND)
  })
})

// ============================================================================
// getJwtExpiryMs — real source function via __testables
// ============================================================================

describe('getJwtExpiryMs (real source via __testables)', () => {
  it('returns exp * 1000 for valid JWT', () => {
    const token = makeJwt({ exp: 1700000000 })
    expect(realGetJwtExpiryMs(token)).toBe(1700000000 * 1000)
  })

  it('returns null for no exp', () => {
    expect(realGetJwtExpiryMs(makeJwt({ sub: 'x' }))).toBeNull()
  })

  it('returns null for non-3-part token', () => {
    expect(realGetJwtExpiryMs('a.b')).toBeNull()
  })

  it('returns null for bad base64', () => {
    expect(realGetJwtExpiryMs('a.!!!.c')).toBeNull()
  })
})

// ============================================================================
// isJWTExpired — real exported function
// ============================================================================

describe('isJWTExpired', () => {
  it('returns true for expired token', () => {
    const expired = makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })
    expect(authMod.isJWTExpired(expired)).toBe(true)
  })

  it('returns false for future token', () => {
    const future = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(authMod.isJWTExpired(future)).toBe(false)
  })

  it('returns false for non-JWT token (no exp)', () => {
    expect(authMod.isJWTExpired('opaque-token-string')).toBe(false)
  })

  it('returns false for JWT without exp claim', () => {
    expect(authMod.isJWTExpired(makeJwt({ sub: 'user' }))).toBe(false)
  })
})
