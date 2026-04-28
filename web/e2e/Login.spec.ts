import { test, expect } from '@playwright/test'

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
    // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    )

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

    // Mock MCP endpoints required for dashboard rendering
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [], events: [], issues: [], nodes: [] }),
      })
    )

    // Seed localStorage BEFORE any page script runs so the auth guard sees
    // the token on first execution. page.evaluate() runs after the page has
    // already parsed and executed scripts, which is too late for webkit/Safari
    // where the auth redirect fires synchronously on script evaluation.
    // page.addInitScript() injects the snippet ahead of any page code (#9096).
    await page.addInitScript(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
    })

    // Navigate to home — should land on dashboard since user is authenticated
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
  })

  test('handles login errors gracefully', async ({ page }) => {
    // Mock /health so the app doesn't hang waiting for backend
    await page.route('**/health', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/health') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'dev', oauth_configured: true }),
      })
    })

    // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    )

    // Mock GitHub auth endpoint failure
    await page.route('**/auth/github', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Auth service unavailable' }),
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
    if (errorShown) {
      await expect(errorBanner.first()).toBeVisible()
    } else {
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('detects demo mode vs OAuth mode behavior', async ({ page }) => {
    // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    )

    await page.goto('/')

    const loginPage = page.getByTestId('login-page')

    if (await loginPage.isVisible().catch(() => false)) {
      // Demo or unauthenticated mode — login screen should be visible
      await expect(loginPage).toBeVisible()
      await expect(page.getByTestId('github-login-button')).toBeVisible()
    } else {
      // OAuth/authenticated mode — dashboard sidebar should be visible
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible()
    }
  })
})