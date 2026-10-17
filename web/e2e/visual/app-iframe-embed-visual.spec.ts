import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const CARD_VISIBLE_TIMEOUT_MS = 30_000
const DESKTOP_VIEWPORT = { width: 1440, height: 1100 }

test.describe('Iframe embed card', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('settings, presets, and saved demo placeholder retain their layout', async ({ page }) => {
    await setupDemoMode(page)
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en')
      localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([{
        id: 'iframe-visual', card_type: 'iframe_embed', config: {},
        position: { x: 0, y: 0, w: 6, h: 5 },
      }]))
      localStorage.setItem('kubestellar-main-dashboard-cards:schema-version', '1')
    })
    // In dev-server runs, source modules under lib/api are not API requests.
    await page.route('**/src/**', route => route.continue())
    await page.goto('/')
    const card = page.locator('[data-card-type="iframe_embed"]')
    await expect(card).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })
    const save = card.getByRole('button', { name: 'Save & Load' })
    await expect(save).toBeDisabled()
    await expect(card).toHaveScreenshot('iframe-embed-settings.png')

    await card.getByRole('button', { name: '📊 Grafana' }).click()
    await expect(card.locator('input[type="url"]')).toHaveValue('http://localhost:3000')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(card.getByText('Grafana', { exact: true })).toBeVisible()
    await expect(card.locator('iframe')).toHaveCount(0)
    await expect(card).toHaveScreenshot('iframe-embed-demo-placeholder.png')

    await card.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(card.locator('input[type="url"]')).toHaveValue('http://localhost:3000/')
    await card.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(card.locator('input[type="url"]')).toHaveValue('')
    await expect(save).toBeDisabled()
  })
})
