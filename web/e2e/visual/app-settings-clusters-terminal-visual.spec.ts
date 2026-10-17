import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const CONTENT_TIMEOUT_MS = 30_000
const FIXED_TIME = new Date('2026-10-17T12:10:00Z')
test.use({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'Europe/Paris' })

async function openDemo(page: Page, path: string) {
  await page.clock.setFixedTime(FIXED_TIME)
  await setupDemoMode(page)
  // Also permit source modules when verifying with the local dev server.
  await page.route('**/src/**', route => route.continue())
  await page.addInitScript(() => {
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })
  await page.goto(path)
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
}

test('local cluster settings retain vCluster and KubeVirt controls', async ({ page }) => {
  await openDemo(page, '/settings')
  const section = page.locator('#local-clusters-settings')
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByText('KubeVirt', { exact: true })).toBeVisible()
  const vcluster = section.getByRole('heading', { name: 'Virtual Clusters', exact: true }).locator('../..')
  await expect(vcluster).toHaveScreenshot('settings-virtual-clusters.png')
  const kubevirt = section.getByRole('heading', { name: 'KubeVirt', exact: true }).locator('../..')
  await expect(kubevirt.locator('.space-y-2 > div').first()).toHaveScreenshot('settings-kubevirt-cluster.png')
  await expect(kubevirt.getByRole('button', { name: /Open Install KubeVirt Mission/ }).locator('..')).toHaveScreenshot('settings-kubevirt-summary.png')
})

test('system update settings retain channel and installation panels', async ({ page }) => {
  await openDemo(page, '/settings')
  const section = page.locator('#system-updates-settings')
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByText('Update Channel', { exact: true })).toBeVisible()
  await expect(section).toHaveScreenshot('settings-system-updates.png')
})

test('alert badge retains its dropdown and filters', async ({ page }) => {
  await openDemo(page, '/clusters')
  await page.getByTestId('navbar-alerts-btn').click()
  const dropdown = page.getByTestId('navbar-alerts-dropdown')
  await expect(dropdown).toBeVisible()
  await expect(dropdown).toHaveScreenshot('navbar-alerts-dropdown.png')
})

test('cluster detail retains header and resource stats', async ({ page }) => {
  await openDemo(page, '/clusters')
  await page.getByTestId('cluster-row-eks-prod-us-east-1').getByRole('button', { name: /^Select cluster/ }).click()
  const modal = page.getByRole('dialog').last()
  await expect(modal.getByRole('heading', { name: 'eks-prod-us-east-1', exact: true })).toBeVisible()
  await expect(modal).toHaveScreenshot('cluster-detail-header-stats.png')
})
