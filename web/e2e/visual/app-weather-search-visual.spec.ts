import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

test('weather location search remains available in demo mode', async ({ page }) => {
  await setupDemoMode(page)
  await page.route('**/src/**', route => route.continue())
  await page.addInitScript(() => {
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kubestellar-pods-cards', JSON.stringify([
      { id: 'weather-search-visual', card_type: 'weather', config: {}, position: { w: 12, h: 6 } },
    ]))
  })
  await page.goto('/pods')
  const card = page.locator('[data-card-type="weather"]')
  await card.getByRole('button', { name: 'Change Location' }).click()
  const search = card.getByPlaceholder('Type city name...')
  await expect(search).toBeVisible()
  await expect(search).toHaveAttribute('aria-busy', 'false')
  await expect(card).toHaveScreenshot('weather-search.png')
})
