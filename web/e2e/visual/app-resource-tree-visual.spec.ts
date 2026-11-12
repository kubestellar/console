import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const MIN_TOUCH_TARGET_PX = 44
const CONTENT_TIMEOUT_MS = 30_000

test('resource tree navigation has mobile-sized touch targets', async ({ page }) => {
  await setupDemoMode(page)
  await page.route('**/src/**', route => route.continue())
  await page.addInitScript(() => {
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kubestellar-pods-cards', JSON.stringify([
      { id: 'touch-tree', card_type: 'cluster_resource_tree', config: {}, position: { w: 12, h: 6 } },
    ]))
  })
  await page.goto('/pods')
  const card = page.locator('[data-card-type="cluster_resource_tree"]')
  const target = card.getByRole('button', { name: 'eks-prod', exact: true })
  await expect(target).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  const box = await target.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
  await expect(card).toHaveScreenshot('resource-tree-touch-targets.png', {
    mask: [card.locator('time'), card.locator('[title*="refresh" i]')],
  })
})
