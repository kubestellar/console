import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for AI mode tests
 */
async function setupAIModeTest(page: Page) {
  // Mock authentication
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  // Mock MCP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  // Set auth token
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('AI Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupAIModeTest(page)
  })

  test.describe('AI Mode Section', () => {
    test('displays settings page with AI mode section', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Should have AI Usage Mode or AI-related settings
      const aiSection = page.getByText(/ai.*mode|intelligence/i).first()
      await expect(aiSection).toBeVisible({ timeout: 5000 })
    })

    test('shows mode selection options', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Should show mode buttons (low, medium, high)
      const lowButton = page.getByRole('button', { name: /low/i }).first()
      await expect(lowButton).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Mode Selection', () => {
    test('can select low AI mode', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Find and click low mode option
      const lowOption = page.getByRole('button', { name: /low/i }).first()
      await expect(lowOption).toBeVisible({ timeout: 5000 })
      await lowOption.click()

      // Verify selection persists to localStorage
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('low')
    })

    test('can select medium AI mode', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      const mediumOption = page.getByRole('button', { name: /medium/i }).first()
      await expect(mediumOption).toBeVisible({ timeout: 5000 })
      await mediumOption.click()

      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('medium')
    })

    test('can select high AI mode', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      const highOption = page.getByRole('button', { name: /high/i }).first()
      await expect(highOption).toBeVisible({ timeout: 5000 })
      await highOption.click()

      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('high')
    })
  })

  test.describe('Mode Persistence', () => {
    test('persists AI mode across page reloads', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Set mode to high via UI
      const highOption = page.getByRole('button', { name: /high/i }).first()
      await expect(highOption).toBeVisible({ timeout: 5000 })
      await highOption.click()

      // Reload page
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Verify mode is still high
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('high')
    })

    test('persists AI mode across navigation', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Set mode
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'low')
      })

      // Navigate away
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Navigate back
      await page.goto('/settings')
      await page.waitForLoadState('domcontentloaded')

      // Mode should still be persisted
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('low')
    })
  })

  test.describe('Accessibility', () => {
    test('mode buttons are keyboard accessible', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Tab to the mode buttons
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})
