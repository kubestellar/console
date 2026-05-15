import { test, expect } from '@playwright/test'

test.describe('AppErrorBoundary E2E (LFX Prototype)', () => {
  test('recovers from a React render crash triggered by malformed data', async ({ page }) => {
    // 1. Intercept clusters API to return data that causes a render crash
    // AppErrorBoundary catches these synchronous React render errors.
    await page.route('**/api/v1/clusters**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          // Returning null for an expected array triggers a "Cannot read properties of null (reading 'map')"
          // error during component rendering, which AppErrorBoundary is designed to catch.
          items: null 
        })
      })
    })

    // 2. Navigate to the dashboard
    await page.goto('/')

    // 3. Verify AppErrorBoundary caught the crash and rendered fallback UI
    const errorTitle = page.getByText('Something went wrong')
    await expect(errorTitle).toBeVisible({ timeout: 15000 })
    
    const crashMessage = page.getByText(/Cannot read properties of null/i).or(page.getByText(/items\.map is not a function/i))
    await expect(crashMessage).toBeVisible()

    // 4. Verify recovery options are present
    const retryButton = page.getByRole('button', { name: /Try again/i })
    await expect(retryButton).toBeVisible()
    
    // 5. Fix the network route to return valid data
    await page.route('**/api/v1/clusters**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] })
      })
    })

    // 6. Click "Try again" and verify the app recovers
    await retryButton.click()
    
    // Fallback UI should disappear
    await expect(errorTitle).not.toBeVisible()
    
    // App should be back to normal
    await expect(page.getByText('Clusters')).toBeVisible()
  })
})
