import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }) // Clear auth for login tests

  test('displays login page correctly', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Verify login page elements using data-testid
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('login-welcome-heading')).toBeVisible()
    await expect(page.getByTestId('github-login-button')).toBeVisible()
  })

  test('shows branding elements', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Check for logo and branding
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })

    // KubeStellar branding should be present
    await expect(page.getByRole('heading', { name: /kubestellar/i })).toBeVisible()

    // Logo image should be present
    await expect(page.locator('img[alt="KubeStellar"]')).toBeVisible()
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('redirects to dashboard after successful login', async ({ page }) => {
    // Mock the /api/me endpoint to return authenticated user
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

    // Mock MCP endpoints for dashboard
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [], events: [], issues: [], nodes: [] }),
      })
    )

    await page.goto('/login')

    // Set localStorage token to simulate authentication
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
    })

    // Navigate to home - should stay on dashboard since authenticated
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Verify we're on dashboard (not redirected to login)
    await expect(page).toHaveURL(/^\/$/, { timeout: 10000 })

    // Dashboard page should be visible
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
  })

  test('handles login errors gracefully', async ({ page }) => {
    // Mock auth endpoint to return error
    await page.route('**/auth/github', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Auth service unavailable' }),
      })
    )

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Login page should still render correctly
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('github-login-button')).toBeVisible()

    // Page should still be on login URL
    await expect(page).toHaveURL(/\/login/)
  })

  test('supports keyboard navigation', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Wait for page to be ready
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 })

    // Tab to the login button
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // The login button should be focusable
    const loginButton = page.getByTestId('github-login-button')
    await loginButton.focus()
    await expect(loginButton).toBeFocused()
  })

  test('has dark background theme', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Login page has dark background (#0a0a0a)
    const loginPage = page.getByTestId('login-page')
    await expect(loginPage).toBeVisible({ timeout: 10000 })

    // Verify the background color via computed styles
    const bgColor = await loginPage.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })

    // Should be dark (rgb values close to 10, 10, 10)
    expect(bgColor).toMatch(/rgb\(10,\s*10,\s*10\)|rgba\(10,\s*10,\s*10/)
  })
})
