// Logout flow E2E tests — frontend (mocked backend)
// Covers: sign-out button clears session, post-logout redirect, cross-tab logout.
// Real-backend JWT revocation is covered by auth/token-refresh.spec.ts.

import { test, expect, type Page } from '@playwright/test'
import { mockApiFallback, mockLocalAgentUnavailable, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'

const LOGOUT_TIMEOUT_MS = 30_000

const STORAGE_TOKEN_KEY = 'token'
const STORAGE_HAS_SESSION_KEY = 'kc-has-session'
const STORAGE_AGENT_TOKEN_KEY = 'kc-agent-token'
const STORAGE_AUTH_SYNC_KEY = 'kc-auth-token-sync'
const TEST_TOKEN = 'test-jwt-logout-token'

async function mockSignedInUser(page: Page): Promise<void> {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
        role: 'admin',
      }),
    })
  )
}

async function seedAuthState(page: Page, token: string = TEST_TOKEN): Promise<void> {
  await page.addInitScript((t) => {
    localStorage.setItem('token', t)
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-hints-suppressed', 'true')
    sessionStorage.setItem('kc-update-toast-seen', '1')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  }, token)
}

async function mockOAuthConfiguredHealth(page: Page): Promise<void> {
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })
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

async function confirmSignOut(page: Page): Promise<void> {
  const signOutItem = page.getByRole('menuitem', { name: /sign out/i })
  await expect(signOutItem).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  await signOutItem.dispatchEvent('click')

  const confirmButton = page.getByRole('button', { name: /^log out$/i })
  await expect(confirmButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  await confirmButton.dispatchEvent('click')
}

async function openProfileMenu(page: Page): Promise<void> {
  const profileButton = page.getByTestId('navbar-profile-btn')
  await expect(profileButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  await profileButton.dispatchEvent('click')
  await expect(page.getByTestId('navbar-profile-dropdown')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}

async function expectSignedOut(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STORAGE_TOKEN_KEY), {
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  }).toBeNull()
  await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), STORAGE_TOKEN_KEY), {
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  }).toBeNull()
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STORAGE_HAS_SESSION_KEY), {
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  }).toBeNull()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kc-demo-mode')), {
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  }).toBe('false')
}

test.describe('Logout flow (mocked backend)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(LOGOUT_TIMEOUT_MS)
    await mockApiFallback(page)
    await mockOAuthConfiguredHealth(page)
    await mockLocalAgentUnavailable(page)
    await mockSignedInUser(page)
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
    await openProfileMenu(page)
    await confirmSignOut(page)

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

    await openProfileMenu(page)
    await confirmSignOut(page)

    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })

    const agentToken = await page.evaluate((k) => localStorage.getItem(k), STORAGE_AGENT_TOKEN_KEY)
    expect(agentToken).toBeNull()
  })

  test('after sign-out, navigating to / stays on /login', async ({ page, context }) => {
    await mockLogoutEndpoint(page)

    await seedAuthState(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    await openProfileMenu(page)
    await confirmSignOut(page)
    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })
    await expectSignedOut(page)

    // Verify a fresh page with the signed-out shared storage cannot reopen the
    // protected root. The original page has a seedAuthState addInitScript that
    // intentionally runs on every full navigation, so reusing it would re-seed
    // the test token and invalidate this assertion.
    const signedOutPage = await context.newPage()
    await mockApiFallback(signedOutPage)
    await mockOAuthConfiguredHealth(signedOutPage)
    await mockLocalAgentUnavailable(signedOutPage)
    await signedOutPage.goto('/')
    await expect(signedOutPage).toHaveURL(/\/login/, { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await signedOutPage.close()
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
    await page2.evaluate((k) => {
      localStorage.setItem(k, JSON.stringify({ state: 'cleared', ts: Date.now() }))
    }, STORAGE_AUTH_SYNC_KEY)
    await page2.close()

    await expect(page).toHaveURL(/\/login/, { timeout: LOGOUT_TIMEOUT_MS })
  })
})
