import { type Page } from '@playwright/test'
import { mockApiFallback } from './demo-api-mocks'

// ---------------------------------------------------------------------------
// Shared auth setup helpers (#9233)
//
// These consolidate the copy-pasted setupAuth / setupAuthLocalStorage
// patterns that were duplicated across 10+ spec files. Each spec was defining
// a local copy with subtly different user shapes / localStorage keys, so the
// helpers below accept options that preserve the exact behavior of the
// original local helpers.
//
// There are two distinct flavors of "auth setup" in the codebase:
//   1. API-route mock: stub `/api/me` with a mock user (setupAuth)
//   2. localStorage init: seed token + demo flags via addInitScript
//      (setupAuthLocalStorage)
//
// Both are provided as separate helpers so callers pick the flavor that
// matches their test's expectations.
// ---------------------------------------------------------------------------

/** Default user shape returned from a mocked `/api/me` call */
export interface MockApiUser {
  id: string
  github_id: string
  github_login: string
  email: string
  onboarded: boolean
  role?: string
}

/** Default mock user for shared `setupAuth` (matches the legacy local copies) */
export const DEFAULT_AUTH_USER: MockApiUser = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  onboarded: true,
}

/**
 * Mock the `/api/me` endpoint so the AuthProvider sees a valid user without
 * contacting a real backend. Accepts an optional user override for specs
 * that need a specific github_login / role.
 *
 * This is the API-route-mock flavor of auth setup. If your test wants to
 * seed `localStorage` tokens + demo-mode flags, use `setupAuthLocalStorage`
 * instead (or both, depending on what the app under test expects).
 */
export async function setupAuth(page: Page, user?: Partial<MockApiUser>): Promise<void> {
  await mockApiFallback(page)
  const u: MockApiUser = { ...DEFAULT_AUTH_USER, ...(user || {}) }
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname !== '/api/me') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(u),
    })
  })
}

/** Options for seeding auth state via localStorage */
export interface AuthLocalStorageOptions {
  /** Token value (default: 'test-jwt-token') */
  token?: string
  /** Whether to seed `kc-demo-mode` and, if so, its value (default: not set) */
  demoMode?: boolean
  /** Seed `demo-user-onboarded=true` (default: false) */
  demoUserOnboarded?: boolean
  /** Seed `kc-onboarding-complete=true` (default: false) */
  onboardingComplete?: boolean
  /** Seed `kc-tour-complete=true` (default: false) */
  tourComplete?: boolean
  /** Seed `kc-setup-complete=true` (default: false) */
  setupComplete?: boolean
}

/**
 * Seed `localStorage` with an auth token + onboarding/demo flags BEFORE any
 * page script runs. This is the localStorage-init flavor of auth setup
 * (see also `setupAuth` for the API-route-mock flavor).
 *
 * Uses `page.addInitScript` so the values are present on first script
 * evaluation — avoiding a flash of the /login route on webkit/Safari where
 * the auth redirect can fire synchronously (#9096).
 */
export async function setupAuthLocalStorage(
  page: Page,
  options?: AuthLocalStorageOptions
): Promise<void> {
  const opts = {
    token: options?.token ?? 'test-jwt-token',
    demoMode: options?.demoMode,
    demoUserOnboarded: options?.demoUserOnboarded ?? false,
    onboardingComplete: options?.onboardingComplete ?? false,
    tourComplete: options?.tourComplete ?? false,
    setupComplete: options?.setupComplete ?? false,
  }
  await page.addInitScript((o: typeof opts) => {
    localStorage.setItem('token', o.token)
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    if (o.demoMode !== undefined) {
      localStorage.setItem('kc-demo-mode', String(o.demoMode))
    }
    if (o.demoUserOnboarded) {
      localStorage.setItem('demo-user-onboarded', 'true')
    }
    if (o.onboardingComplete) {
      localStorage.setItem('kc-onboarding-complete', 'true')
    }
    if (o.tourComplete) {
      localStorage.setItem('kubestellar-console-tour-completed', 'true')
    }
    if (o.setupComplete) {
      localStorage.setItem('kc-setup-complete', 'true')
    }
  }, opts)
}
