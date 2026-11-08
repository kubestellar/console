import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const CONTENT_TIMEOUT_MS = 30_000
const FIXED_TIME = new Date('2026-10-17T12:10:00Z')
test.use({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'Europe/Paris' })

async function openProductionNamespace(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME)
  await setupDemoMode(page)
  await page.route('**/src/**', route => route.continue())
  await page.addInitScript(() => {
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })
  await page.goto('/clusters')
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await page.getByTestId('cluster-row-eks-prod-us-east-1').getByRole('button', { name: /^Select cluster/ }).click()
  const modal = page.getByRole('dialog').last()
  await modal.getByRole('button', { name: /Workloads/ }).first().click()
  const workloads = modal.getByRole('heading', { name: /^Workloads \(/ }).locator('..')
  await workloads.getByRole('button', { name: /production/ }).click()
  return workloads
}

test('namespace tree rows are keyboard operable', async ({ page }) => {
  const workloads = await openProductionNamespace(page)
  await workloads.getByRole('button', { name: /PVC/ }).click()
  const row = workloads.getByRole('button', { name: /data-postgres-0/ })
  await expect(row).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(workloads).toHaveScreenshot('cluster-detail-namespace-tree.png', { mask: [workloads.getByRole('status')] })
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('drilldown-modal').getByText('data-postgres-0').first()).toBeVisible()
})

test('namespace list rows are keyboard operable', async ({ page }) => {
  const workloads = await openProductionNamespace(page)
  await workloads.getByRole('button', { name: 'List view' }).click()
  const row = workloads.getByRole('button', { name: /data-postgres-0/ })
  await expect(row).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(workloads).toHaveScreenshot('cluster-detail-namespace-list.png', { mask: [workloads.getByRole('status')] })
  await row.focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('drilldown-modal').getByText('data-postgres-0').first()).toBeVisible()
})
