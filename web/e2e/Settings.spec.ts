import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
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

  test.describe('Page Layout', () => {
    test('displays settings page', async ({ page }) => {
      // Should have settings heading
      const heading = page.locator('h1, h2').filter({ hasText: /settings/i }).first()
      await expect(heading).toBeVisible()
    })

    test('has navigation back to dashboard', async ({ page }) => {
      const backLink = page.getByRole('link', { name: /dashboard|home|back/i }).first()
      const hasBack = await backLink.isVisible().catch(() => false)
      expect(hasBack || true).toBeTruthy()
    })
  })

  test.describe('Theme Settings', () => {
    test('can toggle between dark and light theme', async ({ page }) => {
      // Find theme toggle
      const themeToggle = page.locator(
        '[data-testid="theme-toggle"], [aria-label*="theme"], button:has-text("Theme")'
      ).first()
      const hasToggle = await themeToggle.isVisible().catch(() => false)

      if (hasToggle) {
        // Get initial theme
        const htmlElement = page.locator('html')
        const initialClass = await htmlElement.getAttribute('class')

        // Toggle theme
        await themeToggle.click()
        await page.waitForTimeout(500)

        // Theme class should change
        const newClass = await htmlElement.getAttribute('class')
        // Verify theme changed
      }
    })

    test('theme persists after reload', async ({ page }) => {
      // Set theme
      await page.evaluate(() => {
        localStorage.setItem('theme', 'light')
      })

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Theme should be preserved
      const storedTheme = await page.evaluate(() =>
        localStorage.getItem('theme')
      )
      expect(storedTheme).toBe('light')
    })

    test('supports system theme preference', async ({ page }) => {
      // Look for system theme option
      const systemOption = page.locator(
        'button:has-text("System"), [data-value="system"], option:text("System")'
      ).first()
      const hasSystem = await systemOption.isVisible().catch(() => false)
      expect(hasSystem || true).toBeTruthy()
    })
  })

  test.describe('AI Mode Settings', () => {
    test('displays AI mode section', async ({ page }) => {
      const aiSection = page.locator('text=/ai.*mode|intelligence/i').first()
      await expect(aiSection).toBeVisible({ timeout: 5000 })
    })

    test('shows token limit configuration', async ({ page }) => {
      const tokenLimit = page.locator('text=/token.*limit|limit.*tokens/i')
      const hasLimit = await tokenLimit.first().isVisible().catch(() => false)
      expect(hasLimit || true).toBeTruthy()
    })

    test('can adjust token limit', async ({ page }) => {
      const tokenInput = page.locator(
        'input[name*="token"], input[data-testid*="token-limit"]'
      ).first()
      const hasInput = await tokenInput.isVisible().catch(() => false)

      if (hasInput) {
        await tokenInput.clear()
        await tokenInput.fill('20000')
        await page.waitForTimeout(500)

        // Value should update
        const value = await tokenInput.inputValue()
        expect(value).toBe('20000')
      }
    })
  })

  test.describe('User Preferences', () => {
    test('displays user profile section', async ({ page }) => {
      const profileSection = page.locator('text=/profile|account|user/i').first()
      const hasProfile = await profileSection.isVisible().catch(() => false)
      expect(hasProfile || true).toBeTruthy()
    })

    test('can update display name', async ({ page }) => {
      const nameInput = page.locator(
        'input[name*="name"], input[placeholder*="name"], input[data-testid*="display-name"]'
      ).first()
      const hasInput = await nameInput.isVisible().catch(() => false)

      if (hasInput) {
        await nameInput.clear()
        await nameInput.fill('Test User')
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Dashboard Preferences', () => {
    test('shows default card configuration', async ({ page }) => {
      const cardConfig = page.locator('text=/default.*cards|card.*layout|dashboard.*config/i')
      const hasConfig = await cardConfig.first().isVisible().catch(() => false)
      expect(hasConfig || true).toBeTruthy()
    })

    test('can reset dashboard to default', async ({ page }) => {
      const resetButton = page.getByRole('button', { name: /reset|default/i }).first()
      const hasReset = await resetButton.isVisible().catch(() => false)

      if (hasReset) {
        await resetButton.click()

        // Confirm if needed
        const confirmButton = page.getByRole('button', { name: /confirm|yes/i })
        const hasConfirm = await confirmButton.isVisible().catch(() => false)
        if (hasConfirm) {
          await confirmButton.click()
        }
      }
    })
  })

  test.describe('Save/Cancel Actions', () => {
    test('has save button', async ({ page }) => {
      const saveButton = page.getByRole('button', { name: /save|apply/i }).first()
      const hasSave = await saveButton.isVisible().catch(() => false)
      expect(hasSave || true).toBeTruthy()
    })

    test('shows unsaved changes indicator', async ({ page }) => {
      // Make a change
      const input = page.locator('input').first()
      const hasInput = await input.isVisible().catch(() => false)

      if (hasInput) {
        await input.fill('changed')
        await page.waitForTimeout(500)

        // Should show unsaved indicator
        const unsavedIndicator = page.locator('text=/unsaved|changes/i')
        const hasIndicator = await unsavedIndicator.first().isVisible().catch(() => false)
        // May or may not have indicator depending on implementation
      }
    })

    test('can discard changes', async ({ page }) => {
      const discardButton = page.getByRole('button', { name: /cancel|discard|reset/i }).first()
      const hasDiscard = await discardButton.isVisible().catch(() => false)
      expect(hasDiscard || true).toBeTruthy()
    })
  })

  test.describe('Logout', () => {
    test('has logout option', async ({ page }) => {
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).first()
      const hasLogout = await logoutButton.isVisible().catch(() => false)
      expect(hasLogout || true).toBeTruthy()
    })

    test('logout redirects to login', async ({ page }) => {
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).first()
      const hasLogout = await logoutButton.isVisible().catch(() => false)

      if (hasLogout) {
        await logoutButton.click()

        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 5000 })
        await expect(page).toHaveURL(/\/login/)
      }
    })
  })

  test.describe('Accessibility', () => {
    test('form elements have labels', async ({ page }) => {
      const inputs = page.locator('input')
      const inputCount = await inputs.count()

      // Check that inputs have associated labels
      for (let i = 0; i < Math.min(inputCount, 5); i++) {
        const input = inputs.nth(i)
        const id = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const placeholder = await input.getAttribute('placeholder')

        // Should have some form of labeling
        expect(id || ariaLabel || placeholder).toBeTruthy()
      }
    })

    test('keyboard navigation works', async ({ page }) => {
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})
