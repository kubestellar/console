import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

/**
 * Setup test that handles authentication
 * Runs once before all tests and saves auth state
 */
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login')

  // Wait for page to load
  await page.waitForLoadState('domcontentloaded')

  // In dev mode, click the dev login button (bypasses GitHub OAuth)
  const devLoginButton = page.getByRole('button', { name: /dev.*login|continue.*demo/i })
  const hasDevLogin = await devLoginButton.isVisible().catch(() => false)

  if (hasDevLogin) {
    await devLoginButton.click()
  } else {
    // Fall back to regular login if available
    const loginButton = page.getByRole('button', { name: /sign in|login|continue/i }).first()
    await loginButton.click()
  }

  // Wait for authentication to complete
  await page.waitForURL(/\/$|\/onboarding/, { timeout: 15000 })

  // Handle onboarding if needed
  const currentUrl = page.url()
  if (currentUrl.includes('/onboarding')) {
    // Complete onboarding steps
    const skipButton = page.getByRole('button', { name: /skip|continue|finish/i }).first()
    const hasSkip = await skipButton.isVisible().catch(() => false)

    if (hasSkip) {
      await skipButton.click()
      await page.waitForURL('/', { timeout: 10000 })
    }
  }

  // Verify we're authenticated and on the dashboard
  await expect(page).toHaveURL('/')

  // Save authentication state
  await page.context().storageState({ path: authFile })
})
