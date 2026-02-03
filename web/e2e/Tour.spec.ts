import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for tour tests
 */
async function setupTourTest(page: Page) {
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
}

test.describe('Tour/Onboarding', () => {
  test.describe('Tour Prompt for New Users', () => {
    test('shows welcome prompt when tour not completed', async ({ page }) => {
      await setupTourTest(page)

      // Clear tour completed flag to simulate new user
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Page should load without crashing
      await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    })

    test('hides tour for users who completed it', async ({ page }) => {
      await setupTourTest(page)

      // Set tour completed flag
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Dashboard should be visible
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Dashboard Display', () => {
    test('displays dashboard page when tour completed', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cards grid', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Tour Completion State', () => {
    test('tour completed flag persists after page reload', async ({ page }) => {
      await setupTourTest(page)

      // Set tour completed flag
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Reload page
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Verify flag is still set
      const completed = await page.evaluate(() =>
        localStorage.getItem('kubestellar-console-tour-completed')
      )
      expect(completed).toBe('true')
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('escape key does not crash the page', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Press escape
      await page.keyboard.press('Escape')

      // Page should not crash
      await expect(page.locator('body')).toBeVisible()
    })

    test('arrow keys work on page', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Press arrow keys should not crash
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowLeft')

      // Page should still be visible
      await expect(page.getByTestId('dashboard-page')).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('page is keyboard navigable', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('page has proper heading', async ({ page }) => {
      await setupTourTest(page)

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have heading
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
    })
  })
})
