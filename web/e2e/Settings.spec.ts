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

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
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

      // Set theme via the app's actual storage key ('kubestellar-theme-id')
      // so the ThemeProvider applies it on reload. The 'theme' key was never
      // read by the app — useTheme.tsx reads 'kubestellar-theme-id'. #10200
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-theme-id', 'kubestellar-light')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Theme should be preserved in localStorage
      const storedTheme = await page.evaluate(() =>
        localStorage.getItem('kubestellar-theme-id')
      )
      expect(storedTheme).toBe('kubestellar-light')

      // Verify the theme is actually applied to the DOM, not just stored. #9521
      // The app sets class="light" or class="dark" on <html>.
      // WebKit/Firefox may apply the class slightly after domcontentloaded —
      // use a generous timeout for cross-browser reliability. #10134
      const THEME_CLASS_TIMEOUT_MS = 10_000
      await expect(page.locator('html')).toHaveClass(/light/, { timeout: THEME_CLASS_TIMEOUT_MS })
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
