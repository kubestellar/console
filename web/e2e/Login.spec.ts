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
    await page.goto('/login')

    // Look for dev login or demo mode button
    const devLoginButton = page
      .getByRole('button', { name: /dev.*login|continue.*demo|sign in/i })
      .first()
    await devLoginButton.click()

    // Should navigate to dashboard or onboarding
    await page.waitForURL(/\/$|\/onboarding/, { timeout: 15000 })

    // Eventually should be on dashboard
    const url = page.url()
    expect(url.includes('/') || url.includes('/onboarding')).toBeTruthy()
  })

  test('handles login errors gracefully', async ({ page }) => {
    await page.goto('/login')

    // Mock a failed login
    await page.route('**/api/auth/**', (route) =>
      route.fulfill({
        status: 401,
        json: { error: 'Invalid credentials' },
      })
    )

    // Attempt login
    const loginButton = page.getByRole('button').first()
    await loginButton.click()

    // Should show error or stay on login page
    await page.waitForTimeout(1000)
    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')
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

  test('respects theme preference', async ({ page }) => {
    await page.goto('/login')

    // Check if dark/light theme is applied
    const html = page.locator('html')
    const theme = await html.getAttribute('class')

    // Should have a theme class
    expect(theme).toBeTruthy()
  })
})
