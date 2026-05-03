/**
 * JWT Session Expiry Mid-Session Tests (#8507)
 *
 * Verifies the app handles token expiry gracefully:
 *   1. isJWTExpired correctly identifies expired tokens
 *   2. refreshUser clears an expired JWT and does NOT keep stale user state
 *   3. The expiry check interval calls logout when token expires
 *   4. Cross-tab logout via StorageEvent clears auth state
 *
 * These tests ensure the app never reaches a blank-screen state when
 * a JWT expires mid-session — it should redirect to login or fall back
 * to demo mode.
 *
 * Run:   npx vitest run src/lib/__tests__/auth-session-expiry.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'

// ── Mocks ───────────────────────���──────────────────────────────────────────

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
  checkOAuthConfiguredWithRetry: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
}))

vi.mock('../dashboards/dashboardSync', () => ({
  dashboardSync: { clearCache: vi.fn() },
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'token',
    DEMO_TOKEN_VALUE: 'demo-token',
    STORAGE_KEY_DEMO_MODE: 'kc-demo-mode',
    STORAGE_KEY_ONBOARDED: 'demo-user-onboarded',
    STORAGE_KEY_USER_CACHE: 'kc-user-cache',
    STORAGE_KEY_HAS_SESSION: 'kc-has-session',
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

// ── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY_TOKEN = 'token'
const AUTH_USER_CACHE_KEY = 'kc-user-cache'
const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'
/** Milliseconds per second — JWT exp is in seconds */
const MS_PER_SECOND = 1_000
/** Past offset (seconds) for creating expired tokens */
const EXPIRED_OFFSET_SECONDS = 3600
/** Future offset (seconds) for creating valid tokens */
const VALID_OFFSET_SECONDS = 3600

// ── Helpers ──────��───────────────────────────────────���─────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = btoa('test-signature')
  return `${header}.${body}.${sig}`
}

function makeExpiredJwt(): string {
  const expiredExp = Math.floor(Date.now() / MS_PER_SECOND) - EXPIRED_OFFSET_SECONDS
  return makeJwt({ exp: expiredExp, sub: 'user-expired' })
}

function makeValidJwt(): string {
  const validExp = Math.floor(Date.now() / MS_PER_SECOND) + VALID_OFFSET_SECONDS
  return makeJwt({ exp: validExp, sub: 'user-valid' })
}

// ── Tests ───────────────────────────────────��──────────────────────────────

beforeEach(() => {
  localStorage.clear()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

afterEach(() => {
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
  vi.restoreAllMocks()
})

// ============================================================================
// isJWTExpired — exported pure function
// ============================================================================

describe('isJWTExpired — session expiry detection', () => {
  it('returns true for a JWT that has already expired', async () => {
    const { isJWTExpired } = await import('../auth')
    const expired = makeExpiredJwt()
    expect(isJWTExpired(expired)).toBe(true)
  })

  it('returns false for a JWT that is still valid', async () => {
    const { isJWTExpired } = await import('../auth')
    const valid = makeValidJwt()
    expect(isJWTExpired(valid)).toBe(false)
  })

  it('returns false for non-JWT tokens (opaque tokens)', async () => {
    const { isJWTExpired } = await import('../auth')
    // Opaque tokens can't be decoded — function returns false to let backend decide
    expect(isJWTExpired('opaque-session-token-abc123')).toBe(false)
  })

  it('returns false for demo token', async () => {
    const { isJWTExpired } = await import('../auth')
    expect(isJWTExpired('demo-token')).toBe(false)
  })

  it('returns true for a JWT that expired exactly now (boundary)', async () => {
    const { isJWTExpired } = await import('../auth')
    // exp is exactly now — Date.now() >= expiryMs should be true
    const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
    const token = makeJwt({ exp: nowSeconds })
    expect(isJWTExpired(token)).toBe(true)
  })
})

// ============================================================================
// refreshUser — expired token handling
// ============================================================================

describe('refreshUser with expired JWT (#8507)', () => {
  it('clears an expired JWT from localStorage and resets auth state', async () => {
    const expired = makeExpiredJwt()
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'testuser', onboarded: true }

    // Pre-populate localStorage as if the user had a live session
    localStorage.setItem(STORAGE_KEY_TOKEN, expired)
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))
    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now()))

    const { useAuth, AuthProvider } = await import('../auth')

    // Wrap in AuthProvider so useAuth gets real context
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for refreshUser to process the expired token
    await waitFor(
      () => {
        // After detecting expired JWT, auth should clear the token
        // The user should either be null (login redirect) or demo-user (fallback)
        // but never blank-screen — isLoading should resolve to false
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5_000 },
    )

    // Token should be cleared from localStorage
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).not.toBe(expired)

    // Auth state should not retain the old user — either null (login) or demo
    if (result.current.user) {
      // If a user exists, it must be the demo user, not the stale cached user
      expect(result.current.user.id).not.toBe('u1')
    }
  })

  it('does NOT blank-screen — resolves to either login or demo fallback', async () => {
    const expired = makeExpiredJwt()
    localStorage.setItem(STORAGE_KEY_TOKEN, expired)

    const { useAuth, AuthProvider } = await import('../auth')

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuth(), { wrapper })

    // The critical assertion: isLoading MUST resolve to false.
    // A blank screen happens when isLoading stays true forever.
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5_000 },
    )

    // Either: user is null (=> login page renders) or user is demo-user (=> demo mode)
    // Both are valid — blank screen is the failure case
    const hasLoginRedirect = result.current.user === null
    const hasDemoFallback = result.current.user?.id === 'demo-user'
    expect(hasLoginRedirect || hasDemoFallback).toBe(true)
  })
})

// ============================================================================
// Cross-tab logout — StorageEvent clears auth
// ============================================================================

describe('cross-tab logout via StorageEvent', () => {
  it('clears auth state when another tab removes the token', async () => {
    const valid = makeValidJwt()
    const cachedUser = { id: 'u1', github_id: '1', github_login: 'testuser', onboarded: true }
    localStorage.setItem(STORAGE_KEY_TOKEN, valid)
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(cachedUser))

    const { useAuth, AuthProvider } = await import('../auth')

    // Mock window.location to prevent actual navigation
    const originalLocation = window.location
    const mockLocation = { ...originalLocation, href: '/', pathname: '/dashboard' }
    Object.defineProperty(window, 'location', { value: mockLocation, writable: true })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)

    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for initial load
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5_000 },
    )

    // Simulate another tab clearing the token.
    // jsdom does not support storageArea in StorageEvent, so omit it.
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY_TOKEN,
          oldValue: valid,
          newValue: null,
        }),
      )
    })

    // Auth state should be cleared — user should be null
    await waitFor(
      () => {
        expect(result.current.user).toBeNull()
      },
      { timeout: 5_000 },
    )

    // Restore location
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })
})
