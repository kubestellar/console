import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const APP_ERROR_TEST_TOKEN = 'synthetic-app-error'
const APP_ERROR_TEST_MESSAGE = 'Synthetic AppErrorBoundary crash'

test.describe('AppErrorBoundary E2E (LFX Prototype)', () => {
  test('recovers from a synthetic app-level render crash', async ({ page }) => {
    await setupDemoMode(page)
    await page.goto(`/?__e2e_app_error=${APP_ERROR_TEST_TOKEN}`, {
      waitUntil: 'domcontentloaded',
    })

    const errorTitle = page.getByText('Something went wrong')
    await expect(errorTitle).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(APP_ERROR_TEST_MESSAGE)).toBeVisible()

    const retryButton = page.getByRole('button', { name: /Try again/i })
    await expect(retryButton).toBeVisible()
    await page.evaluate(() => {
      window.history.replaceState({}, '', '/')
    })
    await retryButton.click()

    await expect(errorTitle).not.toBeVisible()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })
})
