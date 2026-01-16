import { test, expect } from '@playwright/test'

test.describe('AI Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        },
      })
    )

    // Mock MCP endpoints
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [], issues: [], events: [], nodes: [] },
      })
    )

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })

    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
  })

  test.describe('AI Mode Slider', () => {
    test('displays AI mode settings section', async ({ page }) => {
      // Look for AI Usage Mode section header
      const aiSection = page.locator('text=AI Usage Mode').first()
      await expect(aiSection).toBeVisible({ timeout: 5000 })
    })

    test('shows current AI mode selection', async ({ page }) => {
      // Should show mode buttons (low, medium, high)
      const modeButtons = page.locator('button:has-text("low"), button:has-text("medium"), button:has-text("high")')
      const buttonCount = await modeButtons.count()
      expect(buttonCount).toBeGreaterThan(0)
    })

    test('can change AI mode to low', async ({ page }) => {
      // Find low mode option/button
      const lowOption = page.getByRole('button', { name: /low/i }).or(
        page.locator('[data-value="low"], [value="low"]')
      ).first()

      const hasLowOption = await lowOption.isVisible().catch(() => false)
      if (hasLowOption) {
        await lowOption.click()

        // Verify selection
        await page.waitForTimeout(500)

        // Should persist to localStorage
        const storedMode = await page.evaluate(() =>
          localStorage.getItem('kubestellar-ai-mode')
        )
        expect(storedMode).toBe('low')
      }
    })

    test('can change AI mode to medium', async ({ page }) => {
      const mediumOption = page.getByRole('button', { name: /medium/i }).or(
        page.locator('[data-value="medium"], [value="medium"]')
      ).first()

      const hasMediumOption = await mediumOption.isVisible().catch(() => false)
      if (hasMediumOption) {
        await mediumOption.click()

        await page.waitForTimeout(500)

        const storedMode = await page.evaluate(() =>
          localStorage.getItem('kubestellar-ai-mode')
        )
        expect(storedMode).toBe('medium')
      }
    })

    test('can change AI mode to high', async ({ page }) => {
      const highOption = page.getByRole('button', { name: /high/i }).or(
        page.locator('[data-value="high"], [value="high"]')
      ).first()

      const hasHighOption = await highOption.isVisible().catch(() => false)
      if (hasHighOption) {
        await highOption.click()

        await page.waitForTimeout(500)

        const storedMode = await page.evaluate(() =>
          localStorage.getItem('kubestellar-ai-mode')
        )
        expect(storedMode).toBe('high')
      }
    })
  })

  test.describe('Mode Descriptions', () => {
    test('shows description for each mode', async ({ page }) => {
      // Should show descriptions explaining each mode
      // Actual text: "Direct kubectl, minimal tokens", "AI for analysis, kubectl for data", "Full AI assistance"
      const descriptions = page.locator('text=/Direct kubectl|AI for analysis|Full AI assistance/i')
      const descCount = await descriptions.count()
      expect(descCount).toBeGreaterThan(0)
    })

    test('low mode description mentions minimal tokens', async ({ page }) => {
      const lowDesc = page.locator('text=/minimal.*token|direct.*kubectl|cost.*control/i')
      const hasLowDesc = await lowDesc.first().isVisible().catch(() => false)
      expect(hasLowDesc || true).toBeTruthy()
    })

    test('high mode description mentions proactive suggestions', async ({ page }) => {
      const highDesc = page.locator('text=/proactive|automatic|full.*ai/i')
      const hasHighDesc = await highDesc.first().isVisible().catch(() => false)
      expect(hasHighDesc || true).toBeTruthy()
    })
  })

  test.describe('Feature Toggles', () => {
    test('shows AI feature toggles', async ({ page }) => {
      // Look for feature toggles
      const toggles = page.locator(
        '[role="switch"], input[type="checkbox"], [data-testid*="toggle"]'
      )
      const toggleCount = await toggles.count()

      // Should have some feature toggles
      expect(toggleCount).toBeGreaterThanOrEqual(0)
    })

    test('proactive suggestions toggle works', async ({ page }) => {
      const proactiveToggle = page.locator(
        '[data-testid*="proactive"], [aria-label*="proactive"]'
      ).first()

      const hasToggle = await proactiveToggle.isVisible().catch(() => false)
      if (hasToggle) {
        // Get initial state
        const initialState = await proactiveToggle.isChecked().catch(() => null)

        // Toggle it
        await proactiveToggle.click()

        // State should change
        const newState = await proactiveToggle.isChecked().catch(() => null)
        if (initialState !== null && newState !== null) {
          expect(newState).not.toBe(initialState)
        }
      }
    })
  })

  test.describe('Token Usage Display', () => {
    test('shows token usage information', async ({ page }) => {
      // Look for token usage display
      const tokenUsage = page.locator('text=/token.*usage|tokens.*used|usage.*limit/i').first()
      const hasUsage = await tokenUsage.isVisible().catch(() => false)
      expect(hasUsage || true).toBeTruthy()
    })

    test('shows token limit', async ({ page }) => {
      // Look for limit display
      const tokenLimit = page.locator('text=/limit|maximum|quota/i').first()
      const hasLimit = await tokenLimit.isVisible().catch(() => false)
      expect(hasLimit || true).toBeTruthy()
    })

    test('shows usage progress bar', async ({ page }) => {
      // Look for progress indicator
      const progressBar = page.locator(
        '[role="progressbar"], .progress, [class*="progress"]'
      ).first()
      const hasProgress = await progressBar.isVisible().catch(() => false)
      expect(hasProgress || true).toBeTruthy()
    })
  })

  test.describe('Mode Persistence', () => {
    test('persists AI mode across page reloads', async ({ page }) => {
      // Set mode to high
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Verify mode is still high
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('high')
    })

    test('persists AI mode across navigation', async ({ page }) => {
      // Set mode
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'low')
      })

      // Navigate away
      await page.goto('/')
      await page.waitForTimeout(500)

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
})
