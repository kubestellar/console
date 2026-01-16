import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

/**
 * Setup test that handles authentication
 * Runs once before all tests and saves auth state
 *
 * Uses mocking to bypass real OAuth flow
 */
setup('authenticate', async ({ page }) => {
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

  // Mock MCP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      json: { clusters: [], issues: [], events: [], nodes: [] },
    })
  )

  // Navigate to login page first to set up localStorage
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Set token in localStorage (simulates authenticated state)
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
  })

  // Navigate to dashboard - should not redirect to login now
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // Verify we're on the dashboard
  await expect(page).toHaveURL('/')

  // Save authentication state (localStorage + cookies)
  await page.context().storageState({ path: authFile })
})
