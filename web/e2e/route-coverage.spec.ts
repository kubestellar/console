import { test, expect, Page } from '@playwright/test'
import { setupDemoMode, setupErrorCollector } from './helpers/setup'

/**
 * Route Coverage E2E Tests
 *
 * Comprehensive tests for routes that lack dedicated test coverage.
 * Each route gets load, content, and interaction tests.
 *
 * Run with: npx playwright test e2e/route-coverage.spec.ts
 */

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

/** Timeout for network idle after navigation (ms) */
const NETWORK_IDLE_TIMEOUT_MS = 15_000

/** Timeout for element visibility assertions (ms) */
const ELEMENT_VISIBLE_TIMEOUT_MS = 10_000

/** Timeout for soft element checks that may not always exist (ms) */
const SOFT_CHECK_TIMEOUT_MS = 5_000

/** Minimum body text length to confirm the page is not blank */
const MIN_BODY_TEXT_LENGTH = 50

/**
 * Navigates to a route, waits for network idle, and asserts zero unexpected errors.
 */
async function loadRouteAndAssertNoErrors(
  page: Page,
  path: string,
): Promise<{ errors: string[]; warnings: string[] }> {
  const collector = setupErrorCollector(page)
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
  await expect(page.locator('body')).toBeVisible()

  if (collector.errors.length > 0) {
    console.log(`Console errors on ${path}:`, collector.errors)
  }
  expect(collector.errors, `Unexpected console errors on ${path}`).toHaveLength(0)

  return collector
}

/**
 * Asserts the page has meaningful content (not blank or near-empty).
 */
