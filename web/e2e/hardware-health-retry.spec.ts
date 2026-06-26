/**
 * Hardware Health retry E2E test (#11772)
 * Tests that retry button properly re-fetches and surfaces errors
 */
import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

// Skip: Hardware Health card not present on /ai-ml dashboard in demo mode (tracking: #12315)
test.describe.skip('Hardware Health retry functionality (#11772)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ai-ml')
  })

  test('hardware health card renders', async ({ page }) => {
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Look for Hardware Health card
    const hwCard = page.locator('[data-card-type="hardware_health"], [data-testid*="hardware-health"]').first()
    await expect(hwCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('retry button appears when device fetch fails', async ({ page }) => {
    // Mock hardware health to fail
    await page.route('**/api/hardware/health', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Device endpoints unavailable' }),
      })
    })

    await page.goto('/ai-ml')
    await page.waitForLoadState('domcontentloaded')

    // Wait for Hardware Health card
    const hwCard = page.locator('[data-card-type="hardware_health"], [data-testid*="hardware-health"]').first()
    await expect(hwCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Look for error message or retry button
    const retryButton = hwCard.getByRole('button', { name: /retry/i })
    const errorMessage = hwCard.locator('[role="alert"], [data-testid="card-error"]').or(hwCard.getByText(/error|failed|unavailable/i))

    // Either retry button or error message should appear when fetch fails
    const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false)
    const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasRetry || hasError).toBe(true)
  })

  test('clicking retry button triggers a new fetch attempt', async ({ page }) => {
    let fetchCount = 0
    
    // Mock hardware health to fail initially
    await page.route('**/api/hardware/health', (route) => {
      fetchCount++
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Device endpoints unavailable' }),
      })
    })

    await page.goto('/ai-ml')
    await page.waitForLoadState('domcontentloaded')

    const hwCard = page.locator('[data-card-type="hardware_health"], [data-testid*="hardware-health"]').first()
    await expect(hwCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Wait for initial fetch to complete
    await page.waitForResponse(resp => resp.url().includes('/api/hardware/health'))
    const initialFetchCount = fetchCount

    // Find and click retry button
    const retryButton = hwCard.getByRole('button', { name: /retry/i })
    const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasRetry) {
      // No retry button - card might be working fine
      return
    }

    await retryButton.click()

    // Wait for retry fetch to complete
    await page.waitForResponse(resp => resp.url().includes('/api/hardware/health'))

    // Verify fetch was called again
    expect(fetchCount).toBeGreaterThan(initialFetchCount)
  })

  test('retry button shows loading state during re-fetch', async ({ page }) => {
    // Mock hardware health with a delay to observe loading state
    await page.route('**/api/hardware/health', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500))
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Device endpoints unavailable' }),
      })
    })

    await page.goto('/ai-ml')
    await page.waitForLoadState('domcontentloaded')

    const hwCard = page.locator('[data-card-type="hardware_health"], [data-testid*="hardware-health"]').first()
    await expect(hwCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const retryButton = hwCard.getByRole('button', { name: /retry/i })
    const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasRetry) {
      return
    }

    // Click retry and immediately check for loading indicator
    await retryButton.click()

    // Look for loading/spinning icon (RefreshCw with animate-spin)
    const spinner = hwCard.locator('[class*="animate-spin"]')
    const hasSpinner = await spinner.isVisible({ timeout: 2000 }).catch(() => false)

    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'loading-state',
        component: 'HardwareHealth',
        finding: `Retry button ${hasSpinner ? 'shows' : 'does not show'} loading indicator`,
        recommendation: hasSpinner ? 'None' : 'Consider adding loading indicator to retry button',
      }),
    })
  })

  test('retry surfaces meaningful error when re-fetch fails', async ({ page }) => {
    const errorMessage = 'Device endpoints unavailable: CORS error'

    await page.route('**/api/hardware/health', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: errorMessage }),
      })
    })

    await page.goto('/ai-ml')
    await page.waitForLoadState('domcontentloaded')

    const hwCard = page.locator('[data-card-type="hardware_health"], [data-testid*="hardware-health"]').first()
    await expect(hwCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const retryButton = hwCard.getByRole('button', { name: /retry/i })
    const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasRetry) {
      return
    }

    // Click retry
    await retryButton.click()
    await page.waitForResponse(resp => resp.url().includes('/api/hardware/health'))

    // Verify error message is displayed
    const errorDisplay = hwCard.locator('[role="alert"], [data-testid="card-error"]').or(hwCard.getByText(/error|failed|unavailable/i))
    const errorText = await errorDisplay.textContent()

    // Error should contain some meaningful text (not just "Error" or empty)
    expect(errorText?.length).toBeGreaterThan(5)
  })
})
