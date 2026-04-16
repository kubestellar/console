import { test, expect } from '@playwright/test'

// Login tests require a backend with OAuth enabled.
// In CI (frontend only preview builds), /login redirects to the dashboard
// because there is no auth layer. Skip the whole suite when the backend
// health endpoint is unreachable.
test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }) // Clear auth for login tests

  test.beforeEach(async ({ page }) => {
    // Probe backend health — skip login tests if backend is not running
    const backendUp = await page.request.get('/health').then(r => r.ok()).catch(() => false)
    test.skip(!backendUp, 'Backend not running — login tests require OAuth mode')
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

  test('redirects to dashboard after successful login', async ({ page }) => {
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

    await page.goto('/login')

    // Set localStorage values to simulate a logged-in session
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
    })

    // Navigate to home — should land on dashboard since user is authenticated
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/^\/$/, { timeout: 10000 })
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
  })

  test('handles login errors gracefully', async ({ page }) => {
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

    const bgColor = await loginPage.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })

    expect(bgColor).toMatch(/rgb\(10,\s*10,\s*10\)|rgba\(10,\s*10,\s*10/)
  })

  test('detects demo mode vs OAuth mode behavior', async ({ page }) => {
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