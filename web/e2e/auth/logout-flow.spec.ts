// Logout flow E2E tests — frontend (mocked backend)
// Covers: sign-out button clears session, post-logout redirect, cross-tab logout.
// Real-backend JWT revocation is covered by auth/token-refresh.spec.ts.

import { test, expect, type Page } from '@playwright/test'
import { mockApiFallback, mockApiMe, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'

const LOGOUT_TIMEOUT_MS = 15_000

const STORAGE_TOKEN_KEY = 'token'
const STORAGE_HAS_SESSION_KEY = 'kc-has-session'
const STORAGE_AGENT_TOKEN_KEY = 'kc-agent-token'
const TEST_TOKEN = 'test-jwt-logout-token'

async function seedAuthState(page: Page, token: string = TEST_TOKEN): Promise<void> {
  await page.addInitScript((t) => {
    localStorage.setItem('token', t)
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  }, token)
}

async function mockLogoutEndpoint(page: Page): Promise<() => { captured: boolean; authHeader: string | null }> {
  let captured = false
  let authHeader: string | null = null

  await page.route('**/auth/logout', (route) => {
    captured = true
    authHeader = route.request().headers()['authorization'] ?? null
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  return () => ({ captured, authHeader })
}

test.describe('Logout flow (mocked backend)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(LOGOUT_TIMEOUT_MS)
    await mockApiFallback(page)
    await mockApiMe(page)
  })

  test('sign-out clears session keys from localStorage and navigates to /login', async ({ page }) => {
    const getLogoutState = await mockLogoutEndpoint(page)

    await seedAuthState(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Open the profile dropdown and click Sign Out
    await page.getByTestId('navbar-profile-btn').click()
    await expect(page.getByTestId('navbar-profile-dropdown')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })

    // Auth token and session hint must be cleared
    const token = await page.evaluate((k) => localStorage.getItem(k), STORAGE_TOKEN_KEY)
    const hasSession = await page.evaluate((k) => localStorage.getItem(k), STORAGE_HAS_SESSION_KEY)
    expect(token).toBeNull()
    expect(hasSession).toBeNull()

    // POST /auth/logout must have been called with the Bearer token
    const { captured, authHeader } = getLogoutState()
    expect(captured).toBe(true)
    expect(authHeader).toBe(`Bearer ${TEST_TOKEN}`)
  })

  test('sign-out does not leave agent token in localStorage', async ({ page }) => {
    await mockLogoutEndpoint(page)

    await seedAuthState(page)
    await page.addInitScript((k) => {
      localStorage.setItem(k, 'fake-agent-secret')
    }, STORAGE_AGENT_TOKEN_KEY)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    await page.getByTestId('navbar-profile-btn').click()
    await expect(page.getByTestId('navbar-profile-dropdown')).toBeVisible()
    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })

    const agentToken = await page.evaluate((k) => localStorage.getItem(k), STORAGE_AGENT_TOKEN_KEY)
    expect(agentToken).toBeNull()
  })

  test('after sign-out, navigating to / stays on /login', async ({ page }) => {
    await mockLogoutEndpoint(page)

    await seedAuthState(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    await page.getByTestId('navbar-profile-btn').click()
    await expect(page.getByTestId('navbar-profile-dropdown')).toBeVisible()
    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })

    // Navigate to protected root — must be redirected back to /login
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('cross-tab token removal redirects current tab to /login', async ({ page, context }) => {
    await mockLogoutEndpoint(page)
    await seedAuthState(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Simulate another tab removing the token. Because page2 is in the same
    // browser context, localStorage is shared and the removal fires a
    // StorageEvent on page — triggering the cross-tab logout handler in auth.tsx
    // which sets window.location.href = '/login'.
    const page2 = await context.newPage()
    await mockApiFallback(page2)
    await page2.goto('/login')
    await page2.waitForLoadState('domcontentloaded')
    await page2.evaluate((k) => localStorage.removeItem(k), STORAGE_TOKEN_KEY)
    await page2.close()

    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })
  })
})
