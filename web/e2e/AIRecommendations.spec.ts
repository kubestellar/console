import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for AI recommendations tests
 */
async function setupRecommendationsTest(page: Page, aiMode: 'low' | 'medium' | 'high' = 'high') {
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

  // Mock MCP endpoints with sample data
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-east', healthy: true, nodeCount: 5 },
            { name: 'staging', healthy: false, nodeCount: 2 },
          ],
        }),
      })
    } else if (url.includes('/pod-issues')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          issues: [
            { name: 'pod-1', namespace: 'default', cluster: 'prod-east', status: 'CrashLoopBackOff' },
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

  // Set auth token and AI mode
  await page.goto('/login')
  await page.evaluate((mode) => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-ai-mode', mode)
  }, aiMode)

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('AI Card Recommendations', () => {
  test.describe('Dashboard Display', () => {
    test('displays dashboard with high AI mode', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cards grid', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })

    test('displays dashboard with low AI mode', async ({ page }) => {
      await setupRecommendationsTest(page, 'low')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('AI Mode Settings', () => {
    test('high mode is persisted', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('high')
    })

    test('low mode is persisted', async ({ page }) => {
      await setupRecommendationsTest(page, 'low')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('low')
    })

    test('medium mode is persisted', async ({ page }) => {
      await setupRecommendationsTest(page, 'medium')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      const mode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(mode).toBe('medium')
    })
  })

  test.describe('Data Display', () => {
    test('shows cluster data when available', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Page should render without crashing with cluster data
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })

    test('handles unhealthy cluster data', async ({ page }) => {
      // Setup with unhealthy cluster
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

      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                { name: 'unhealthy-cluster', healthy: false, nodeCount: 3 },
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

      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('page is keyboard navigable', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('has proper heading', async ({ page }) => {
      await setupRecommendationsTest(page, 'high')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have heading
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
    })
  })
})
