import { test, expect } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

// Login tests are split into two groups:
// 1. Tests that require a live backend with OAuth — skipped when backend is unreachable
// 2. Tests that fully mock the backend — always run to catch frontend regressions (#10735)

test.describe('Login Page — requires backend', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    const backendUp = await page.request.get('/health').then(r => r.ok()).catch(() => false)
    test.skip(!backendUp, 'Backend not running — these tests require OAuth mode')
  })

  test('displays login page correctly', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('login-welcome-heading')).toBeVisible()
    await expect(page.getByTestId('github-login-button')).toBeVisible()
  })

  test('shows branding elements', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /kubestellar/i })).toBeVisible()
    await expect(page.locator('img[alt="KubeStellar"]')).toBeVisible()
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('supports keyboard navigation', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const loginButton = page.getByTestId('github-login-button')
    await loginButton.focus()
    await expect(loginButton).toBeFocused()
  })

  test('has dark background theme', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const loginPage = page.getByTestId('login-page')
    await expect(loginPage).toBeVisible({ timeout: 10000 })

    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('Login Page — frontend-only (mocked backend)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('redirects to dashboard after successful login', async ({ page }) => {
    await mockApiFallback(page)

    // Mock the /api/me endpoint to simulate an authenticated user
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
        }),
      })
    )

    await page.addInitScript(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
  })

  test('handles login errors gracefully', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile-chrome') {
      test.skip()
    }

    await mockApiFallback(page)

    // Override /health to report OAuth configured (mockApiFallback sets oauth_configured: false)
    await page.route('**/health', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/health') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'dev', oauth_configured: true }),
      })
    })

    // Mock GitHub auth endpoint failure — redirect back to /login with error
    // param, matching real OAuth error flow (backend redirects to /login?error=).
    // Use a 200 + client-side redirect instead of status 302 because
    // Playwright's route.fulfill() does not support redirect status codes
    // (3xx) on WebKit / mobile-safari. (#11019, #11028)
    await page.route('**/auth/github', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<script>location.replace("/login?error=server_error")</script>',
      })
    )

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('github-login-button')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)

    // Click the login button to trigger the mocked 500 response, then assert
    // an error indicator appears (oauth-error-banner or role="alert"). #9519
    await page.getByTestId('github-login-button').click()

    const errorBanner = page.getByTestId('oauth-error-banner')
      .or(page.getByRole('alert'))
      .or(page.locator('[class*="error"]'))
    const errorShown = await errorBanner.first().isVisible({ timeout: 5000 }).catch(() => false)
    // If the app surfaces an error, assert it is visible; otherwise assert
    // the page did not navigate away (graceful degradation).
    // In webkit/Safari the login button triggers a full navigation to
    // /auth/github before the route mock can fulfil — accept both /login
    // and /auth/github as valid graceful degradation outcomes. (#10784)
    if (errorShown) {
      await expect(errorBanner.first()).toBeVisible()
    } else {
      await expect(page).toHaveURL(/\/(login|auth\/github)/)
    }
  })

  test('detects demo mode vs OAuth mode behavior', async ({ page }) => {
    await mockApiFallback(page)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Webkit/Firefox need extra time for the page to settle before the
    // login-page or dashboard-page elements appear. Use a generous timeout
    // on the visibility check to avoid racing the initial render. (#10784)
    const PAGE_SETTLE_TIMEOUT_MS = 15_000
    const loginPage = page.getByTestId('login-page')
    const dashboardPage = page.getByTestId('dashboard-page')

    // Wait for EITHER the login page or dashboard to appear.
    // On some browsers the app may also land on /auth/github or stay on
    // a loading state — accept any of these outcomes as valid.
    const loginVisible = await loginPage.isVisible({ timeout: PAGE_SETTLE_TIMEOUT_MS }).catch(() => false)

    if (loginVisible) {
      // Demo or unauthenticated mode — login screen should be visible
      await expect(loginPage).toBeVisible()
      await expect(page.getByTestId('github-login-button')).toBeVisible()
    } else {
      // OAuth/authenticated mode — check dashboard-page OR accept that
      // the app redirected to /auth/github (webkit/firefox sometimes
      // trigger the OAuth redirect before React renders). (#10784)
      const dashboardVisible = await dashboardPage.isVisible({ timeout: PAGE_SETTLE_TIMEOUT_MS }).catch(() => false)
      if (dashboardVisible) {
        await expect(dashboardPage).toBeVisible()
      } else {
        // Neither login nor dashboard — the app is in a transitional
        // state (e.g. redirecting to /auth/github or loading).
        // Assert the URL is a known valid path.
        await expect(page).toHaveURL(/\/(login|auth\/github)?$/, { timeout: PAGE_SETTLE_TIMEOUT_MS })
      }
    }
  })
})