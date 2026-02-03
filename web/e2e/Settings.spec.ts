import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for settings tests
 */
async function setupSettingsTest(page: Page) {
  // Mock authentication
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

  // Mock MCP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  // Set auth token
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSettingsTest(page)
  })

  test.describe('Page Layout', () => {
    test('displays settings page', async ({ page }) => {
      // Settings page should be visible
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows settings title', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Should have Settings heading
      await expect(page.getByTestId('settings-title')).toBeVisible()
      await expect(page.getByTestId('settings-title')).toHaveText('Settings')
    })

    test('has sidebar navigation', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Sidebar should be visible
      await expect(page.getByTestId('sidebar')).toBeVisible()
    })
  })

  test.describe('Theme Settings', () => {
    test('theme persists after reload', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Set theme in localStorage
      await page.evaluate(() => {
        localStorage.setItem('theme', 'light')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Theme should be preserved
      const storedTheme = await page.evaluate(() =>
        localStorage.getItem('theme')
      )
      expect(storedTheme).toBe('light')
    })
  })

  test.describe('AI Mode Settings', () => {
    test('displays AI mode section', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Look for AI mode section
      const aiSection = page.getByText(/ai.*mode|intelligence/i).first()
      const hasAiSection = await aiSection.isVisible().catch(() => false)

      // AI mode section should be visible
      expect(hasAiSection).toBe(true)
    })
  })

  test.describe('Accessibility', () => {
    test('settings page is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('page has proper heading hierarchy', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Should have h1 heading
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Page should still render at mobile size
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      // Content should still be accessible
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })
    })
  })
})