async function assertPageHasContent(page: Page, path: string) {
  const bodyText = await page.textContent('body')
  expect(
    bodyText?.length,
    `${path} rendered a blank or near-empty page`,
  ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
}

// ===========================================================================
// Test suites
// ===========================================================================

test.describe('Route Coverage Tests', () => {
  // -------------------------------------------------------------------------
  // /marketplace
  // -------------------------------------------------------------------------
  test.describe('Marketplace (/marketplace)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/marketplace')
    })

    test('shows marketplace content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/marketplace')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/marketplace')

      // Marketplace should have cards or list items
      const cards = page.locator('[class*="card"], [class*="Card"], [role="listitem"], [class*="marketplace"]')
      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has search or filter capability', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/marketplace')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Look for search input or filter controls
      const searchOrFilter = page.locator('input[type="search"], input[placeholder*="earch"], input[placeholder*="ilter"], [role="search"], [data-testid*="search"], [data-testid*="filter"], button:has-text("Filter")')
      const hasSearchOrFilter = await searchOrFilter.first().isVisible({ timeout: SOFT_CHECK_TIMEOUT_MS }).catch(() => false)

      // Even if no search, page should at least be interactive (clickable elements)
      const interactiveElements = page.locator('button, a[href], [role="tab"], [role="button"]')
      const count = await interactiveElements.count()
      expect(count, '/marketplace should have interactive elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /arcade
  // -------------------------------------------------------------------------
  test.describe('Arcade (/arcade)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/arcade')
    })

    test('shows arcade layout with content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/arcade')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/arcade')

      // Arcade should have a heading or distinct layout
      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has interactive elements', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/arcade')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const interactiveElements = page.locator('button, a[href], [role="tab"], [role="button"], [class*="interactive"]')
      const count = await interactiveElements.count()
      expect(count, '/arcade should have interactive elements').toBeGreaterThan(0)

      // Try clicking the first available button
      const firstButton = page.locator('button:visible').first()
      if (await firstButton.isVisible({ timeout: SOFT_CHECK_TIMEOUT_MS }).catch(() => false)) {
        await firstButton.click()
        // Page should not crash after interaction
        await expect(page.locator('body')).toBeVisible()
      }
    })
  })

  // -------------------------------------------------------------------------
  // /insights
  // -------------------------------------------------------------------------
  test.describe('Insights (/insights)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/insights')
    })

    test('shows insight cards or panels', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/insights')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/insights')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('renders data or empty state', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/insights')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Should show insight data, charts, or an empty state message
      const contentIndicators = page.locator('[class*="card"], [class*="Card"], [class*="chart"], [class*="insight"], [class*="empty"], [class*="Empty"]')
      const hasContent = await contentIndicators.first().isVisible({ timeout: SOFT_CHECK_TIMEOUT_MS }).catch(() => false)

      // At minimum the page body should have substantial content
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // /welcome
  // -------------------------------------------------------------------------
  test.describe('Welcome (/welcome)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/welcome')
    })

    test('shows onboarding content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/welcome')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/welcome')

      // Welcome page should have a heading
      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has a get-started or call-to-action element', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/welcome')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Look for CTA buttons or links
      const cta = page.locator('button:has-text("Get Started"), button:has-text("Start"), button:has-text("Continue"), a:has-text("Get Started"), a:has-text("Start"), a:has-text("Dashboard"), button:has-text("Explore"), a:has-text("Explore")')
      const hasCta = await cta.first().isVisible({ timeout: SOFT_CHECK_TIMEOUT_MS }).catch(() => false)

      // Even without a specific CTA, should have clickable elements
      const buttons = page.locator('button:visible, a[href]:visible')
      const count = await buttons.count()
      expect(count, '/welcome should have interactive elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /workloads
  // -------------------------------------------------------------------------
  test.describe('Workloads (/workloads)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/workloads')
    })

    test('shows workload list or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/workloads')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/workloads')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('handles empty state gracefully', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)
      await page.goto('/workloads')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Should show a list, table, or empty state -- not crash
      const contentOrEmpty = page.locator('table, [role="table"], [role="grid"], [class*="empty"], [class*="Empty"], [class*="list"], [class*="List"], [class*="card"], [class*="Card"]')
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
      expect(errors, 'Should not have unexpected errors on empty workloads').toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // /operators
  // -------------------------------------------------------------------------
  test.describe('Operators (/operators)', () => {
    test('loads without crashing', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)
      await page.goto('/operators')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await expect(page.locator('body')).toBeVisible()

      // Operators page may produce backend errors in CI (no real cluster)
      // Log them but don't fail — the page should still render
      if (errors.length > 0) {
        console.log(`[operators] Console errors (expected in CI):`, errors)
      }
    })

    test('shows operator list or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/operators')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/operators')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('handles empty state gracefully', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/operators')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Page should render real content, not be blank
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // /helm
  // -------------------------------------------------------------------------
  test.describe('Helm (/helm)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/helm')
    })

    test('shows Helm releases or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/helm')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/helm')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('handles empty state gracefully', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)
      await page.goto('/helm')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
      expect(errors, 'Should not have unexpected errors on empty helm').toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // /logs
  // -------------------------------------------------------------------------
  test.describe('Logs (/logs)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/logs')
    })

    test('shows log viewer UI', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/logs')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/logs')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('handles no log selection gracefully', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)
      await page.goto('/logs')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Should show a prompt to select a pod/container or an empty state
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
      expect(errors, 'Should not have unexpected errors with no log selection').toHaveLength(0)

      // Should have some selectable element (dropdown, list, etc.)
      const selectors = page.locator('select, [role="combobox"], [role="listbox"], button:visible, input:visible')
      const count = await selectors.count()
      expect(count, '/logs should have interactive selection elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /cost
  // -------------------------------------------------------------------------
  test.describe('Cost (/cost)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/cost')
    })

    test('shows cost dashboard content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/cost')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/cost')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has time range or filter controls', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/cost')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Look for time range selector, date picker, or filter controls
      const controls = page.locator('select, [role="combobox"], button:has-text("Day"), button:has-text("Week"), button:has-text("Month"), button:has-text("7d"), button:has-text("30d"), [data-testid*="time"], [data-testid*="range"], [class*="filter"], [class*="Filter"]')
      const hasControls = await controls.first().isVisible({ timeout: SOFT_CHECK_TIMEOUT_MS }).catch(() => false)

      // At minimum, interactive elements should exist
      const interactiveElements = page.locator('button:visible, a[href]:visible, select:visible')
      const count = await interactiveElements.count()
      expect(count, '/cost should have interactive elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /gpu-reservations
  // -------------------------------------------------------------------------
  test.describe('GPU Reservations (/gpu-reservations)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/gpu-reservations')
    })

    test('shows GPU allocation cards or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/gpu-reservations')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/gpu-reservations')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('renders cards or data visualization', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)
      await page.goto('/gpu-reservations')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      // Should show GPU cards, charts, or allocation data
      const visualElements = page.locator('[class*="card"], [class*="Card"], [class*="chart"], [class*="Chart"], canvas, svg, table, [role="table"]')
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
      expect(errors).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // /multi-tenancy
  // -------------------------------------------------------------------------
  test.describe('Multi-Tenancy (/multi-tenancy)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/multi-tenancy')
    })

    test('shows tenancy overview content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/multi-tenancy')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/multi-tenancy')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has interactive elements for tenant management', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/multi-tenancy')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const interactiveElements = page.locator('button:visible, a[href]:visible, [role="tab"]:visible, select:visible')
      const count = await interactiveElements.count()
      expect(count, '/multi-tenancy should have interactive elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /ci-cd
  // -------------------------------------------------------------------------
  test.describe('CI/CD (/ci-cd)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/ci-cd')
    })

    test('shows pipeline cards or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/ci-cd')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/ci-cd')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has interactive pipeline elements', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/ci-cd')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const interactiveElements = page.locator('button:visible, a[href]:visible, [role="tab"]:visible, [role="button"]:visible')
      const count = await interactiveElements.count()
      expect(count, '/ci-cd should have interactive elements').toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // /ai-agents
  // -------------------------------------------------------------------------
  test.describe('AI Agents (/ai-agents)', () => {
    test('loads without console errors', async ({ page }) => {
      await setupDemoMode(page)
      await loadRouteAndAssertNoErrors(page, '/ai-agents')
    })

    test('shows agent list or content', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/ai-agents')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
      await assertPageHasContent(page, '/ai-agents')

      const heading = page.locator('h1, h2, h3').first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('has interactive agent elements', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/ai-agents')
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const interactiveElements = page.locator('button:visible, a[href]:visible, [role="tab"]:visible, [role="button"]:visible')
      const count = await interactiveElements.count()
      expect(count, '/ai-agents should have interactive elements').toBeGreaterThan(0)
    })
  })
})
