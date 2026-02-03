import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for card chat tests
 */
async function setupCardChatTest(page: Page) {
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

  // Mock MCP endpoints with sample data to show cards
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-east', healthy: true, nodeCount: 5 },
          ],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Set auth token and high AI mode
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-ai-mode', 'high')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Card Chat AI Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await setupCardChatTest(page)
  })

  test.describe('Dashboard with High AI Mode', () => {
    test('displays dashboard page', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cards on dashboard', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have cards grid
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })

    test('AI mode is set to high', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Verify high AI mode is set
      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('high')
    })
  })

  test.describe('AI Mode Behavior', () => {
    test('can change to low AI mode', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'low')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('low')
    })

    test('can change to medium AI mode', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'medium')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('medium')
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('page is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})
