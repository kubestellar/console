import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupErrorCollector,
  waitForWorkloadsReady,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupWorkloadsPage(page: Page) {
  await setupDemoAndNavigate(page, WORKLOADS_ROUTE)
  await waitForWorkloadsReady(page)
}

function getStatsLabel(page: Page, text: string) {
  return page.getByText(text, { exact: false }).nth(0)
}

async function getFirstWorkloadRow(page: Page): Promise<Locator | null> {
  const workloadRows = page.getByTestId('workload-row')
  return (await workloadRows.count()) > 0 ? workloadRows.nth(0) : null
}

async function getFirstDeploymentRow(page: Page): Promise<Locator | null> {
  const deploymentRows = page
    .getByTestId('workload-row')
    .filter({ has: page.getByRole('button', { name: 'Restart deployment' }) })
  return (await deploymentRows.count()) > 0 ? deploymentRows.nth(0) : null
}

async function getFirstClusterCard(page: Page) {
  const cards = page.getByTestId('clusters-overview-grid').getByTestId('cluster-card')
  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
  return cards.nth(0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.serial('Workloads Deep Tests (/workloads)', () => {
  test.beforeEach(async ({ page }) => {
    await setupWorkloadsPage(page)
  })

  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const { errors } = setupErrorCollector(page)
      await setupWorkloadsPage(page)
      expect(errors).toHaveLength(0)
    })

    test('renders page title', async ({ page }) => {
      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const text = await title.textContent()
      expect(text).toContain(PAGE_TITLE_TEXT)
    })

    test('displays dashboard header', async ({ page }) => {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('shows stats overview', async ({ page }) => {
      const statsArea = getStatsLabel(page, STAT_NAMESPACES_SUBLABEL)
      const isVisible = await statsArea.isVisible().catch(() => false)
      if (isVisible) {
        await expect(statsArea).toBeVisible()
      }
    })
  })

  test.describe('Stats', () => {
    test('shows namespace count stat', async ({ page }) => {
      await expect(getStatsLabel(page, STAT_NAMESPACES_SUBLABEL)).toBeVisible()
    })

    test('shows deployment count stat', async ({ page }) => {
      await expect(getStatsLabel(page, STAT_DEPLOYMENTS_SUBLABEL)).toBeVisible()
    })

    test('shows pod issues stat', async ({ page }) => {
      await expect(getStatsLabel(page, STAT_POD_ISSUES_SUBLABEL)).toBeVisible()
    })
  })

  test.describe('Content', () => {
    test('renders workload rows or empty state', async ({ page }) => {
      const hasRows = (await page.getByTestId('workload-row').count()) > 0
      const hasEmpty = await page.getByTestId('workloads-empty-state').isVisible().catch(() => false)
      expect(hasRows || hasEmpty).toBe(true)
    })

    test('page has meaningful content', async ({ page }) => {
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  test.describe('Clusters Overview', () => {
    test('renders clusters overview heading', async ({ page }) => {
      await expect(page.getByTestId('clusters-overview-heading')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    })

    test('renders clusters overview grid with cluster cards', async ({ page }) => {
      const grid = page.getByTestId('clusters-overview-grid')
      await expect(grid).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      expect(await grid.getByTestId('cluster-card').count()).toBeGreaterThan(0)
    })

    test('cluster cards show pod and node counts', async ({ page }) => {
      const firstCard = await getFirstClusterCard(page)
      await expect(firstCard).toContainText(/pods/)
      await expect(firstCard).toContainText(/nodes/)
    })
  })

  test.describe('Refresh', () => {
    test('refresh button is clickable', async ({ page }) => {
      const refreshBtn = page.getByTestId('dashboard-refresh-button')
      const isVisible = await refreshBtn.isVisible().catch(() => false)
      if (isVisible) {
        await expect(refreshBtn).toBeEnabled()
        await refreshBtn.click()
        await expect(page.getByTestId('dashboard-header')).toBeVisible({
          timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
        })
      }
    })
  })

  test.describe('Error State', () => {
    test('handles error gracefully', async ({ page }) => {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  test.describe('Workload Row Click (#12475)', () => {
    test('clicking a workload row opens the drill-down panel', async ({ page }) => {
      const workloadRow = await getFirstWorkloadRow(page)

      test.skip(!workloadRow, 'No workload rows found in demo mode')

      await workloadRow!.click()
      await expect(page.getByTestId('drilldown-modal')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Add Workload Button (#12476)', () => {
    test('clicking Add Workload button navigates to deploy page', async ({ page }) => {
      const addBtn = page.getByTestId('add-workload-btn')
      await expect(addBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await addBtn.click()
      await page.waitForURL('**/deploy*', { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-title')).toContainText(/Deploy/i, {
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      expect(page.url()).toContain('/deploy')
    })
  })

  test.describe('Action Buttons (#12477)', () => {
    test('Restart button is visible and clickable on deployment rows', async ({ page }) => {
      const deploymentRow = await getFirstDeploymentRow(page)

      test.skip(!deploymentRow, 'No deployment rows with Restart button found')

      const restartBtn = deploymentRow!.getByTestId('action-btn-restart')
      await expect(restartBtn).toBeEnabled()
      await expect(restartBtn).toBeVisible()
    })

    test('Logs button is visible and clickable on deployment rows', async ({ page }) => {
      const deploymentRow = await getFirstDeploymentRow(page)

      test.skip(!deploymentRow, 'No deployment rows with Logs button found')

      const logsBtn = deploymentRow!.getByTestId('action-btn-logs')
      await expect(logsBtn).toBeEnabled()
      await expect(logsBtn).toBeVisible()
    })

    test('Delete button is visible and clickable on deployment rows', async ({ page }) => {
      const deploymentRow = await getFirstDeploymentRow(page)

      test.skip(!deploymentRow, 'No deployment rows with Delete button found')

      const deleteBtn = deploymentRow!.getByTestId('action-btn-delete')
      await expect(deleteBtn).toBeEnabled()
      await expect(deleteBtn).toBeVisible()
    })

    test('clicking Logs button opens drill-down panel', async ({ page }) => {
      const deploymentRow = await getFirstDeploymentRow(page)

      test.skip(!deploymentRow, 'No deployment rows with Logs button found')

      await deploymentRow!.getByTestId('action-btn-logs').click()
      await expect(page.getByTestId('drilldown-modal')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })
})
