import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

test('card behaviors remain visible and keyboard operable', async ({ page }) => {
  await setupDemoMode(page)
  await page.route("**/src/lib/api/**", route => route.continue())
  await page.goto('/')
  const card = page.locator('[data-card-type="cluster_health"]').first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /Card menu/ }).click()
  await page.getByRole('menuitem', { name: /Configure/ }).click()
  await page.getByRole('tab', { name: /Behaviors/ }).click()
  const behavior = page.getByRole('button', { name: /Auto-refresh/ })
  await expect(behavior).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveScreenshot('card-behaviors.png')
  const pressed = await behavior.getAttribute('aria-pressed')
  await behavior.focus()
  await page.keyboard.press('Space')
  await expect(behavior).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true')
})
