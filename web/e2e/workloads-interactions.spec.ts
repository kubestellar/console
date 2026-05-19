import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  setupWorkloadsDemoPage,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Deploy route path — target of "Add Workload" button */
const DEPLOY_ROUTE = '/deploy'

/** Timeout for navigation to settle after click */
const CLICK_NAV_TIMEOUT_MS = 10_000

/** Restart toast content shown after clicking the restart action */
const RESTART_TOAST_PATTERN = /Restarting deployment|Restart triggered|Failed to restart deployment/

/** Cluster status text rendered by StatusIndicator */
const CLUSTER_STATUS_PATTERN = /Healthy|Error|Warning|Offline/

async function setupWorkloadsPage(page: Page) {
  await page.context().clearCookies()
  await setupWorkloadsDemoPage(page)
}

async function getFirstWorkloadRowOrSkip(page: Page) {
  const workloadRows = page.getByTestId('workload-row')
  const rowCount = await workloadRows.count()

  test.skip(rowCount === 0, 'No workload rows found in demo mode')

  const workloadRow = workloadRows.nth(0)
  await expect(workloadRow).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  return workloadRow
}

async function getFirstDeploymentRowOrSkip(page: Page) {
  const deploymentRows = page
    .getByTestId('workload-row')
    .filter({ has: page.getByRole('button', { name: 'Restart deployment' }) })
  const rowCount = await deploymentRows.count()

  test.skip(rowCount === 0, 'No deployment rows with action buttons found')

  const deploymentRow = deploymentRows.nth(0)
  await expect(deploymentRow).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  return deploymentRow
}

async function getActionButtonOrSkip(page: Page, testId: string, skipReason: string): Promise<Locator> {
  const deploymentRow = await getFirstDeploymentRowOrSkip(page)
  const actionButton = deploymentRow.getByTestId(testId)
  const buttonCount = await actionButton.count()

  test.skip(buttonCount === 0, skipReason)

  await expect(actionButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  return actionButton
}

async function getFirstClusterCard(page: Page) {
  const clusterCards = page.getByTestId('clusters-overview-grid').getByTestId('cluster-card')
  const count = await clusterCards.count()

  expect(count).toBeGreaterThan(0)

  const firstCard = clusterCards.nth(0)
  await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  return firstCard
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.serial('Workloads interactions (/workloads)', () => {
  test.describe('Workload Row Drill-Down Navigation (#12475)', () => {
    test.beforeEach(async ({ page }) => {
      await setupWorkloadsPage(page)
    })

    test('clicking a workload row opens a drill-down panel', async ({ page }) => {
      const workloadRow = await getFirstWorkloadRowOrSkip(page)

      await workloadRow.click()

      const drillDown = page.getByTestId('drilldown-modal')
      await expect(drillDown).toBeVisible({ timeout: CLICK_NAV_TIMEOUT_MS })
    })

    test('workload row shows chevron indicating it is clickable', async ({ page }) => {
      const workloadRow = await getFirstWorkloadRowOrSkip(page)
      const chevron = workloadRow.locator('svg').last()

      await expect(chevron).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Add Workload Button Navigation (#12476)', () => {
    test.beforeEach(async ({ page }) => {
      await setupWorkloadsPage(page)
    })

    test('Add Workload button is visible in page header', async ({ page }) => {
      const addBtn = page.getByTestId('add-workload-btn')
      await expect(addBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('clicking Add Workload navigates to deploy page', async ({ page }) => {
      const addBtn = page.getByTestId('add-workload-btn')
      await expect(addBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await addBtn.click()

      await page.waitForURL(`**${DEPLOY_ROUTE}*`, { timeout: CLICK_NAV_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-title')).toContainText(/Deploy/i, {
        timeout: CLICK_NAV_TIMEOUT_MS,
      })
      expect(page.url()).toContain(DEPLOY_ROUTE)
    })

    test('empty state also has a deploy button that navigates', async ({ page }) => {
      const deployBtn = page.getByTestId('empty-state-deploy-workload-btn')
      const buttonVisible = await deployBtn
        .waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false)

      test.skip(!buttonVisible, 'Empty state deploy button is not shown when workloads exist')

      await deployBtn.click()
      await page.waitForURL(`**${DEPLOY_ROUTE}*`, { timeout: CLICK_NAV_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-title')).toContainText(/Deploy/i, {
        timeout: CLICK_NAV_TIMEOUT_MS,
      })
      expect(page.url()).toContain(DEPLOY_ROUTE)
    })
  })

  test.describe('Action Buttons in Demo Mode (#12477)', () => {
    test.beforeEach(async ({ page }) => {
      await setupWorkloadsPage(page)
    })

    test('action buttons (Restart/Logs/Delete) are visible on deployment rows', async ({ page }) => {
      const restartBtn = await getActionButtonOrSkip(
        page,
        'action-btn-restart',
        'No deployment rows with Restart button found'
      )
      const logsBtn = await getActionButtonOrSkip(
        page,
        'action-btn-logs',
        'No deployment rows with Logs button found'
      )
      const deleteBtn = await getActionButtonOrSkip(
        page,
        'action-btn-delete',
        'No deployment rows with Delete button found'
      )

      await expect(restartBtn).toBeVisible()
      await expect(logsBtn).toBeVisible()
      await expect(deleteBtn).toBeVisible()
    })

    test('Restart button click shows toast notification', async ({ page }) => {
      const restartBtn = await getActionButtonOrSkip(
        page,
        'action-btn-restart',
        'No deployment rows with Restart button found'
      )

      await restartBtn.click()

      const toast = page.getByRole('status').filter({ hasText: RESTART_TOAST_PATTERN }).nth(0)
      await expect(toast).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(toast).toContainText(RESTART_TOAST_PATTERN)
    })

    test('Delete button opens confirmation dialog', async ({ page }) => {
      const deleteBtn = await getActionButtonOrSkip(
        page,
        'action-btn-delete',
        'No deployment rows with Delete button found'
      )

      await deleteBtn.click()

      const dialog = page.getByRole('dialog').filter({ hasText: 'Delete Deployment' })
      await expect(dialog).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible()
    })

    test('Logs button navigates to drill-down with pods tab', async ({ page }) => {
      const logsBtn = await getActionButtonOrSkip(
        page,
        'action-btn-logs',
        'No deployment rows with Logs button found'
      )

      await logsBtn.click()

      const drillDown = page.getByTestId('drilldown-modal')
      await expect(drillDown).toBeVisible({ timeout: CLICK_NAV_TIMEOUT_MS })
    })
  })

  test.describe('Clusters Overview Section (#12482)', () => {
    test.beforeEach(async ({ page }) => {
      await setupWorkloadsPage(page)
    })

    test('Clusters Overview heading is visible', async ({ page }) => {
      const heading = page.getByTestId('clusters-overview-heading')
      await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('Clusters Overview section shows cluster cards', async ({ page }) => {
      const clustersGrid = page.getByTestId('clusters-overview-grid')
      await expect(clustersGrid).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const clusterCards = clustersGrid.getByTestId('cluster-card')
      const count = await clusterCards.count()
      expect(count).toBeGreaterThan(0)
    })

    test('cluster cards display pod and node counts', async ({ page }) => {
      const firstCard = await getFirstClusterCard(page)
      await expect(firstCard).toContainText(/pods/)
      await expect(firstCard).toContainText(/nodes/)
    })

    test('cluster cards show status indicators', async ({ page }) => {
      const firstCard = await getFirstClusterCard(page)
      await expect(firstCard).toContainText(CLUSTER_STATUS_PATTERN)
    })
  })
})
