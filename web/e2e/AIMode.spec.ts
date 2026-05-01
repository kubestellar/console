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

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
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

      // Should have AI Usage Mode or AI-related settings - use more specific selector
      const aiSection = page.getByText(/ai.*mode|intelligence/i)
      // Verify at least one AI mode heading/label exists
      await expect(aiSection.first()).toBeVisible({ timeout: 5000 })
      
      // Verify the section contains actual mode selection buttons
      const modeButtons = page.getByRole('button', { name: /low|medium|high/i })
      await expect(modeButtons.first()).toBeVisible({ timeout: 5000 })
    })

    test('shows mode selection options', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Should show all three mode buttons (low, medium, high)
      const lowButton = page.getByRole('button', { name: /^low$/i })
      const mediumButton = page.getByRole('button', { name: /^medium$/i })
      const highButton = page.getByRole('button', { name: /^high$/i })
      
      // All three mode options should be visible
      await expect(lowButton.first()).toBeVisible({ timeout: 5000 })
      await expect(mediumButton.first()).toBeVisible({ timeout: 5000 })
      await expect(highButton.first()).toBeVisible({ timeout: 5000 })
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

      // Verify UI reflects the selected mode (not just localStorage)
      // Check for visual indicators: aria-selected, aria-pressed, or active class
      const isSelected = await lowOption.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isSelected).toBe(true)
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

      // Verify UI shows medium as selected
      const isSelected = await mediumOption.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isSelected).toBe(true)
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

      // Verify UI shows high as selected
      const isSelected = await highOption.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isSelected).toBe(true)
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
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Verify mode is still high in localStorage
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('high')

      // Verify UI still shows high mode as selected after reload
      const highOptionAfterReload = page.getByRole('button', { name: /high/i }).first()
      const isSelected = await highOptionAfterReload.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isSelected).toBe(true)
    })

    test('persists AI mode across navigation', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Set mode via UI interaction
      const lowOption = page.getByRole('button', { name: /low/i }).first()
      await expect(lowOption).toBeVisible({ timeout: 5000 })
      await lowOption.click()

      // Verify initial selection in UI
      const isInitiallySelected = await lowOption.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isInitiallySelected).toBe(true)

      // Navigate away
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Navigate back
      await page.goto('/settings')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Mode should still be persisted in storage
      const storedMode = await page.evaluate(() =>
        localStorage.getItem('kubestellar-ai-mode')
      )
      expect(storedMode).toBe('low')

      // UI should still reflect low mode as selected
      const lowOptionAfterNav = page.getByRole('button', { name: /low/i }).first()
      const isStillSelected = await lowOptionAfterNav.evaluate((el) => {
        return el.getAttribute('aria-selected') === 'true' ||
               el.getAttribute('aria-pressed') === 'true' ||
               el.classList.contains('active') ||
               el.classList.contains('selected') ||
               el.hasAttribute('data-selected')
      })
      expect(isStillSelected).toBe(true)
    })
  })

  test.describe('Accessibility', () => {
    test('mode buttons are keyboard accessible', async ({ page }) => {
      await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

      // Ensure at least one mode button is visible before testing keyboard nav
      const lowButton = page.getByRole('button', { name: /low/i }).first()
      await expect(lowButton).toBeVisible({ timeout: 5000 })

      // Tab through the page until we reach a mode selection button
      let foundModeButton = false
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab')
        
        // Check if the focused element is a mode selection button
        const focusedElement = page.locator(':focus')
        const focusedText = await focusedElement.textContent().catch(() => '')
        
        // Check if focused element is one of the AI mode buttons
        if (focusedText && /low|medium|high/i.test(focusedText)) {
          // Verify it's actually a button element
          const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase())
          expect(tagName).toBe('button')
          
          // Verify the button is visible and focusable
          await expect(focusedElement).toBeVisible()
          foundModeButton = true
          
          // Test that Enter/Space can activate the focused mode button
          const initialMode = await page.evaluate(() => localStorage.getItem('kubestellar-ai-mode'))
          await page.keyboard.press('Enter')
          
          // Wait a bit for the click to process
          await page.waitForTimeout(200)
          
          // Verify that activation changed the mode (or maintained it if already selected)
          const newMode = await page.evaluate(() => localStorage.getItem('kubestellar-ai-mode'))
          expect(newMode).toBeTruthy()
          expect(['low', 'medium', 'high']).toContain(newMode)
          break
        }
      }

      // Ensure we actually found and tested a mode button
      expect(foundModeButton).toBe(true)
    })
  })
})
