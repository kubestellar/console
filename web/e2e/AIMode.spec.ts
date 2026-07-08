import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from './helpers/setup'

const SETTINGS_PAGE_TIMEOUT_MS = 45_000
const SECTION_TIMEOUT_MS = 10_000

/**
 * Sets up authentication and MCP mocks for AI mode tests
 */
async function setupAIModeTest(page: Page) {
  await setupDemoMode(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('kc-update-toast-seen', '1')
    localStorage.setItem('kc-hints-suppressed', 'true')
  })
  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
  await waitForSettingsPage(page)
}

async function waitForSettingsPage(page: Page) {
  const settingsPage = page.getByTestId('settings-page')
  await expect(settingsPage).toBeVisible({ timeout: SETTINGS_PAGE_TIMEOUT_MS })
  await expect(
    settingsPage.getByRole('heading', { name: /^AI Usage Mode$/i })
  ).toBeVisible({ timeout: SECTION_TIMEOUT_MS })
  return settingsPage
}

test.describe('AI Mode Settings', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    await setupAIModeTest(page)
  })

  test.describe('AI Mode Section', () => {
    test('displays settings page with AI mode section', async ({ page }) => {
      const settingsPage = await waitForSettingsPage(page)

      // Verify the section contains actual mode selection buttons
      const modeButtons = settingsPage.getByRole('group', { name: /^AI Usage Mode$/i })
        .getByRole('button', { name: /low|medium|high/i })
      await expect(modeButtons.first()).toBeVisible({ timeout: 5000 })
    })

    test('shows mode selection options', async ({ page }) => {
      await waitForSettingsPage(page)

      // Should show all three mode buttons (low, medium, high)
      const lowButton = page.getByRole('button', { name: /^low/i })
      const mediumButton = page.getByRole('button', { name: /^medium/i })
      const highButton = page.getByRole('button', { name: /^high/i })
      
      // All three mode options should be visible
      await expect(lowButton.first()).toBeVisible({ timeout: 5000 })
      await expect(mediumButton.first()).toBeVisible({ timeout: 5000 })
      await expect(highButton.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Mode Selection', () => {
    test('can select low AI mode', async ({ page }) => {
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

      // Set mode to high via UI
      const highOption = page.getByRole('button', { name: /high/i }).first()
      await expect(highOption).toBeVisible({ timeout: 5000 })
      await highOption.click()

      // Reload page
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

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
      await waitForSettingsPage(page)

      const lowButton = page.getByRole('button', { name: /low/i }).first()
      await expect(lowButton).toBeVisible({ timeout: 5000 })

      await lowButton.focus()
      await expect(lowButton).toBeFocused()
      await page.keyboard.press('Enter')

      await expect.poll(
        async () => page.evaluate(() => localStorage.getItem('kubestellar-ai-mode')),
        { timeout: 2000 }
      ).toBe('low')

      await expect(lowButton).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
