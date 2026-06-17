import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '../authToken'

export {
  act,
  afterEach,
  beforeEach,
  clearStoredAuthToken,
  describe,
  expect,
  getStoredAuthToken,
  it,
  renderHook,
  setStoredAuthToken,
  vi,
  waitFor,
}

vi.mock('../api', () => ({
  checkOAuthConfigured: vi.fn().mockResolvedValue({ backendUp: false, oauthConfigured: false }),
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

export const AUTH_USER_CACHE_KEY = 'kc-user-cache'
export const STORAGE_KEY_TOKEN = 'token'
export const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

export async function readStoredSessionToken(): Promise<string | null> {
  return getStoredAuthToken()
}

export function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = btoa('test-signature')
  return `${header}.${body}.${sig}`
}

export const authMod = await import('../auth')
export const realGetJwtExpiryMs = authMod.__testables.getJwtExpiryMs

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

beforeEach(() => {
  localStorage.clear()
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

afterEach(() => {
  document.getElementById('session-expiry-warning')?.remove()
  document.getElementById('session-banner-animation')?.remove()
})

const apiMod = await import('../api')
const dashMod = await import('../dashboards/dashboardSync')
const analyticsMod = await import('../analytics')
const demoMod = await import('../demoMode')

export const mockCheckOAuth = apiMod.checkOAuthConfigured as unknown as ReturnType<typeof vi.fn>
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
