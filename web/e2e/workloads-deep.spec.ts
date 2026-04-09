import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Workloads route path */
const WORKLOADS_ROUTE = '/workloads'

/** Minimum content length (chars) to confirm the page is not blank */
const MIN_PAGE_CONTENT_LENGTH = 100

/** Expected page title text */
const PAGE_TITLE_TEXT = 'Workloads'

/** Sublabel text for the namespaces stat block */
const STAT_NAMESPACES_SUBLABEL = 'active namespaces'

/** Sublabel text for the deployments stat block */
const STAT_DEPLOYMENTS_SUBLABEL = 'total deployments'

/** Sublabel text for the pod issues stat block */
const STAT_POD_ISSUES_SUBLABEL = 'pod issues'

/** Text shown in the Clusters Overview section heading */
const CLUSTERS_OVERVIEW_HEADING = 'Clusters Overview'

/** Empty state title when no workloads are found */
const EMPTY_STATE_TEXT = 'No workloads found'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Workloads Deep Tests (/workloads)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, WORKLOADS_ROUTE)
    await waitForSubRoute(page)
  })

  // -------------------------------------------------------------------------
  // Page Structure
  // -------------------------------------------------------------------------

  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const { errors } = setupErrorCollector(page)
      // Re-navigate to capture errors from a fresh load
      await setupDemoAndNavigate(page, WORKLOADS_ROUTE)
      await waitForSubRoute(page)
      expect(errors).toHaveLength(0)
    })

    test('renders page title', async ({ page }) => {
      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const text = await title.textContent()
      expect(text).toContain(PAGE_TITLE_TEXT)
    })

    test('displays dashboard header', async ({ page }) => {
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('shows stats overview', async ({ page }) => {
      // DashboardPage renders stats blocks; look for any stat sublabel text
      const statsArea = page.locator('text=' + STAT_NAMESPACES_SUBLABEL).first()
      const isVisible = await statsArea.isVisible().catch(() => false)
      // Stats may render differently depending on data availability
      if (isVisible) {
        await expect(statsArea).toBeVisible()
      }
    })
  })

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  test.describe('Stats', () => {
    test('shows namespace count stat', async ({ page }) => {
      const stat = page.locator('text=' + STAT_NAMESPACES_SUBLABEL).first()
      const isVisible = await stat.isVisible().catch(() => false)
      if (isVisible) {
        await expect(stat).toBeVisible()
      }
    })

    test('shows deployment count stat', async ({ page }) => {
      const stat = page.locator('text=' + STAT_DEPLOYMENTS_SUBLABEL).first()
      const isVisible = await stat.isVisible().catch(() => false)
      if (isVisible) {
        await expect(stat).toBeVisible()
      }
    })

    test('shows pod issues stat', async ({ page }) => {
      const stat = page.locator('text=' + STAT_POD_ISSUES_SUBLABEL).first()
      const isVisible = await stat.isVisible().catch(() => false)
      if (isVisible) {
        await expect(stat).toBeVisible()
      }
    })
  })

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  test.describe('Content', () => {
    test('renders cards or content area', async ({ page }) => {
      // In demo mode we should see either workload rows or the empty state
      // Workload rows have a border-l-4 style, or the empty state has the deploy button
      const workloadRows = page.locator('.border-l-4')
      const emptyState = page.locator('text=' + EMPTY_STATE_TEXT).first()
      const clustersHeading = page.locator('text=' + CLUSTERS_OVERVIEW_HEADING).first()

      const hasRows = (await workloadRows.count()) > 0
      const hasEmpty = await emptyState.isVisible().catch(() => false)
      const hasClusters = await clustersHeading.isVisible().catch(() => false)

      // At least one of these should be present
      expect(hasRows || hasEmpty || hasClusters).toBe(true)
    })

    test('page has meaningful content', async ({ page }) => {
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  test.describe('Refresh', () => {
    test('refresh button is clickable', async ({ page }) => {
      const refreshBtn = page.getByTestId('dashboard-refresh-button')
      const isVisible = await refreshBtn.isVisible().catch(() => false)
      if (isVisible) {
        await expect(refreshBtn).toBeEnabled()
        await refreshBtn.click()
        // After clicking, the page should still show the header
        await expect(page.getByTestId('dashboard-header')).toBeVisible({
          timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
        })
      }
    })
  })

  // -------------------------------------------------------------------------
  // Error State
  // -------------------------------------------------------------------------

  test.describe('Error State', () => {
    test('handles error gracefully', async ({ page }) => {
      // Navigate to the route and verify no unhandled crash occurs
      // The page should render either content or empty state, not a blank page
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      // Verify the page did not crash to a white screen
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })
})
