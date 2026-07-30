/**
 * Unit tests for web/src/lib/api/endpoints.ts (Refs #21526).
 *
 * These are exported constants used across the API/session layer. The tests
 * lock in the values and structural invariants so a stray edit that changes,
 * for example, AUTH_VERIFY_ENDPOINT causes a loud test failure instead of a
 * silent auth regression (#6061, #9797).
 */
import { describe, it, expect } from 'vitest'
import {
  AUTH_LOGOUT_ENDPOINT,
  AUTH_VERIFY_ENDPOINT,
  PUBLIC_API_PREFIXES,
  BACKEND_OUTAGE_EXEMPT_PREFIXES,
} from '../endpoints'

describe('AUTH_LOGOUT_ENDPOINT', () => {
  it('is the /auth/logout path', () => {
    expect(AUTH_LOGOUT_ENDPOINT).toBe('/auth/logout')
  })

  it('starts with a leading slash', () => {
    expect(AUTH_LOGOUT_ENDPOINT.startsWith('/')).toBe(true)
  })
})

describe('AUTH_VERIFY_ENDPOINT', () => {
  it('is the /api/me path', () => {
    expect(AUTH_VERIFY_ENDPOINT).toBe('/api/me')
  })

  it('starts with a leading slash', () => {
    expect(AUTH_VERIFY_ENDPOINT.startsWith('/')).toBe(true)
  })
})

describe('PUBLIC_API_PREFIXES', () => {
  it('exposes the expected browse/file/compliance prefixes', () => {
    expect(PUBLIC_API_PREFIXES).toEqual([
      '/api/missions/browse',
      '/api/missions/file',
      '/api/compliance/',
    ])
  })

  it('all entries start with /api/', () => {
    for (const p of PUBLIC_API_PREFIXES) {
      expect(p.startsWith('/api/')).toBe(true)
    }
  })

  it('has no duplicate entries', () => {
    expect(new Set(PUBLIC_API_PREFIXES).size).toBe(PUBLIC_API_PREFIXES.length)
  })

  it('matches known public URLs via startsWith checks', () => {
    const shouldMatch = [
      '/api/missions/browse',
      '/api/missions/browse?tag=foo',
      '/api/missions/file/123',
      '/api/compliance/',
      '/api/compliance/policies',
    ]
    for (const url of shouldMatch) {
      expect(PUBLIC_API_PREFIXES.some((p) => url.startsWith(p))).toBe(true)
    }
  })

  it('does not match non-public URLs', () => {
    const shouldNotMatch = [
      '/api/me',
      '/api/clusters',
      '/api/missions/private',
      '/api/compliance',
      '/auth/logout',
    ]
    for (const url of shouldNotMatch) {
      expect(PUBLIC_API_PREFIXES.some((p) => url.startsWith(p))).toBe(false)
    }
  })
})

describe('BACKEND_OUTAGE_EXEMPT_PREFIXES', () => {
  it('exposes the expected kagent/kagenti-provider prefixes', () => {
    expect(BACKEND_OUTAGE_EXEMPT_PREFIXES).toEqual([
      '/api/kagent/',
      '/api/kagenti-provider/',
    ])
  })

  it('all entries end with a trailing slash to guard against prefix leakage', () => {
    for (const p of BACKEND_OUTAGE_EXEMPT_PREFIXES) {
      expect(p.endsWith('/')).toBe(true)
    }
  })

  it('all entries start with /api/', () => {
    for (const p of BACKEND_OUTAGE_EXEMPT_PREFIXES) {
      expect(p.startsWith('/api/')).toBe(true)
    }
  })

  it('has no duplicate entries', () => {
    expect(new Set(BACKEND_OUTAGE_EXEMPT_PREFIXES).size).toBe(BACKEND_OUTAGE_EXEMPT_PREFIXES.length)
  })

  it('matches kagent URLs but not similarly named paths', () => {
    const shouldMatch = ['/api/kagent/', '/api/kagent/agents', '/api/kagenti-provider/foo']
    const shouldNotMatch = ['/api/kagenti/other', '/api/other/kagent', '/kagent/']
    for (const url of shouldMatch) {
      expect(BACKEND_OUTAGE_EXEMPT_PREFIXES.some((p) => url.startsWith(p))).toBe(true)
    }
    for (const url of shouldNotMatch) {
      expect(BACKEND_OUTAGE_EXEMPT_PREFIXES.some((p) => url.startsWith(p))).toBe(false)
    }
  })
})
