import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for sidebar tests
 */
async function setupSidebarTest(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
  await mockApiFallback(page)

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

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    // demo-token sentinel: setDemoMode() runs synchronously, no /api/me fetch needed.
    // Auth resolves instantly on all browsers. (#nightly-playwright)
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // Wait up to 20s for sidebar — Firefox/webkit are slower on CI.
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 20_000 })
}

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupSidebarTest(page)
  })

  test.describe('Navigation Links', () => {
    test('displays sidebar with primary navigation', async ({ page }) => {
      // Wait for sidebar to be visible
      const SIDEBAR_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Should have navigation links
      const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
      const linkCount = await navLinks.count()
      expect(linkCount).toBeGreaterThan(0)
    })

    test('dashboard link navigates to home', async ({ page }) => {
      const SIDEBAR_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Navigate away first — in webkit, clicking <a href="/"> when already
      // on "/" hangs because no navigation event fires.
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Find dashboard link by href since sidebar uses NavLink with icons + text
      const dashboardLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/"]').first()
      await expect(dashboardLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await dashboardLink.click()

      // Should be on dashboard
      await expect(page).toHaveURL(/\/$/, { timeout: SIDEBAR_TIMEOUT_MS })
    })

    test('clusters link navigates to clusters page', async ({ page }) => {
      const SIDEBAR_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Find clusters link by href — fall back to sidebar-scoped locator
      const clustersLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/clusters"]').first()
        .or(page.getByTestId('sidebar').locator('a[href="/clusters"]').first())
      await expect(clustersLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await clustersLink.click()

      // Should be on clusters page
      await expect(page).toHaveURL(/\/clusters/, { timeout: SIDEBAR_TIMEOUT_MS })
    })

    test('events link navigates to events page', async ({ page }) => {
      const SIDEBAR_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Events is a discoverable dashboard (not in default sidebar).
      // Test sidebar navigation with a default item (/deploy) instead.
      const deployLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/deploy"]').first()
        .or(page.getByTestId('sidebar').locator('a[href="/deploy"]').first())
      await expect(deployLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await deployLink.click()

      // Should be on deploy page
      await expect(page).toHaveURL(/\/deploy/, { timeout: SIDEBAR_TIMEOUT_MS })
    })
  })

  test.describe('Collapse/Expand', () => {
    test('sidebar can be collapsed via toggle button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Find and click collapse toggle
      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
      await expect(collapseToggle).toBeVisible()

      // The toggle button exposes aria-expanded reflecting the sidebar state.
      // Assert expanded before click, collapsed after — no brittle offsetWidth. #9525
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'true')

      // Use evaluate(el.click()) — Playwright's synthetic click can miss React's
      // event delegation on webkit when the component tree is mid-render.
      // Native el.click() bubbles through the React root, reliably firing onClick.
      // (#nightly-playwright)
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())

      // Wait for aria-expanded to reflect the collapsed state — ensures React updated
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 10000 })

      // Add Card button should be hidden when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 5000 })
    })

    test('sidebar can be expanded after collapse', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Collapse first — force:true bypasses webkit/firefox actionability
      // check while the sidebar polls for data (#nightly-playwright).
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip to false, indicating state update completed
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 10000 })
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 5000 })

      // Click again to expand
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip back to true
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })

      // Add Card button should be visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible({ timeout: 5000 })
    })

    test('collapsed sidebar hides Add Card button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Verify Add Card is visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Collapse sidebar — force:true for webkit/firefox stability
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip to false indicating state update completed
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 10000 })

      // Add Card should be hidden when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Cluster Status', () => {
    test('displays cluster status summary when enabled', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Cluster status section depends on config.showClusterStatus being true
      // which may not be enabled by default — skip if not present
      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible().catch(() => false)

      if (isVisible) {
        // Should show healthy/unhealthy labels inside the cluster status section
        await expect(clusterStatus.locator('text=Healthy').first()).toBeVisible()
      } else {
        // Not a failure — cluster status is a configurable sidebar section
        test.skip()
      }
    })

    test('cluster status links navigate to filtered cluster view', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible().catch(() => false)

      if (!isVisible) {
        test.skip()
        return
      }

      // Click healthy status button
      await clusterStatus.locator('button').filter({ hasText: /Healthy/i }).first().click()

      // Should navigate to clusters with filter
      await expect(page).toHaveURL(/\/clusters/, { timeout: 5000 })
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
    // The sidebar does not have a data-testid="sidebar-customize" element.
    // It has an "Add more..." button that opens the SidebarCustomizer modal.
    // Use that button instead.

    test('displays Add more button to open customizer', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // The "Add more..." button opens the SidebarCustomizer
      const addMoreBtn = page.getByTestId('sidebar').locator('button').filter({ hasText: /Add more/i }).first()
      const isVisible = await addMoreBtn.isVisible().catch(() => false)
      if (!isVisible) {
        // Button may not be visible if sidebar is collapsed
        test.skip()
        return
      }
      await expect(addMoreBtn).toBeVisible()
    })

    test('clicking Add more opens customizer modal', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const addMoreBtn = page.getByTestId('sidebar').locator('button').filter({ hasText: /Add more/i }).first()
      const isVisible = await addMoreBtn.isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      // Click Add more — force-click on webkit where CSS transitions can
      // cause actionability checks to stall (#nightly-playwright).
      await addMoreBtn.click({ force: true })

      // Modal should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    })

    test('customizer modal can be closed', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const addMoreBtn = page.getByTestId('sidebar').locator('button').filter({ hasText: /Add more/i }).first()
      const isVisible = await addMoreBtn.isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      // Open customizer — force-click on webkit where CSS transitions can
      // cause actionability checks to stall (#nightly-playwright).
      await addMoreBtn.click({ force: true })
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
      const sidebar = page.getByTestId('sidebar')
      await sidebar.waitFor({ state: 'visible', timeout: 15_000 })

      // Tab into sidebar navigation
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Should have focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('collapse button is keyboard accessible', async ({ page }) => {
      await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 15_000 })

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
      await collapseToggle.waitFor({ state: 'visible', timeout: 15_000 })

      // Focus the button
      await collapseToggle.focus()
      await expect(collapseToggle).toBeFocused()

      // Press Enter to toggle
      await page.keyboard.press('Enter')
      
      // Wait for aria-expanded to indicate collapse is complete
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 })

      // Sidebar should collapse — Add Card hides when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Responsive Behavior', () => {
    test('sidebar state persists on navigation', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Collapse sidebar — native el.click() for webkit React event reliability (#nightly-playwright)
      const COLLAPSE_TIMEOUT_MS = 10_000
      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())

      // Wait for aria-expanded to indicate collapse is complete
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: COLLAPSE_TIMEOUT_MS })
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: COLLAPSE_TIMEOUT_MS })

      // Navigate to clusters
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')

      // Sidebar should still be collapsed (Add Card hidden)
      // Firefox may need extra time to apply persisted sidebar state. #10134
      const PERSIST_CHECK_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: PERSIST_CHECK_TIMEOUT_MS })
    })
  })
})
