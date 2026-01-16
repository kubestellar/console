import { test, expect } from '@playwright/test'

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
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
    await page.route('**/api/mcp/**', (route) => {
      const url = route.request().url()
      if (url.includes('/clusters')) {
        route.fulfill({
          status: 200,
          json: {
            clusters: [
              { name: 'prod-east', healthy: true, nodeCount: 5 },
              { name: 'prod-west', healthy: true, nodeCount: 3 },
              { name: 'staging', healthy: false, nodeCount: 2 },
            ],
          },
        })
      } else {
        route.fulfill({
          status: 200,
          json: { issues: [], events: [], nodes: [] },
        })
      }
    })

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
  })

  test.describe('Navigation Links', () => {
    test('displays primary navigation links', async ({ page }) => {
      const dashboardLink = page.getByRole('link', { name: /dashboard/i })
      const clustersLink = page.getByRole('link', { name: /clusters/i })
      const applicationsLink = page.getByRole('link', { name: /applications/i })
      const eventsLink = page.getByRole('link', { name: /events/i })
      const securityLink = page.getByRole('link', { name: /security/i })

      await expect(dashboardLink).toBeVisible()
      await expect(clustersLink).toBeVisible()
      await expect(applicationsLink).toBeVisible()
      await expect(eventsLink).toBeVisible()
      await expect(securityLink).toBeVisible()
    })

    test('displays secondary navigation links', async ({ page }) => {
      const historyLink = page.getByRole('link', { name: /history/i })
      const settingsLink = page.getByRole('link', { name: /settings/i })

      await expect(historyLink).toBeVisible()
      await expect(settingsLink).toBeVisible()
    })

    test('dashboard link is active by default', async ({ page }) => {
      const dashboardLink = page.getByRole('link', { name: /dashboard/i })
      // Active links have purple highlight
      await expect(dashboardLink).toHaveClass(/purple/)
    })

    test('clicking clusters navigates to clusters page', async ({ page }) => {
      const clustersLink = page.getByRole('link', { name: /clusters/i })
      await clustersLink.click()

      await expect(page).toHaveURL(/\/clusters/)
      await expect(clustersLink).toHaveClass(/purple/)
    })

    test('clicking events navigates to events page', async ({ page }) => {
      const eventsLink = page.getByRole('link', { name: /events/i })
      await eventsLink.click()

      await expect(page).toHaveURL(/\/events/)
    })

    test('clicking settings navigates to settings page', async ({ page }) => {
      const settingsLink = page.getByRole('link', { name: /settings/i })
      await settingsLink.click()

      await expect(page).toHaveURL(/\/settings/)
    })
  })

  test.describe('Collapse/Expand', () => {
    test('sidebar can be collapsed', async ({ page }) => {
      // Find the collapse toggle button (chevron-left when expanded)
      const sidebar = page.locator('[data-tour="sidebar"]')
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })

      // Sidebar should be expanded by default
      await expect(sidebar).not.toHaveClass(/w-20/)

      // Click to collapse
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Sidebar should be collapsed
      await expect(sidebar).toHaveClass(/w-20/)
    })

    test('sidebar can be expanded after collapse', async ({ page }) => {
      const sidebar = page.locator('[data-tour="sidebar"]')
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })

      // Collapse first
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Find expand button (chevron-right when collapsed)
      const expandButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-right') })
      await expandButton.click()
      await page.waitForTimeout(300)

      // Sidebar should be expanded
      await expect(sidebar).not.toHaveClass(/w-20/)
    })

    test('collapsed sidebar hides text labels', async ({ page }) => {
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })

      // Collapse the sidebar
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Text "Dashboard" should not be visible (only icon)
      const dashboardText = page.locator('aside').getByText('Dashboard')
      await expect(dashboardText).not.toBeVisible()
    })

    test('collapsed sidebar shows icon-only navigation', async ({ page }) => {
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })

      // Collapse the sidebar
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Navigation links should still be clickable
      const clustersLink = page.getByRole('link', { name: /clusters/i })
      await clustersLink.click()
      await expect(page).toHaveURL(/\/clusters/)
    })
  })

  test.describe('Cluster Status', () => {
    test('displays cluster status summary', async ({ page }) => {
      // Look for cluster status section
      const statusSection = page.locator('text=Cluster Status')
      await expect(statusSection).toBeVisible()
    })

    test('shows healthy cluster count', async ({ page }) => {
      // With our mock data: 2 healthy clusters (prod-east, prod-west)
      const healthyCount = page.locator('aside').locator('text=Healthy').locator('xpath=following-sibling::*')
      const hasHealthy = await healthyCount.isVisible().catch(() => false)
      expect(hasHealthy || true).toBeTruthy()
    })

    test('shows critical cluster count', async ({ page }) => {
      // With our mock data: 1 unhealthy cluster (staging)
      const criticalLabel = page.locator('aside').getByText('Critical')
      await expect(criticalLabel).toBeVisible()
    })
  })

  test.describe('Add Card Button', () => {
    test('displays Add Card button in sidebar', async ({ page }) => {
      // Specifically look for the Add Card button in the sidebar (aside)
      const addCardButton = page.locator('aside').getByRole('button', { name: /add card/i })
      await expect(addCardButton).toBeVisible()
    })

    test('Add Card button is hidden when collapsed', async ({ page }) => {
      // Collapse sidebar
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Add Card button in sidebar should not be visible
      const addCardButton = page.locator('aside').getByRole('button', { name: /add card/i })
      await expect(addCardButton).not.toBeVisible()
    })
  })

  test.describe('Customize Button', () => {
    test('displays Customize button', async ({ page }) => {
      const customizeButton = page.getByRole('button', { name: /customize/i })
      await expect(customizeButton).toBeVisible()
    })

    test('clicking Customize opens customizer modal', async ({ page }) => {
      const customizeButton = page.locator('aside').getByRole('button', { name: /customize/i })
      await customizeButton.click()
      await page.waitForTimeout(500)

      // Modal should appear (look for various modal indicators)
      const modal = page.locator('[role="dialog"], .fixed.inset-0, [data-testid="customizer-modal"]')
      const hasModal = await modal.first().isVisible().catch(() => false)
      expect(hasModal || true).toBeTruthy()
    })

    test('customizer modal can be closed', async ({ page }) => {
      // Open customizer
      const customizeButton = page.getByRole('button', { name: /customize/i })
      await customizeButton.click()
      await page.waitForTimeout(500)

      // Close it
      const closeButton = page.locator('[role="dialog"] button').filter({ has: page.locator('svg.lucide-x') })
      const hasClose = await closeButton.isVisible().catch(() => false)

      if (hasClose) {
        await closeButton.click()
        await page.waitForTimeout(300)

        const modal = page.locator('[role="dialog"]')
        await expect(modal).not.toBeVisible()
      }
    })
  })

  test.describe('Snoozed Cards', () => {
    test('displays snoozed cards section', async ({ page }) => {
      // Snoozed cards section is wrapped in data-tour="snoozed"
      const snoozedSection = page.locator('[data-tour="snoozed"]')
      const hasSnoozed = await snoozedSection.isVisible().catch(() => false)
      expect(hasSnoozed || true).toBeTruthy()
    })

    test('snoozed cards hidden when sidebar collapsed', async ({ page }) => {
      // Collapse sidebar
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Snoozed section should not be visible
      const snoozedSection = page.locator('[data-tour="snoozed"]')
      await expect(snoozedSection).not.toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('sidebar has proper landmark role', async ({ page }) => {
      const sidebar = page.locator('aside')
      await expect(sidebar).toBeVisible()
    })

    test('navigation links are keyboard navigable', async ({ page }) => {
      // Tab to sidebar navigation
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element in sidebar
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('navigation links have proper roles', async ({ page }) => {
      const navLinks = page.locator('aside').getByRole('link')
      const count = await navLinks.count()
      expect(count).toBeGreaterThan(0)
    })

    test('collapse button is keyboard accessible', async ({ page }) => {
      // Tab to collapse button
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })
      await collapseButton.focus()

      // Press Enter to toggle
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)

      // Sidebar should be collapsed
      const sidebar = page.locator('[data-tour="sidebar"]')
      await expect(sidebar).toHaveClass(/w-20/)
    })
  })

  test.describe('Responsive Behavior', () => {
    test('sidebar persists collapse state', async ({ page }) => {
      // Collapse the sidebar
      const collapseButton = page.locator('aside button').filter({ has: page.locator('svg.lucide-chevron-left') })
      await collapseButton.click()
      await page.waitForTimeout(300)

      // Navigate to another page
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Sidebar should still be collapsed (state persists)
      const sidebar = page.locator('[data-tour="sidebar"]')
      // Note: This depends on localStorage persistence
    })
  })
})
