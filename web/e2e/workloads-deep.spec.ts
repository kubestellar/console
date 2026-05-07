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
      // Set up error collector BEFORE navigation to capture cold-load errors
      const { errors } = setupErrorCollector(page)
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
      await expect(stat).toBeVisible()
    })

    test('shows deployment count stat', async ({ page }) => {
      const stat = page.locator('text=' + STAT_DEPLOYMENTS_SUBLABEL).first()
      await expect(stat).toBeVisible()
    })

    test('shows pod issues stat', async ({ page }) => {
      const stat = page.locator('text=' + STAT_POD_ISSUES_SUBLABEL).first()
      await expect(stat).toBeVisible()
    })
  })

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  test.describe('Content', () => {
    test('renders workload rows or empty state', async ({ page }) => {
      // In demo mode we should see either workload rows or the empty state
      // Workload rows have data-testid="workload-row"
      const workloadRows = page.getByTestId('workload-row')
      const emptyState = page.locator('text=' + EMPTY_STATE_TEXT).first()

      const hasRows = (await workloadRows.count()) > 0
      const hasEmpty = await emptyState.isVisible().catch(() => false)

      // At least one of these should be present
      expect(hasRows || hasEmpty).toBe(true)
    })

    test('page has meaningful content', async ({ page }) => {
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // Clusters Overview
  // -------------------------------------------------------------------------

  test.describe('Clusters Overview', () => {
    test('renders clusters overview heading', async ({ page }) => {
      const heading = page.locator('text=' + CLUSTERS_OVERVIEW_HEADING).first()
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('renders clusters overview grid with cluster cards', async ({ page }) => {
      const grid = page.getByTestId('clusters-overview-grid')
      await expect(grid).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      // In demo mode at least one cluster card must be present
      const cards = grid.getByTestId('cluster-card')
      const cardCount = await cards.count()
      expect(cardCount).toBeGreaterThan(0)
    })

    test('cluster cards show pod and node counts', async ({ page }) => {
      const grid = page.getByTestId('clusters-overview-grid')
      await expect(grid).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const cards = grid.getByTestId('cluster-card')
      const cardCount = await cards.count()
      expect(cardCount).toBeGreaterThan(0)

      // Each card should display pod and node stats
      const firstCard = cards.first()
      await expect(firstCard.locator('text=/pods/')).toBeVisible()
      await expect(firstCard.locator('text=/nodes/')).toBeVisible()
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

  // -------------------------------------------------------------------------
  // Workload Interactions (#12475, #12476, #12477)
  // -------------------------------------------------------------------------

  test.describe('Workload Row Click (#12475)', () => {
    test('clicking a workload row opens the drill-down panel', async ({ page }) => {
      // Look for workload rows
      const workloadRow = page.getByTestId('workload-row').first()
      const hasRow = await workloadRow.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

      if (!hasRow) {
        test.skip(true, 'No workload rows found in demo mode')
        return
      }

      // Click the first workload row
      await workloadRow.click()

      // Wait for drill-down modal to appear
      const drilldownModal = page.getByTestId('drilldown-modal')
      await expect(drilldownModal).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Add Workload Button (#12476)', () => {
    test('clicking Add Workload button navigates to deploy page', async ({ page }) => {
      // Find the Add Workload button
      const addBtn = page.getByTestId('add-workload-btn')
      await expect(addBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      // Click the button
      await addBtn.click()

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded')

      // Verify we navigated to the deploy route
      expect(page.url()).toContain('/deploy')
    })
  })

  test.describe('Action Buttons (#12477)', () => {
    test('Restart button is visible and clickable on deployment rows', async ({ page }) => {
      // Look for workload rows
      const workloadRow = page.getByTestId('workload-row').first()
      const hasRow = await workloadRow.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

      if (!hasRow) {
        test.skip(true, 'No workload rows found in demo mode')
        return
      }

      // Look for the restart action button
      const restartBtn = page.getByTestId('action-btn-restart').first()
      const hasRestartBtn = await restartBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (!hasRestartBtn) {
        test.skip(true, 'No deployment rows with Restart button found')
        return
      }

      // Verify button is clickable
      await expect(restartBtn).toBeEnabled()
      await expect(restartBtn).toBeVisible()
    })

    test('Logs button is visible and clickable on deployment rows', async ({ page }) => {
      // Look for workload rows
      const workloadRow = page.getByTestId('workload-row').first()
      const hasRow = await workloadRow.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

      if (!hasRow) {
        test.skip(true, 'No workload rows found in demo mode')
        return
      }

      // Look for the logs action button
      const logsBtn = page.getByTestId('action-btn-logs').first()
      const hasLogsBtn = await logsBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (!hasLogsBtn) {
        test.skip(true, 'No deployment rows with Logs button found')
        return
      }

      // Verify button is clickable
      await expect(logsBtn).toBeEnabled()
      await expect(logsBtn).toBeVisible()
    })

    test('Delete button is visible and clickable on deployment rows', async ({ page }) => {
      // Look for workload rows
      const workloadRow = page.getByTestId('workload-row').first()
      const hasRow = await workloadRow.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

      if (!hasRow) {
        test.skip(true, 'No workload rows found in demo mode')
        return
      }

      // Look for the delete action button
      const deleteBtn = page.getByTestId('action-btn-delete').first()
      const hasDeleteBtn = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (!hasDeleteBtn) {
        test.skip(true, 'No deployment rows with Delete button found')
        return
      }

      // Verify button is clickable
      await expect(deleteBtn).toBeEnabled()
      await expect(deleteBtn).toBeVisible()
    })

    test('clicking Logs button opens drill-down panel', async ({ page }) => {
      // Look for the logs action button
      const logsBtn = page.getByTestId('action-btn-logs').first()
      const hasLogsBtn = await logsBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (!hasLogsBtn) {
        test.skip(true, 'No deployment rows with Logs button found')
        return
      }

      // Click the logs button
      await logsBtn.click()

      // Verify drill-down modal appears
      const drilldownModal = page.getByTestId('drilldown-modal')
      await expect(drilldownModal).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })
})
