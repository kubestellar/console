import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

test('GPU dashboard actions', async ({ page }) => {
  await setupDemoMode(page)
  // The dev server serves modules under /src/lib/api/, which are not API calls.
  await page.route('**/src/**', route => route.continue())
  await page.goto('/gpu-reservations', { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  const addCard = page.locator('#main-content').getByRole('button', { name: 'Add Card', exact: true })
  await expect(addCard).toBeVisible()
  await expect(addCard).toHaveScreenshot('gpu-dashboard-add-card.png')
  await addCard.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
