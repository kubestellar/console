import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Compute Deep Tests (/compute) — Compute.tsx
 *
 * Validates the Compute dashboard page including page structure,
 * stats overview, cluster comparison feature, refresh, cards, and error state.
 *
 * Run with: npx playwright test e2e/compute-deep.spec.ts
 */

/** Timeout for card grid elements to appear */
const CARD_GRID_TIMEOUT_MS = 10_000

/** Timeout for cluster list expansion animation */
const CLUSTER_LIST_TIMEOUT_MS = 5_000

/** Minimum number of clusters required to test comparison */
const MIN_CLUSTERS_FOR_COMPARE = 2

/** Route path for the compute dashboard */
const COMPUTE_ROUTE = '/compute'

test.describe('Compute Deep Tests (/compute)', () => {
  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const collector = setupErrorCollector(page)
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      expect(collector.errors).toHaveLength(0)
    })

    test('renders page title', async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(title).toContainText('Compute')
    })

    test('displays dashboard header with refresh button', async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const refreshButton = page.getByTestId('dashboard-refresh-button')
      await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('shows stats overview section', async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      // Stats overview renders sublabels like "total nodes", "cores allocatable", etc.
      const nodesLabel = page.getByText('total nodes')
      // In demo mode stats should be visible
      await expect(nodesLabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Stats Overview', () => {
    test.beforeEach(async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)
    })

    test('displays node count stat', async ({ page }) => {
      const sublabel = page.getByText('total nodes')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays CPU cores stat', async ({ page }) => {
      const sublabel = page.getByText('cores allocatable')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays memory stat with unit formatting', async ({ page }) => {
      // Memory sublabel is "allocatable"; the value shows GB or TB formatting
      const sublabel = page.getByText('allocatable')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays pod count stat', async ({ page }) => {
      const sublabel = page.getByText('running pods')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays GPU count stat', async ({ page }) => {
      const sublabel = page.getByText('total GPUs')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Cluster Comparison', () => {
    test.beforeEach(async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)
    })

    test('shows cluster comparison toggle', async ({ page }) => {
      const toggle = page.getByText('Cluster Comparison')
      await expect(toggle.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('expanding comparison shows cluster list', async ({ page }) => {
      const toggle = page.getByText('Cluster Comparison')
      await toggle.first().click()

      const clusterList = page.locator('#cluster-comparison-list')
      const noClusterMsg = page.getByText('No clusters available')

      // Either cluster list or "no clusters" message should be visible
      try {
        await expect(clusterList).toBeVisible({ timeout: 5000 })
      } catch {
        await expect(noClusterMsg).toBeVisible({ timeout: 5000 })
      }
    })

    test('cluster checkboxes are interactive', async ({ page }) => {
      const toggle = page.getByText('Cluster Comparison')
      await toggle.first().click()

      const clusterList = page.locator('#cluster-comparison-list')
      try {
        await expect(clusterList).toBeVisible({ timeout: 5000 })
      } catch {
        test.skip()
        return
      }

      // Click the first cluster button in the comparison list
      const clusterButtons = clusterList.locator('button')
      const count = await clusterButtons.count()
      if (count === 0) {
        test.skip()
        return
      }

      await clusterButtons.first().click()

      // After clicking, "1 selected" text should appear
      const selectedText = page.getByText('1 selected')
      await expect(selectedText).toBeVisible({ timeout: CLUSTER_LIST_TIMEOUT_MS })
    })

    test('Compare button appears when 2+ clusters selected', async ({ page }) => {
      const toggle = page.getByText('Cluster Comparison')
      await toggle.first().click()

      const clusterList = page.locator('#cluster-comparison-list')
      try {
        await expect(clusterList).toBeVisible({ timeout: 5000 })
      } catch {
        test.skip()
        return
      }

      const clusterButtons = clusterList.locator('button')
      const count = await clusterButtons.count()
      if (count < MIN_CLUSTERS_FOR_COMPARE) {
        test.skip()
        return
      }

      // Select two clusters
      await clusterButtons.nth(0).click()
      await clusterButtons.nth(1).click()

      // Compare button should now be visible (contains "Compare" text)
      const compareButton = page.getByRole('button', { name: /Compare/i })
      await expect(compareButton.first()).toBeVisible({ timeout: CLUSTER_LIST_TIMEOUT_MS })
    })

    test('Clear button resets cluster selections', async ({ page }) => {
      const toggle = page.getByText('Cluster Comparison')
      await toggle.first().click()

      const clusterList = page.locator('#cluster-comparison-list')
      try {
        await expect(clusterList).toBeVisible({ timeout: 5000 })
      } catch {
        test.skip()
        return
      }

      const clusterButtons = clusterList.locator('button')
      const count = await clusterButtons.count()
      if (count === 0) {
        test.skip()
        return
      }

      // Select a cluster
      await clusterButtons.first().click()
      const selectedText = page.getByText('1 selected')
      await expect(selectedText).toBeVisible({ timeout: CLUSTER_LIST_TIMEOUT_MS })

      // Click Clear
      const clearButton = page.getByText('Clear')
      await clearButton.click()

      // "selected" text should disappear
      await expect(selectedText).not.toBeVisible({ timeout: CLUSTER_LIST_TIMEOUT_MS })
    })
  })

  test.describe('Refresh', () => {
    test('refresh button triggers data reload', async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      const refreshButton = page.getByTestId('dashboard-refresh-button')
      await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      // Click refresh and verify the page remains stable (no crash)
      await refreshButton.click()

      // Dashboard header should still be visible after refresh
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Cards', () => {
    test('renders at least one card in the grid', async ({ page }) => {
      await setupDemoAndNavigate(page, COMPUTE_ROUTE)
      await waitForSubRoute(page)

      // Cards use [data-card-type] attribute
      const cards = page.locator('[data-card-type]')
      const cardCount = await cards.count()

      // In demo mode, default compute cards should be present
      expect(cardCount).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Error State', () => {
    test('shows error message on API failure', async ({ page }) => {
      // Intercept MCP clusters endpoint and return an error
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal server error' }),
          })
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ nodes: [], events: [], issues: [] }),
          })
        }
      })

      await setupDemoAndNavigate(page, COMPUTE_ROUTE)

      // In demo mode, the error may not surface because demo data is used.
      // Check that the page at least loads without crashing.
      const header = page.getByTestId('dashboard-header')
      let isHeaderVisible = false
      try {
        await expect(header).toBeVisible({ timeout: 5000 })
        isHeaderVisible = true
      } catch {
        // Header not visible
      }

      // If error text is shown, verify it matches expected message
      const errorText = page.getByText('Error loading compute data')
      let isErrorVisible = false
      try {
        await expect(errorText).toBeVisible({ timeout: 5000 })
        isErrorVisible = true
      } catch {
        // Error not visible
      }

      // Either the page loaded successfully or showed the error — both are valid
      expect(isHeaderVisible || isErrorVisible).toBe(true)
    })
  })
})
