import React from 'react'
import { vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getStoredAuthToken } from '../authToken'

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
export const AUTH_USER_CACHE_KEY = 'kc-user-cache'
export const STORAGE_KEY_TOKEN = 'token'
export const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

export async function readStoredSessionToken(): Promise<string | null> {
  return getStoredAuthToken()
}

// ---------------------------------------------------------------------------
// Helper: create a valid JWT with an exp claim
// ---------------------------------------------------------------------------
export function makeJwt(payload: Record<string, unknown>): string {
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
export const authMod = await import('../auth')
export const realGetJwtExpiryMs = authMod.__testables.getJwtExpiryMs

// Local re-implementation for cross-checking (kept for backward compat)
export function getJwtExpiryMs(token: string): number | null {
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

export function getCachedUser(): unknown | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

export function cacheUser(userData: unknown | null) {
  if (userData) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(userData))
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
  }
}

export function showExpiryWarningBanner(onRefresh: () => void): void {
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

// We need access to the mocked modules
const apiMod = await import('../api')
const dashMod = await import('../dashboards/dashboardSync')
const analyticsMod = await import('../analytics')
const demoMod = await import('../demoMode')

// Cast to vi.Mock for type-safe mock API
export const mockCheckOAuth = apiMod.checkOAuthConfigured as unknown as ReturnType<typeof vi.fn>
// #6055 — retry helper is the one auth.tsx actually calls on the no-token path
export const mockCheckOAuthWithRetry = apiMod.checkOAuthConfiguredWithRetry as unknown as ReturnType<typeof vi.fn>
export const mockClearCache = dashMod.dashboardSync.clearCache as unknown as ReturnType<typeof vi.fn>
export const mockEmitLogin = analyticsMod.emitLogin as unknown as ReturnType<typeof vi.fn>
export const mockEmitLogout = analyticsMod.emitLogout as unknown as ReturnType<typeof vi.fn>
export const mockEmitConversionStep = analyticsMod.emitConversionStep as unknown as ReturnType<typeof vi.fn>
export const mockSetAnalyticsUserId = analyticsMod.setAnalyticsUserId as unknown as ReturnType<typeof vi.fn>
export const mockSetAnalyticsUserProperties = analyticsMod.setAnalyticsUserProperties as unknown as ReturnType<typeof vi.fn>
export const mockEmitDeveloperSession = analyticsMod.emitDeveloperSession as unknown as ReturnType<typeof vi.fn>
export const mockSetGlobalDemoMode = demoMod.setDemoMode as unknown as ReturnType<typeof vi.fn>

export async function renderWithAuthProvider() {
  const { AuthProvider, useAuth } = await import('../auth')

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children)

  return renderHook(() => useAuth(), { wrapper })
}
