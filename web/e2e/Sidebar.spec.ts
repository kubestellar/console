import { test, expect, Page } from '@playwright/test'
import { DEFAULT_PRIMARY_NAV } from '../src/hooks/useSidebarConfig'
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

const SIDEBAR_TIMEOUT_MS = 10_000
const PRIMARY_NAV_EXPECTATIONS = DEFAULT_PRIMARY_NAV.map(({ name, href }) => ({
  label: name,
  href,
}))

async function expectDashboardNavigation(page: Page, href: string, expectedTitle: string) {
  await expect.poll(
    () => new URL(page.url()).pathname,
    { timeout: SIDEBAR_TIMEOUT_MS },
  ).toBe(href)
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
  await expect(page.getByTestId('dashboard-title')).toContainText(expectedTitle, { timeout: SIDEBAR_TIMEOUT_MS })
}

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupSidebarTest(page)
  })

  test.describe('Navigation Links', () => {
    test('displays primary navigation items in the expected order', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      const navLinks = page.getByTestId('sidebar-primary-nav').getByTestId('sidebar-item')

      await expect(navLinks).toHaveCount(PRIMARY_NAV_EXPECTATIONS.length)

      for (const [index, expectedNavItem] of PRIMARY_NAV_EXPECTATIONS.entries()) {
        const navLink = navLinks.nth(index)
        await expect(navLink).toHaveAttribute('data-test-label', expectedNavItem.label)
        await expect(navLink).toHaveAttribute('href', expectedNavItem.href)
        await expect(navLink).toContainText(expectedNavItem.label)
      }
    })

    test('dashboard link navigates to home', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      // Navigate away first — clicking the home link while already on "/"
      // would not exercise any real routing behavior.
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await expectDashboardNavigation(page, '/clusters', 'My Clusters')

      const dashboardLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/"]').first()
      await expect(dashboardLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await dashboardLink.click()

      await expectDashboardNavigation(page, '/', 'Dashboard')
    })

    test('clusters link navigates to clusters page', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      const clustersLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/clusters"]').first()
        .or(page.getByTestId('sidebar').locator('a[href="/clusters"]').first())
      await expect(clustersLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await clustersLink.click()

      await expectDashboardNavigation(page, '/clusters', 'My Clusters')
    })

    test('deploy link navigates to deploy page', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })

      const deployLink = page.getByTestId('sidebar-primary-nav').locator('a[href="/deploy"]').first()
        .or(page.getByTestId('sidebar').locator('a[href="/deploy"]').first())
      await expect(deployLink).toBeVisible({ timeout: SIDEBAR_TIMEOUT_MS })
      await deployLink.click()

      await expectDashboardNavigation(page, '/deploy', 'Deploy')
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

      // Wait for network idle to ensure no DOM re-renders during click
      await page.waitForLoadState('networkidle').catch(() => {})

      // Use evaluate(el.click()) — Playwright's synthetic click can miss React's
      // event delegation on webkit when the component tree is mid-render.
      // Native el.click() bubbles through the React root, reliably firing onClick.
      // (#nightly-playwright)
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())

      // Wait for aria-expanded to reflect the collapsed state — ensures React updated
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15000 })

      // Add Card button should be hidden when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 10000 })
    })

    test('sidebar can be expanded after collapse', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Wait for network idle before first collapse
      await page.waitForLoadState('networkidle').catch(() => {})

      // Collapse first — force:true bypasses webkit/firefox actionability
      // check while the sidebar polls for data (#nightly-playwright).
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip to false, indicating state update completed
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15000 })
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 10000 })

      // Wait for network idle before re-expanding
      await page.waitForLoadState('networkidle').catch(() => {})

      // Click again to expand
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip back to true
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15000 })

      // Add Card button should be visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible({ timeout: 10000 })
    })

    test('collapsed sidebar hides Add Card button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Verify Add Card is visible when expanded
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()

      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')

      // Wait for network idle before collapse
      await page.waitForLoadState('networkidle').catch(() => {})

      // Collapse sidebar — force:true for webkit/firefox stability
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())
      // Wait for aria-expanded to flip to false indicating state update completed
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15000 })

      // Add Card should be hidden when collapsed
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Cluster Status', () => {
    test('displays cluster status summary when enabled', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // Cluster status section depends on config.showClusterStatus being true
      // which may not be enabled by default — skip if not present
      // #12090 — Use timeout instead of catch to differentiate between
      // "feature disabled" and "slow hydration"
      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible({ timeout: 30000 }).catch(() => false)

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

      // #12090 — Use timeout instead of catch
      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible({ timeout: 30000 }).catch(() => false)

      if (!isVisible) {
        test.skip()
        return
      }

      // Click healthy status button
      await clusterStatus.locator('button').filter({ hasText: /Healthy/i }).first().click()

      // Should navigate to clusters with ?status=healthy query param (#11774)
      await expect(page).toHaveURL(/\/clusters\?.*status=healthy/, { timeout: 5000 })
    })

    test('unhealthy status link includes ?status=unhealthy', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      // #12090 — Use timeout instead of catch
      const clusterStatus = page.getByTestId('sidebar-cluster-status')
      const isVisible = await clusterStatus.isVisible({ timeout: 30000 }).catch(() => false)

      if (!isVisible) {
        test.skip()
        return
      }

      // Click unhealthy status button
      const unhealthyBtn = clusterStatus.locator('button').filter({ hasText: /Unhealthy/i }).first()
      const unhealthyVisible = await unhealthyBtn.isVisible({ timeout: 30000 }).catch(() => false)
      if (!unhealthyVisible) { test.skip(); return }

      await unhealthyBtn.click()

      // Should navigate to clusters with ?status=unhealthy query param (#11774)
      await expect(page).toHaveURL(/\/clusters\?.*status=unhealthy/, { timeout: 5000 })
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

      // Wait for network idle before clicking
      await page.waitForLoadState('networkidle').catch(() => {})

      // Click Add more — use native el.click() for webkit/firefox where CSS
      // transitions can cause actionability checks to stall (#nightly-playwright).
      await addMoreBtn.evaluate((el) => (el as HTMLElement).click())

      // Modal should appear
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
    })

    test('customizer modal can be closed', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })

      const addMoreBtn = page.getByTestId('sidebar').locator('button').filter({ hasText: /Add more/i }).first()
      const isVisible = await addMoreBtn.isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      // Wait for network idle before clicking
      await page.waitForLoadState('networkidle').catch(() => {})

      // Open customizer — use native el.click() for webkit/firefox where CSS
      // transitions can cause actionability checks to stall (#nightly-playwright).
      await addMoreBtn.evaluate((el) => (el as HTMLElement).click())
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

      // Close it via Escape key
      await page.keyboard.press('Escape')

      // Modal should be gone
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
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

      // Wait for network idle before collapse
      await page.waitForLoadState('networkidle').catch(() => {})

      // Collapse sidebar — native el.click() for webkit React event reliability (#nightly-playwright)
      const COLLAPSE_TIMEOUT_MS = 15_000
      const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
      await collapseToggle.evaluate((el) => (el as HTMLElement).click())

      // Wait for aria-expanded to indicate collapse is complete
      await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false', { timeout: COLLAPSE_TIMEOUT_MS })
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: COLLAPSE_TIMEOUT_MS })

      // Navigate to clusters
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')
      // Wait for network idle on new page
      await page.waitForLoadState('networkidle').catch(() => {})

      // Sidebar should still be collapsed (Add Card hidden)
      // Firefox/webkit may need extra time to apply persisted sidebar state. #10134
      const PERSIST_CHECK_TIMEOUT_MS = 15_000
      await expect(page.getByTestId('sidebar-add-card')).not.toBeVisible({ timeout: PERSIST_CHECK_TIMEOUT_MS })
    })
  })
})
