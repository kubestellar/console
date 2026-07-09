import { describe, it, expect, vi, afterEach } from 'vitest'
import { isJWTExpired } from './auth'

/**
 * Helper to create a JWT-like token with a specific `exp` claim.
 * Only creates the structure (header.payload.signature) — not cryptographically valid.
 */
function makeJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = 'fake-signature'
  return `${header}.${body}.${signature}`
}

describe('isJWTExpired', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true for an expired JWT', () => {
    // exp in the past (Unix seconds)
    const expiredToken = makeJWT({ exp: Math.floor(Date.now() / 1000) - 3600 })
    expect(isJWTExpired(expiredToken)).toBe(true)
  })

  it('returns false for a JWT that has not expired', () => {
    // exp 1 hour in the future
    const validToken = makeJWT({ exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(isJWTExpired(validToken)).toBe(false)
  })

  it('returns false for a JWT expiring exactly now (boundary)', () => {
    // When exp === now (in seconds), Date.now() in ms >= exp * 1000 is true
    const nowSec = Math.floor(Date.now() / 1000)
    const token = makeJWT({ exp: nowSec })
    // At the boundary, the token is considered expired (Date.now() >= expiryMs)
    expect(isJWTExpired(token)).toBe(true)
  })

  it('returns false for opaque (non-JWT) tokens', () => {
    // Opaque tokens should never be treated as expired
    expect(isJWTExpired('some-opaque-token')).toBe(false)
    expect(isJWTExpired('demo-token')).toBe(false)
  })

  it('returns false when token has only two parts', () => {
    expect(isJWTExpired('header.payload')).toBe(false)
  })

  it('returns false when payload has no exp field', () => {
    const noExpToken = makeJWT({ sub: 'user-123', iat: 1700000000 })
    expect(isJWTExpired(noExpToken)).toBe(false)
  })

  it('returns false when exp is not a number', () => {
    const badExpToken = makeJWT({ exp: 'not-a-number' })
    expect(isJWTExpired(badExpToken)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isJWTExpired('')).toBe(false)
  })

  it('returns false for malformed base64 in payload', () => {
    // Three parts but middle part is not valid base64
    expect(isJWTExpired('header.!!!invalid!!!.signature')).toBe(false)
  })

  it('handles base64url encoding (- and _ characters)', () => {
    // Create a payload with base64url-specific characters
    const payload = { exp: Math.floor(Date.now() / 1000) + 3600, data: 'test+value/here' }
    const payloadStr = JSON.stringify(payload)
    // Manually encode as base64url
    const base64 = btoa(payloadStr)
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const token = `${header}.${base64url}.sig`
    expect(isJWTExpired(token)).toBe(false) // Not expired (future exp)
  })
})
