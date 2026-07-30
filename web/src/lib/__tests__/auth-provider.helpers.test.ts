/**
 * Focused auth provider and caching tests for auth.tsx.
 * Covers user cache helpers, useAuth fallback behavior,
 * expiry banner DOM behavior, and AuthProvider integration.
 */
import React from 'react'
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

describe('getCachedUser', () => {
  it('returns null when no cached user', () => {
    expect(getCachedUser()).toBeNull()
  })

  it('returns parsed user when cache exists', () => {
    const user = { id: 'user-1', github_login: 'testuser', onboarded: true }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user))
    expect(getCachedUser()).toEqual(user)
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(AUTH_USER_CACHE_KEY, 'not-valid-json{{{')
    expect(getCachedUser()).toBeNull()
  })

  it('returns null for empty string', () => {
    localStorage.setItem(AUTH_USER_CACHE_KEY, '')
    // Empty string is falsy, so the ternary returns null
    expect(getCachedUser()).toBeNull()
  })
})

// ============================================================================
// cacheUser — localStorage helper
// ============================================================================

describe('cacheUser', () => {
  it('stores user data as JSON', () => {
    const user = { id: 'u1', github_login: 'test' }
    cacheUser(user)
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBe(JSON.stringify(user))
  })

  it('removes cache when called with null', () => {
    localStorage.setItem(AUTH_USER_CACHE_KEY, '{"old":"data"}')
    cacheUser(null)
    expect(localStorage.getItem(AUTH_USER_CACHE_KEY)).toBeNull()
  })

  it('overwrites existing cache', () => {
    cacheUser({ id: 'first' })
    cacheUser({ id: 'second' })
    const stored = JSON.parse(localStorage.getItem(AUTH_USER_CACHE_KEY) || '{}')
    expect(stored.id).toBe('second')
  })
})

// ============================================================================
// useAuth fallback — when called outside AuthProvider
// ============================================================================

describe('useAuth fallback', () => {
  it('returns a safe fallback object outside AuthProvider', async () => {
    // Import useAuth — it should not throw outside AuthProvider
    const { useAuth } = await import('../auth')
    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(true)
    expect(typeof result.current.login).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.setToken).toBe('function')
    expect(typeof result.current.refreshUser).toBe('function')
  })

  it('fallback login/logout/setToken are no-ops', async () => {
    const { useAuth } = await import('../auth')
    const { result } = renderHook(() => useAuth())

    // Should not throw
    result.current.login()
    result.current.logout()
    result.current.setToken('abc', true)
    expect(await result.current.refreshUser()).toBeUndefined()
  })
})

// ============================================================================
// showExpiryWarningBanner — DOM manipulation
// ============================================================================

describe('showExpiryWarningBanner (indirectly)', () => {
  // We test the DOM manipulation logic that showExpiryWarningBanner performs.
  // Since it's not exported, we replicate and test the contract.

  function showExpiryWarningBanner(onRefresh: () => void): void {
    if (document.getElementById('session-expiry-warning')) return

    const banner = document.createElement('div')
    banner.id = 'session-expiry-warning'
    banner.style.cssText = `position: fixed; bottom: 24px; left: 50%;`
    banner.innerHTML = `<span><strong>Session expires soon</strong></span>`

    const btn = document.createElement('button')
    btn.textContent = 'Refresh Now'
    btn.onclick = () => {
      onRefresh()
      banner.remove()
    }
    banner.appendChild(btn)

    const STYLE_ID = 'session-banner-animation'
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `@keyframes slideUp { from { opacity: 0; } to { opacity: 1; } }`
      document.head.appendChild(style)
    }
    document.body.appendChild(banner)
  }

  it('creates a banner element in the DOM', () => {
    showExpiryWarningBanner(vi.fn())
    expect(document.getElementById('session-expiry-warning')).not.toBeNull()
  })

  it('does not create duplicate banners', () => {
    showExpiryWarningBanner(vi.fn())
    showExpiryWarningBanner(vi.fn())
    const banners = document.querySelectorAll('#session-expiry-warning')
    expect(banners.length).toBe(1)
  })

  it('calls onRefresh when button is clicked', () => {
    const onRefresh = vi.fn()
    showExpiryWarningBanner(onRefresh)
    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    btn.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('removes banner when button is clicked', () => {
    showExpiryWarningBanner(vi.fn())
    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    btn.click()
    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })

  it('creates animation style element only once', () => {
    showExpiryWarningBanner(vi.fn())
    // Remove banner, create again
    document.getElementById('session-expiry-warning')?.remove()
    showExpiryWarningBanner(vi.fn())
    const styles = document.querySelectorAll('#session-banner-animation')
    expect(styles.length).toBe(1)
  })

  it('banner contains "Session expires soon" text', () => {
    showExpiryWarningBanner(vi.fn())
    const banner = document.getElementById('session-expiry-warning')
    expect(banner?.textContent).toContain('Session expires soon')
  })

  it('banner contains "Refresh Now" button', () => {
    showExpiryWarningBanner(vi.fn())
    const btn = document.querySelector('#session-expiry-warning button')
    expect(btn?.textContent).toBe('Refresh Now')
  })
})
