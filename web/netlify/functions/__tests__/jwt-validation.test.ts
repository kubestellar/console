// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT } from 'jose'
import { validateJWT, validateBearerToken } from '../_shared/jwt-validation'

const TEST_SECRET = 'test-secret-for-jwt-validation-at-least-32-chars'

async function makeToken(
  payload: Record<string, unknown> = {},
  options: { secret?: string; alg?: string; exp?: number } = {},
): Promise<string> {
  const secret = options.secret ?? TEST_SECRET
  const alg = options.alg ?? 'HS256'
  const key = new TextEncoder().encode(secret)

  let builder = new SignJWT(payload).setProtectedHeader({ alg })

  if (options.exp !== undefined) {
    builder = builder.setExpirationTime(options.exp)
  }

  return builder.sign(key)
}

function makeUnsignedToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = '',
): string {
  const encodeB64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${encodeB64url(header)}.${encodeB64url(payload)}.${signature}`
}

describe('validateJWT', () => {
  describe('structural validation', () => {
    it('rejects empty token', async () => {
      const result = await validateJWT('', TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('required')
    })

    it('rejects non-string token', async () => {
      const result = await validateJWT(null as unknown as string, TEST_SECRET)
      expect(result.valid).toBe(false)
    })

    it('rejects token with wrong number of parts', async () => {
      const result = await validateJWT('only.two', TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('3 parts')
    })

    it('rejects token with 4 parts', async () => {
      const result = await validateJWT('a.b.c.d', TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('3 parts')
    })

    it('rejects token with invalid header JSON', async () => {
      const invalidHeader = Buffer.from('not-json').toString('base64url')
      const payload = Buffer.from('{}').toString('base64url')
      const result = await validateJWT(`${invalidHeader}.${payload}.sig`, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('header')
    })

    it('rejects token with invalid payload JSON', async () => {
      const header = Buffer.from('{"alg":"HS256"}').toString('base64url')
      const invalidPayload = Buffer.from('not-json').toString('base64url')
      const result = await validateJWT(`${header}.${invalidPayload}.sig`, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('payload')
    })
  })

  describe('algorithm validation', () => {
    it('rejects alg "none" (unsigned token attack)', async () => {
      const token = makeUnsignedToken({ alg: 'none' }, { sub: 'attacker' })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('none')
    })

    it('rejects unsupported algorithm', async () => {
      const token = makeUnsignedToken({ alg: 'RS256' }, { sub: 'user' }, 'fakesig')
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('unsupported')
    })

    it('rejects non-string alg header', async () => {
      const token = makeUnsignedToken({ alg: 123 }, { sub: 'user' }, 'sig')
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('alg')
    })

    it('rejects missing signature with valid header', async () => {
      const token = makeUnsignedToken({ alg: 'HS256' }, { sub: 'user' })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('signature')
    })
  })

  describe('expiry validation', () => {
    it('rejects expired token', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      const token = await makeToken({ sub: 'user' }, { exp: pastExp })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('rejects non-numeric exp claim', async () => {
      const token = makeUnsignedToken(
        { alg: 'HS256' },
        { sub: 'user', exp: 'not-a-number' },
        'fakesig',
      )
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('exp')
    })
  })

  describe('secret validation', () => {
    it('rejects when no secret provided', async () => {
      const token = await makeToken({ sub: 'user' })
      const result = await validateJWT(token, undefined)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('secret')
    })

    it('rejects when secret is empty string', async () => {
      const token = await makeToken({ sub: 'user' })
      const result = await validateJWT(token, '')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('secret')
    })

    it('rejects when secret is whitespace-only', async () => {
      const token = await makeToken({ sub: 'user' })
      const result = await validateJWT(token, '   ')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('secret')
    })
  })

  describe('signature verification', () => {
    it('accepts valid token with correct secret', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = await makeToken({ sub: 'user-123' }, { exp: futureExp })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(true)
      expect(result.payload?.sub).toBe('user-123')
    })

    it('accepts valid token without exp claim', async () => {
      const token = await makeToken({ sub: 'user-456' })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(true)
      expect(result.payload?.sub).toBe('user-456')
    })

    it('rejects token signed with wrong secret', async () => {
      const token = await makeToken({ sub: 'user' }, { secret: 'wrong-secret-that-is-long-enough' })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(false)
    })

    it('preserves custom claims in payload', async () => {
      const token = await makeToken({ sub: 'admin', role: 'superuser', org: 'kubestellar' })
      const result = await validateJWT(token, TEST_SECRET)
      expect(result.valid).toBe(true)
      expect(result.payload?.role).toBe('superuser')
      expect(result.payload?.org).toBe('kubestellar')
    })
  })
})

describe('validateBearerToken', () => {
  it('rejects empty auth header', async () => {
    const result = await validateBearerToken('', TEST_SECRET)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Authorization')
  })

  it('rejects null auth header', async () => {
    const result = await validateBearerToken(null as unknown as string, TEST_SECRET)
    expect(result.valid).toBe(false)
  })

  it('rejects header without Bearer prefix', async () => {
    const result = await validateBearerToken('Basic dXNlcjpwYXNz', TEST_SECRET)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Bearer')
  })

  it('rejects Bearer header with empty token', async () => {
    const result = await validateBearerToken('Bearer ', TEST_SECRET)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('accepts valid Bearer token', async () => {
    const token = await makeToken({ sub: 'bearer-user' })
    const result = await validateBearerToken(`Bearer ${token}`, TEST_SECRET)
    expect(result.valid).toBe(true)
    expect(result.payload?.sub).toBe('bearer-user')
  })

  it('handles extra whitespace in Bearer header', async () => {
    const token = await makeToken({ sub: 'padded-user' })
    const result = await validateBearerToken(`  Bearer   ${token}  `, TEST_SECRET)
    expect(result.valid).toBe(true)
    expect(result.payload?.sub).toBe('padded-user')
  })
})
