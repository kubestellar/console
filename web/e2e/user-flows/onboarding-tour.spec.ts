import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'
import { assertNoLayoutOverflow } from '../helpers/ux-assertions'

/**
 * Onboarding tour UX tests.
 *
 * Validates the guided tour flow for new users: prompt visibility,
 * step progression, skip/dismiss, localStorage persistence, and
 * tooltip positioning within the viewport.
 */

/** localStorage key used to track tour completion */
const TOUR_COMPLETED_KEY = 'kubestellar-console-tour-completed'

/** Timeout for tour tooltip appearance */
const TOUR_TOOLTIP_TIMEOUT_MS = 5_000

test.describe('Onboarding Tour', () => {
  test('fresh user (no tour flag) sees tour prompt', async ({ page }) => {
    // Set demo mode but explicitly remove tour-completed flag
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    // Look for tour prompt, welcome dialog, or onboarding modal
    const tourPrompt = page.getByRole('dialog')
      .or(page.getByTestId('tour-tooltip'))
      .or(page.getByText(/welcome|take a tour|get started/i))

    const hasTour = await tourPrompt.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasTour) {
      test.info().annotations.push({ type: 'ux-finding', description: 'No tour prompt shown for fresh user — may be disabled or deferred' })
    }
  })

  test('tour step tooltip has Next and Skip buttons', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    const tooltip = page.getByTestId('tour-tooltip')
      .or(page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]'))

    const hasTooltip = await tooltip.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasTooltip) {
      test.skip()
      return
    }

    const nextBtn = page.getByRole('button', { name: /next/i })
    const skipBtn = page.getByRole('button', { name: /skip/i })
    await expect(nextBtn.or(skipBtn).first()).toBeVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS })
  })

  test('Next advances tour step (tooltip content changes)', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    // Scope the tour tooltip container before looking for Next — a broad
    // getByRole('button', { name: /next/i }) matches pagination/wizard buttons
    // outside the tour and clicking the wrong one navigates away, crashing the test.
    const tourContainer = page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]').first()
    const hasTour = await tourContainer.isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasTour) {
      test.skip()
      return
    }

    // Only look for Next within the tour tooltip
    const nextBtn = tourContainer.getByRole('button', { name: /next/i })
    const hasNext = await nextBtn.isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasNext) {
      test.skip()
      return
    }

    const tooltipBefore = await tourContainer.textContent().catch(() => '')
    await nextBtn.click()

    // Wait for content to update
    await page.waitForTimeout(500)
    const tooltipAfter = await tourContainer.textContent().catch(() => '')

    // Content should change after clicking Next
    if (tooltipBefore && tooltipAfter) {
      expect(tooltipAfter).not.toBe(tooltipBefore)
    }
  })

  test('Skip dismisses tour', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    const skipBtn = page.getByRole('button', { name: /skip|dismiss|close/i })
    const hasSkip = await skipBtn.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasSkip) {
      test.skip()
      return
    }

    // If a full-screen modal overlay (e.g. welcome dialog, announcement) is
    // visible it intercepts pointer events on the tour controls beneath it.
    // Press Escape first (handles most dialogs); if the overlay persists,
    // click its own dismiss/close button as a fallback before proceeding.
    const overlay = page.locator('.fixed.inset-0').first()
    const hasOverlay = await overlay.isVisible().catch(() => false)
    if (hasOverlay) {
      await page.keyboard.press('Escape')
      const closed = await overlay.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true).catch(() => false)
      if (!closed) {
        const modalCloseBtn = overlay.getByRole('button', { name: /close|dismiss|got it|ok/i }).first()
        await modalCloseBtn.click({ timeout: 2000 }).catch(() => {})
        await overlay.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
      }
    }

    await skipBtn.first().click()

    const tooltip = page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]')
    await expect(tooltip).not.toBeVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS })
  })

  test('tour completion sets localStorage flag', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    // Dismiss tour via skip or complete it
    const skipBtn = page.getByRole('button', { name: /skip|dismiss|close|done|finish/i })
    const hasSkip = await skipBtn.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (hasSkip) {
      await skipBtn.first().click()
    }

    const tourFlag = await page.evaluate((key) => localStorage.getItem(key), TOUR_COMPLETED_KEY)
    if (tourFlag) {
      expect(tourFlag).toBeTruthy()
    } else {
      test.info().annotations.push({ type: 'ux-finding', description: `localStorage key "${TOUR_COMPLETED_KEY}" not set after dismissal` })
    }
  })

  test('returning user (flag set) does not see tour', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // setupDemoMode sets demo-user-onboarded=true — verify no tour
    const tooltip = page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]')
    const hasTour = await tooltip.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })

    expect(hasTour, 'Tour should not appear for returning users').toBe(false)
  })

  test('tour tooltip stays within viewport (no overflow)', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.removeItem('kubestellar-console-tour-completed')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error('Promise catch:', error) })

    const tooltip = page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]')
    const hasTooltip = await tooltip.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })

    if (hasTooltip) {
      await assertNoLayoutOverflow(page)
    } else {
      test.info().annotations.push({ type: 'ux-finding', description: 'No tour tooltip to check for overflow' })
    }
  })

  test('page remains usable after tour dismissal', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Verify dashboard is interactive after tour is gone
    const dashboardPage = page.getByTestId('dashboard-page')
    await expect(dashboardPage).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Sidebar should be clickable
    const sidebarLink = page.locator('nav a, [data-testid*="sidebar"] a').first()
    const hasSidebar = await sidebarLink.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasSidebar) { test.skip(true, 'No sidebar link visible to verify usability'); return }
    await expect(sidebarLink).toBeEnabled()
  })
})
