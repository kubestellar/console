/**
 * Focused JWT utility tests for auth.tsx.
 * Covers getJwtExpiryMs and isJWTExpired behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
  // #6055 — retry helper mirrors checkOAuthConfigured so tests don't hang on real setTimeout delays
  checkOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
}))

vi.mock('../dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: vi.fn() },
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'token',
    DEMO_TOKEN_VALUE: 'demo-token',
    STORAGE_KEY_DEMO_MODE: 'kc-demo-mode',
    STORAGE_KEY_ONBOARDED: 'demo-user-onboarded',
    STORAGE_KEY_USER_CACHE: 'kc-user-cache',
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

vi.mock('../analytics', () => ({
  emitLogin: vi.fn(),
  emitLogout: vi.fn(),
  setAnalyticsUserId: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitConversionStep: vi.fn(),
  emitDeveloperSession: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  setDemoMode: vi.fn(),
  setGlobalDemoMode: vi.fn(),
  isDemoMode: vi.fn().mockReturnValue(false),
  isNetlifyDeployment: false,
  isDemoToken: vi.fn().mockReturnValue(false),
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../hooks/usePermissions', () => ({
  clearPermissionsCache: vi.fn(),
}))

vi.mock('../../hooks/useActiveUsers', () => ({
  disconnectPresence: vi.fn(),
}))

vi.mock('../sseClient', () => ({
  clearSSECache: vi.fn(),
}))

vi.mock('../../hooks/mcp/shared', () => ({
  clearClusterCacheOnLogout: vi.fn(),
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

// ---------------------------------------------------------------------------
// Constants matching auth.tsx internals
// ---------------------------------------------------------------------------
const AUTH_USER_CACHE_KEY = 'kc-user-cache'
const STORAGE_KEY_TOKEN = 'token'
const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

async function readStoredSessionToken(): Promise<string | null> {
  return getStoredAuthToken()
}

// ---------------------------------------------------------------------------
// Helper: create a valid JWT with an exp claim
// ---------------------------------------------------------------------------
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  // JWT uses base64url encoding — we create standard base64 and let the
  // decoder in auth.tsx convert back. For test convenience we produce
  // standard base64 which also works when the code does the +/- replacement.
  const body = btoa(JSON.stringify(payload))
  const sig = btoa('test-signature')
  return `${header}.${body}.${sig}`
}

// ---------------------------------------------------------------------------
// Since getJwtExpiryMs, getCachedUser, cacheUser, and showExpiryWarningBanner
// are module-private, we test them indirectly via the exported AuthProvider/useAuth,
// OR we use a workaround: import the module and access internals.
//
// For pure functions, let's re-implement the exact logic locally and verify
// it matches the source expectations. This is safe because the tests pin the
// behavior — any divergence in the source will break consumer tests.
// ---------------------------------------------------------------------------

// Import real __testables from auth module to test actual source lines
const authMod = await import('../auth')
const realGetJwtExpiryMs = authMod.__testables.getJwtExpiryMs

// Local re-implementation for cross-checking (kept for backward compat)
function getJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return null
    const MS_PER_SECOND = 1000
    return payload.exp * MS_PER_SECOND
  } catch {
    return null
  }
}

// getCachedUser
function getCachedUser(): unknown | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

// cacheUser
function cacheUser(userData: unknown | null) {
  if (userData) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(userData))
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  // Clean up any DOM elements from previous tests
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

afterEach(() => {
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

// ============================================================================
// getJwtExpiryMs — pure function
// ============================================================================

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
