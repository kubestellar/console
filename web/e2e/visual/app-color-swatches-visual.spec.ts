import { expect, test } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const THEME_COLORS = ['#101010', '#f5f5f5']
const REGISTRY_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/registry.json'
const REGISTRY = {
  version: '1',
  updatedAt: '2026-06-02T00:00:00Z',
  items: [{
    id: 'contrast-test-theme', name: 'Contrast Test Theme', type: 'theme',
    description: 'A theme with light and dark swatches.', author: 'KubeStellar',
    version: '1.0.0', downloadUrl: 'https://example.com/theme.json',
    tags: ['theme'], cardCount: 0, themeColors: THEME_COLORS,
  }],
  presets: [],
}

for (const mode of ['dark', 'light']) {
  test.describe(`${mode} theme swatches`, () => {
    test.beforeEach(async ({ page }) => {
      await setupDemoMode(page)
      // Let Vite serve source modules whose paths also match the API mock.
      await page.route('**/src/**', route => route.continue())
      await page.addInitScript((themeId) => {
        localStorage.setItem('kubestellar-theme-id', themeId)
      }, mode === 'light' ? 'kubestellar-light' : 'kubestellar')
    })

    test('saved filter palette and active marker', async ({ page }) => {
      await page.goto('/')
      const trigger = page.getByTestId('navbar-cluster-filter-btn')
      await trigger.click()
      const panel = page.getByTestId('navbar-cluster-filter-dropdown')
      await panel.getByPlaceholder(/filter by name/i).fill('default')
      await panel.getByRole('button', { name: 'Save Current Filters' }).click()
      await panel.getByPlaceholder(/filter set name/i).fill('Production')
      const color = panel.getByRole('button', { name: 'Select color #3B82F6' })
      await color.click()
      await expect(color).toHaveAttribute('aria-pressed', 'true')
      await expect(color.locator('..')).toHaveScreenshot(`filter-palette-${mode}.png`)
      await panel.getByRole('button', { name: 'Save', exact: true }).click()
      const chip = panel.getByRole('button', { name: 'Apply filter set Production' })
      await expect(chip).toHaveScreenshot(`saved-filter-${mode}.png`)
      await expect(trigger).toHaveScreenshot(`active-filter-${mode}.png`)
    })

    test('marketplace theme preview preserves its source colors', async ({ page }) => {
      await page.route(REGISTRY_URL, route => route.fulfill({ json: REGISTRY }))
      await page.route('https://api.github.com/search/issues**', route => route.fulfill({ json: { items: [] } }))
      await page.goto('/marketplace')
      const preview = page.getByText('Contrast Test Theme', { exact: true }).locator('../..')
      const authorAndSwatches = preview.getByText('KubeStellar', { exact: true }).locator('..')
      await expect(authorAndSwatches).toHaveScreenshot(`marketplace-theme-${mode}.png`)
    })

    test('ACMM badge preview remains readable', async ({ page }) => {
      await page.route('**/api/acmm/scan?**', route => route.fulfill({ contentType: 'text/html', body: '' }))
      await page.goto('/acmm')
      await page.getByRole('dialog', { name: /welcome to the ai codebase maturity model/i })
        .getByRole('button', { name: /close modal/i }).click()
      await page.getByRole('button', { name: 'Get badge' }).click()
      const badge = page.getByText(/^L\d+ · .+ · \d+\/\d+$/).locator('..')
      await expect(badge).toHaveScreenshot(`acmm-badge-${mode}.png`)
    })

    test('event donut legend stays visible', async ({ page }) => {
      await page.goto('/events')
      const chart = page.getByText('Event Types', { exact: true }).locator('..')
      await expect(chart.locator('svg').first()).toBeVisible()
      const warningSwatch = chart.getByText('Warnings', { exact: true }).locator('..').locator(':scope > div')
      await expect(warningSwatch).toHaveScreenshot(`event-donut-${mode}.png`)
    })
  })
}
