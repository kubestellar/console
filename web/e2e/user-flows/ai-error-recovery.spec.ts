import { test, expect } from '@playwright/test'

test.describe('AI Error Recovery & Bug Discovery (LFX Prototype)', () => {
  test('intercepts a critical backend failure and validates AI recovery UI', async ({ page }) => {
    // 1. Intercept the core clusters API to simulate a catastrophic network failure
    // This perfectly mirrors the 'network' classification in errorClassifier.ts
    await page.route('**/api/v1/clusters**', async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          errorType: 'network',
          message: 'dial tcp: lookup my-cluster.internal failed: no such host'
        })
      })
    })

    // 2. Navigate to the dashboard
    await page.goto('/')

    // 3. Verify the AppErrorBoundary or specific error card caught the failure
    // We expect the UI to show the network error icon (XCircle) or related text
    // as defined in errorClassifier.ts
    const errorContainer = page.locator('text=Something went wrong').or(page.locator('text=no such host'))
    await expect(errorContainer.first()).toBeVisible({ timeout: 10000 })

    // 4. Verify the AI-driven actionable suggestion is displayed
    // The errorClassifier maps this specific error to "Check network connectivity and firewall settings"
    const suggestionText = page.locator('text=Check network connectivity and firewall settings')
    await expect(suggestionText).toBeVisible()

    // 5. Verify recovery options are present
    const retryButton = page.locator('button:has-text("Try again")')
    await expect(retryButton).toBeVisible()
    
    // 6. Fix the network route to return success
    await page.route('**/api/v1/clusters**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }) // Empty clusters list
      })
    })

    // 7. Click retry and verify the error state clears
    await retryButton.click()
    
    // The error suggestion should disappear as the app recovers
    await expect(suggestionText).not.toBeVisible()
  })
})
