import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for sidebar tests
 */
async function setupSidebarTest(page: Page) {
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
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-east', healthy: true, reachable: true, nodeCount: 5 },
            { name: 'prod-west', healthy: true, reachable: true, nodeCount: 3 },
            { name: 'staging', healthy: false, reachable: true, nodeCount: 2 },
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

  // Set auth token
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupSidebarTest(page)
  })

  test.describe('Navigation Links', () => {
    test('displays sidebar with primary navigation', async ({ page }) => {
      // Wait for sidebar to be visible
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible()

      // Should have navigation links
      const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
      const linkCount = await navLinks.count()
      expect(linkCount).toBeGreaterThan(0)
    })

    test('dashboard link navigates to home', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Click dashboard link
      const dashboardLink = page.getByRole('link', { name: /dashboard/i })
      await expect(dashboardLink).toBeVisible()
      await dashboardLink.click()

      // Should be on dashboard
      await expect(page).toHaveURL(/^\/$/, { timeout: 5000 })
    })

    test('clusters link navigates to clusters page', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Click clusters link
      const clustersLink = page.getByRole('link', { name: /clusters/i })
      await expect(clustersLink).toBeVisible()
      await clustersLink.click()

      // Should be on clusters page
      await expect(page).toHaveURL(/\/clusters/, { timeout: 5000 })
    })

    test('events link navigates to events page', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Click events link
      const eventsLink = page.getByRole('link', { name: /events/i })
      await expect(eventsLink).toBeVisible()
      await eventsLink.click()

      // Should be on events page
      await expect(page).toHaveURL(/\/events/, { timeout: 5000 })
    })
  })

  test.describe('Collapse/Expand', () => {
    test('sidebar can be collapsed via toggle button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Find and click collapse toggle
      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
      await expect(collapseToggle).toBeVisible()

      // Get initial sidebar width
      const initialWidth = await page.getByTestId('sidebar').evaluate(el => el.offsetWidth)

      // Click to collapse
      await collapseToggle.click()

      // Wait for animation
      await page.waitForTimeout(300)

      // Sidebar should be narrower when collapsed
      const collapsedWidth = await page.getByTestId('sidebar').evaluate(el => el.offsetWidth)
      expect(collapsedWidth).toBeLessThan(initialWidth)
    })

    test('sidebar can be expanded after collapse', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Collapse first
      await collapseToggle.click()
      await page.waitForTimeout(300)

      // Click again to expand
      await collapseToggle.click()
      await page.waitForTimeout(300)

      // Add Card button should be visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()
    })

    test('collapsed sidebar hides Add Card button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Verify Add Card is visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()

      // Collapse sidebar
      await page.getByTestId('sidebar-collapse-toggle').click()
      await page.waitForTimeout(300)

      // Add Card should be hidden when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible()
    })
  })

  test.describe('Cluster Status', () => {
    test('displays cluster status summary when enabled', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Cluster status section should be visible
      const clusterStatus = page.getByTestId('sidebar-cluster-status')

      // This section may or may not be visible depending on user settings
      const isVisible = await clusterStatus.isVisible().catch(() => false)

      if (isVisible) {
        // Should show healthy/unhealthy counts
        await expect(page.getByText('Healthy')).toBeVisible()
      }
    })

    test('cluster status links navigate to filtered cluster view', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible().catch(() => false)

      if (isVisible) {
        // Click healthy status
        await page.getByTestId('sidebar-cluster-status').getByText('Healthy').click()

        // Should navigate to clusters with filter
        await expect(page).toHaveURL(/\/clusters/, { timeout: 5000 })
      }
    })
  })

  test.describe('Add Card Button', () => {
    test('displays Add Card button in sidebar', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()
    })

    test('Add Card button opens modal', async ({ page }) => {
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible({ timeout: 10000 })

      // Click Add Card
      await page.getByTestId('sidebar-add-card').click()

      // Modal should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Customize Button', () => {
    test('displays Customize button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar-customize')).toBeVisible()
    })

    test('clicking Customize opens customizer modal', async ({ page }) => {
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })

      // Click customize
      await page.getByTestId('sidebar-customize').click()

      // Modal should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    })

    test('customizer modal can be closed', async ({ page }) => {
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })

      // Open customizer
      await page.getByTestId('sidebar-customize').click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

      // Close it via Escape key
      await page.keyboard.press('Escape')

      // Modal should be gone
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Accessibility', () => {
    test('sidebar has proper landmark element (aside)', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Verify it's an aside element
      const tagName = await page.getByTestId('sidebar').evaluate(el => el.tagName)
      expect(tagName.toLowerCase()).toBe('aside')
    })

    test('navigation links are keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Tab into sidebar navigation
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Should have focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('collapse button is keyboard accessible', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Focus the button
      await collapseToggle.focus()
      await expect(collapseToggle).toBeFocused()

      // Press Enter to toggle
      await page.keyboard.press('Enter')

      // Sidebar should collapse
      await page.waitForTimeout(300)
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible()
    })
  })

  test.describe('Responsive Behavior', () => {
    test('sidebar state persists on navigation', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Collapse sidebar
      await page.getByTestId('sidebar-collapse-toggle').click()
      await page.waitForTimeout(300)

      // Navigate to clusters
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')

      // Sidebar should still be collapsed (Add Card hidden)
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible()
    })
  })
})
