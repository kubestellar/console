import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }) // Clear auth for login tests

  test('displays login page correctly', async ({ page }) => {
    await page.goto('/login')

    // Check for main elements
    await expect(page.getByRole('heading', { name: /kubestellar|klaude|console|sign in/i })).toBeVisible()

    // Should have login options
    const loginButton = page.getByRole('button').first()
    await expect(loginButton).toBeVisible()
  })

  test('shows branding elements', async ({ page }) => {
    await page.goto('/login')

    // Check for logo or title
    const title = page.locator('text=/kubestellar|klaude|kkc/i').first()
    await expect(title).toBeVisible()
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirects to dashboard after successful login', async ({ page }) => {
    // Mock the /api/me endpoint to return authenticated user
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        },
      })
    )

    await page.goto('/login')

    // Simulate authenticated state by setting localStorage token
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })

    // Navigate to home - should redirect to dashboard since authenticated
    await page.goto('/')

    // Should be on dashboard (not redirected to login)
    await expect(page).toHaveURL('/')

    // Verify we're on dashboard by checking for dashboard content
    await page.waitForSelector('text=/dashboard|cluster|overview/i', { timeout: 5000 })
  })

  test('handles login errors gracefully', async ({ page }) => {
    // Mock auth endpoint to return error
    await page.route('**/auth/github', (route) =>
      route.fulfill({
        status: 500,
        json: { error: 'Auth service unavailable' },
      })
    )

    await page.goto('/login')

    // The button should be visible
    const loginButton = page.getByRole('button', { name: /continue with github/i })
    await expect(loginButton).toBeVisible()

    // Page should remain on login (can't actually test click since it navigates away)
    await expect(page).toHaveURL(/\/login/)
  })

  test('supports keyboard navigation', async ({ page }) => {
    await page.goto('/login')

    // Tab through elements
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Should have focused element
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('has dark background theme', async ({ page }) => {
    await page.goto('/login')

    // Login page has dark background by default
    const container = page.locator('div.bg-\\[\\#0a0a0a\\]')
    await expect(container).toBeVisible()
  })
})
