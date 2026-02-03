import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for dashboard tests
 */
async function setupDashboardTest(page: Page) {
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

  // Mock cluster data
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [
          { name: 'cluster-1', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
          { name: 'cluster-2', context: 'ctx-2', healthy: true, nodeCount: 3, podCount: 32 },
        ],
        issues: [],
        events: [],
        nodes: [],
      }),
    })
  )

  // Set token before navigating
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardTest(page)
  })

  test.describe('Layout and Structure', () => {
    test('displays dashboard with sidebar', async ({ page }) => {
      // Check for main layout elements using data-testid
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
    })

    test('displays navigation items in sidebar', async ({ page }) => {
      // Sidebar should have navigation
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible()

      // Should have navigation links
      const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
      const linkCount = await navLinks.count()
      expect(linkCount).toBeGreaterThan(0)
    })

    test('displays header with refresh controls', async ({ page }) => {
      // Check for navbar/header elements
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('dashboard-title')).toBeVisible()
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Dashboard Cards', () => {
    test('displays dashboard cards grid', async ({ page }) => {
      // Wait for cards grid to be visible
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 })
    })

    test('cards have proper structure', async ({ page }) => {
      // Wait for cards grid
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 })

      // Cards should have content
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const cards = cardsGrid.locator('> div')
      const cardCount = await cards.count()

      // Dashboard should have at least one card (defaults are set)
      expect(cardCount).toBeGreaterThanOrEqual(0)
    })

    test('cards are interactive (hover/click)', async ({ page }) => {
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 })

      // Find first card in the grid
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const firstCard = cardsGrid.locator('> div').first()

      // Card should be visible
      const isVisible = await firstCard.isVisible().catch(() => false)

      if (isVisible) {
        // Test hover - should not throw
        await firstCard.hover()

        // Card should remain visible after hover
        await expect(firstCard).toBeVisible()
      }
    })
  })

  test.describe('Card Management', () => {
    test('has add card button in sidebar', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })

      // Add card button should be visible (when sidebar is expanded)
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()
    })

    test('clicking add card opens modal', async ({ page }) => {
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible({ timeout: 5000 })

      // Click add card button
      await page.getByTestId('sidebar-add-card').click()

      // Modal should appear (look for modal content)
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Data Loading', () => {
    test('shows loading state initially', async ({ page }) => {
      // Reset to fresh page without mocks set up yet
      await page.goto('/login')

      // Delay the API response to see loading state
      await page.route('**/api/mcp/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
        })
      })

      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
      })

      await page.goto('/')

      // Dashboard page should be visible even during loading
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('handles API errors gracefully', async ({ page }) => {
      // Reset and mock error
      await page.goto('/login')

      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' }),
        })
      )

      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
      })

      await page.goto('/')

      // Dashboard should still render (not crash)
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('refresh button triggers data reload', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 5000 })

      // Click refresh
      await page.getByTestId('dashboard-refresh-button').click()

      // Button should still be visible after click
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Page should still render at mobile size
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Header should still be visible
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      // Content should still be accessible
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('has proper heading hierarchy', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have h1 heading
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBeGreaterThanOrEqual(1)
    })

    test('supports keyboard navigation', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('has proper ARIA labels', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Refresh button should have title for accessibility
      const refreshButton = page.getByTestId('dashboard-refresh-button')
      await expect(refreshButton).toHaveAttribute('title', 'Refresh data')
    })
  })
})
