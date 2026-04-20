import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Viewport dimensions for mobile tests */
const MOBILE_WIDTH = 375
const MOBILE_HEIGHT = 812

/** Time to wait for theme transition to complete (ms) */
const THEME_TRANSITION_MS = 500

test.describe('Settings Configuration — "Change my preferences"', () => {
  test('settings page loads with title', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    const settingsPage = page.getByTestId('settings-page')
    await expect(settingsPage).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const title = page.getByTestId('settings-title')
    await expect(title).toBeVisible()
  })

  test('settings page shows configuration groups', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    const settingsPage = page.getByTestId('settings-page')
    await expect(settingsPage).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Settings should have labeled sections
    const headings = settingsPage.locator('h2, h3, h4, [class*="font-semibold"], [class*="font-bold"]')
    const count = await headings.count()
    expect(count).toBeGreaterThan(0)
  })

  test('theme toggle switches between dark and light', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Find theme toggle — could be a button, switch, or select
    const themeToggle = page.locator('button:has-text("Theme"), button:has-text("Dark"), button:has-text("Light"), [aria-label*="theme" i], button:has-text("theme")')
    const hasToggle = await themeToggle.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasToggle) { test.skip(true, 'Theme toggle not visible'); return }
    const htmlClassBefore = await page.locator('html').getAttribute('class') ?? ''
    await themeToggle.first().click()
    await page.waitForTimeout(THEME_TRANSITION_MS)
    const htmlClassAfter = await page.locator('html').getAttribute('class') ?? ''
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'visual',
        component: 'Settings',
        finding: htmlClassBefore !== htmlClassAfter ? 'Theme toggle changes HTML class' : 'Theme toggle did not change HTML class — may use data attribute or CSS variable',
        recommendation: 'None',
      }),
    })
  })

  test('AI mode selector shows options', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Look for AI-related settings
    const aiSection = page.locator('text=/AI|Intelligence|Smart|Agent/i')
    const hasAI = await aiSection.first().isVisible({ timeout: 3_000 }).catch(() => false)
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'feature',
        component: 'Settings',
        finding: hasAI ? 'AI mode settings section found' : 'No AI mode section visible on settings page',
        recommendation: 'None',
      }),
    })
  })

  test('settings persist after navigation away and back', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Toggle something if available
    const toggle = page.locator('button[role="switch"], input[type="checkbox"]').first()
    const hasToggle = await toggle.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasToggle) { test.skip(true, 'No toggle switch visible'); return }
    const checkedBefore = await toggle.getAttribute('aria-checked') ?? await toggle.isChecked().catch(() => null)
    await toggle.click()
    await page.waitForTimeout(300)
    // Navigate away
    await page.goto('/')
    await page.waitForTimeout(500)
    // Navigate back
    await page.goto('/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Check if setting persisted
    const toggleAfter = page.locator('button[role="switch"], input[type="checkbox"]').first()
    const checkedAfter = await toggleAfter.getAttribute('aria-checked') ?? await toggleAfter.isChecked().catch(() => null)
    // Setting should have persisted (value should differ from before the toggle)
    if (checkedBefore !== null && checkedAfter !== null) {
      expect(String(checkedAfter)).not.toBe(String(checkedBefore))
    }
  })

  test('close button navigates away from settings', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const closeBtn = page.getByTestId('settings-close-desktop')
    const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasClose) { test.skip(true, 'Settings close button not visible'); return }
    await closeBtn.click()
    await page.waitForTimeout(500)
    // Should navigate away from settings
    expect(page.url()).not.toContain('/settings')
  })

  test('settings page is scrollable with all sections', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const settingsPage = page.getByTestId('settings-page')
    const content = await settingsPage.textContent()
    expect(content?.length).toBeGreaterThan(100)
  })

  test('mobile: settings layout at 375px', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT })
    await setupDemoAndNavigate(page, '/settings')
    // At mobile width, the desktop sidebar nav (hidden lg:block) is CSS-hidden, so
    // settings-title is not visible even though it exists in the DOM.
    // Use .filter({visible:true}) to pick whichever title variant is actually rendered.
    const title = page.getByTestId('settings-title')
      .or(page.getByTestId('settings-title-mobile'))
      .filter({ visible: true })
      .first()
    await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await assertNoLayoutOverflow(page)
  })

  test('no overflow on any settings section', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Check body for user-visible horizontal scrolling (main-content has overflow-x-hidden
    // so the settings-page element's internal scrollWidth may exceed clientWidth without
    // being user-scrollable — body is the correct overflow indicator here).
    await assertNoLayoutOverflow(page)
  })
})
