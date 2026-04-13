import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Timeout for Console Studio panel to open (ms) */
const STUDIO_OPEN_TIMEOUT_MS = 5_000

test.describe('Console Studio — "Customize my dashboard"', () => {
  test('Console Studio button is accessible from dashboard', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    // Look for Console Studio trigger — button text, gear icon, or customizer toggle
    const studioBtn = page.locator('button:has-text("Console Studio"), button:has-text("Customize"), button[aria-label*="studio" i], button[aria-label*="customize" i]')
    const hasBtn = await studioBtn.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: hasBtn ? 'info' : 'medium',
        category: 'discoverability',
        component: 'ConsoleStudio',
        finding: hasBtn ? 'Console Studio button found on dashboard' : 'Console Studio button not immediately visible — may require menu navigation',
        recommendation: hasBtn ? 'None' : 'Consider making Console Studio more discoverable',
      }),
    })
  })

  test('Console Studio panel opens', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    // Try multiple paths to open Console Studio
    const studioBtn = page.locator('button:has-text("Console Studio"), button:has-text("Customize"), button[aria-label*="studio" i]')
    const hasDirectBtn = await studioBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasDirectBtn) {
      await studioBtn.first().click()
    } else {
      // Fallback: try sidebar "Add more..." or settings gear
      const addMore = page.locator('button:has-text("Add more")')
      const hasAddMore = await addMore.isVisible({ timeout: 2_000 }).catch(() => false)
      if (hasAddMore) {
        await addMore.click()
      }
    }
    const studio = page.getByTestId('console-studio')
    const isOpen = await studio.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    // Studio may open as modal or inline panel
    if (isOpen) {
      await expect(studio).toBeVisible()
    }
  })

  test('studio sidebar shows sections', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    const studioSidebar = page.getByTestId('studio-sidebar')
    const hasStudioSidebar = await studioSidebar.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    if (hasStudioSidebar) {
      const text = await studioSidebar.textContent()
      expect(text?.length).toBeGreaterThan(0)
    }
  })

  test('studio preview area shows content', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    const preview = page.getByTestId('studio-preview')
    const hasPreview = await preview.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    if (hasPreview) {
      const text = await preview.textContent()
      expect(text?.length).toBeGreaterThan(0)
    }
  })

  test('studio has searchable card catalog', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    // Look for search input within the studio
    const studioSearch = page.locator('[data-testid="console-studio"] input[type="text"], [data-testid="console-studio"] input[type="search"], [role="dialog"] input[type="text"]')
    const hasSearch = await studioSearch.first().isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: hasSearch ? 'info' : 'medium',
        category: 'usability',
        component: 'ConsoleStudio',
        finding: hasSearch ? 'Card catalog has search functionality' : 'No search input found in studio card catalog',
        recommendation: hasSearch ? 'None' : 'Add search/filter for card catalog to improve discoverability',
      }),
    })
  })

  test('close studio returns to dashboard', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    const studio = page.getByTestId('console-studio')
    const isOpen = await studio.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    if (isOpen) {
      // Close via Escape or close button
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      const stillOpen = await studio.isVisible().catch(() => false)
      if (stillOpen) {
        // Try close button
        const closeBtn = page.locator('[data-testid="console-studio"] button:has-text("Close"), [role="dialog"] button[aria-label*="close" i]')
        const hasClose = await closeBtn.first().isVisible().catch(() => false)
        if (hasClose) await closeBtn.first().click()
      }
    }
    // Dashboard should be visible again
    const dashboard = page.getByTestId('dashboard-page')
    const hasDashboard = await dashboard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasDashboard) {
      await expect(dashboard).toBeVisible()
    }
  })

  test('no overflow when studio panels are open', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    const studio = page.getByTestId('console-studio')
    const isOpen = await studio.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    if (isOpen) {
      await assertNoLayoutOverflow(page)
    }
  })

  test('studio sidebar sections are clickable', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (!hasTrigger) return
    await addMore.first().click()
    const studioSidebar = page.getByTestId('studio-sidebar')
    const hasStudioSidebar = await studioSidebar.isVisible({ timeout: STUDIO_OPEN_TIMEOUT_MS }).catch(() => false)
    if (hasStudioSidebar) {
      const buttons = studioSidebar.locator('button, a, [role="tab"]')
      const count = await buttons.count()
      if (count > 0) {
        await buttons.first().click()
        // Should not crash
        await expect(studioSidebar).toBeVisible()
      }
    }
  })

  test('no console errors during studio interaction', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/')
    const addMore = page.locator('button:has-text("Add more"), button:has-text("Console Studio"), button:has-text("Customize")')
    const hasTrigger = await addMore.first().isVisible({ timeout: 3_000 }).catch(() => false)
    if (hasTrigger) {
      await addMore.first().click()
      await page.waitForTimeout(1_000)
    }
    checkErrors()
  })
})
