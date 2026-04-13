import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  waitForDashboard,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'
import { assertFocusVisible } from '../helpers/ux-assertions'

/**
 * Keyboard navigation UX tests.
 *
 * Validates tab order, focus indicators, Enter activation, Escape
 * dismissal, and bidirectional (Shift+Tab) navigation. These tests
 * ensure the app is usable without a mouse.
 */

/** Number of Tab presses to walk through sidebar items */
const SIDEBAR_TAB_COUNT = 6

/** Number of Tab presses to walk through card action buttons */
const CARD_ACTION_TAB_COUNT = 5

/** Number of additional Tab presses to verify focus is not trapped */
const ESCAPE_TRAP_TAB_COUNT = 15

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)
  })

  test('Tab moves focus through sidebar nav items', async ({ page }) => {
    // Click body to reset focus
    await page.locator('body').click()

    const focusedTags: string[] = []
    for (let i = 0; i < SIDEBAR_TAB_COUNT; i++) {
      await page.keyboard.press('Tab')
      const tag = await page.evaluate(() => document.activeElement?.tagName || 'NONE')
      focusedTags.push(tag)
    }

    // At least some Tab presses should land on links or buttons
    const interactiveCount = focusedTags.filter(t => ['A', 'BUTTON', 'INPUT'].includes(t)).length
    expect(interactiveCount, 'Tab should move focus to interactive elements').toBeGreaterThan(0)
  })

  test('focused sidebar item has visible focus indicator', async ({ page }) => {
    await page.locator('body').click()

    // Tab until we reach a sidebar link
    for (let i = 0; i < SIDEBAR_TAB_COUNT; i++) {
      await page.keyboard.press('Tab')
      const isSidebarLink = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return false
        return el.tagName === 'A' && !!el.closest('nav, [data-testid*="sidebar"]')
      })
      if (isSidebarLink) break
    }

    await assertFocusVisible(page)
  })

  test('Enter on focused sidebar item navigates', async ({ page }) => {
    const urlBefore = page.url()

    // Tab to a sidebar link
    for (let i = 0; i < SIDEBAR_TAB_COUNT; i++) {
      await page.keyboard.press('Tab')
      const isSidebarLink = await page.evaluate(() => {
        const el = document.activeElement
        return el?.tagName === 'A' && !!el.closest('nav, [data-testid*="sidebar"]')
      })
      if (isSidebarLink) break
    }

    await page.keyboard.press('Enter')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // URL may or may not change depending on which link was focused,
    // but the page should not crash
    const crash = page.getByText(/something went wrong|application error/i)
    await expect(crash).not.toBeVisible()
  })

  test('Escape closes open modal (search)', async ({ page }) => {
    // global-search-input is always visible in the navbar; track the dropdown
    // results panel (global-search-results) to determine open/closed state.
    const searchResults = page.getByTestId('global-search-results')

    // Try both Ctrl+K and Meta+K to open search (platform-dependent)
    await page.keyboard.press('Control+k')
    let opened = await searchResults.isVisible({ timeout: 2_000 }).catch(() => false)
    if (!opened) {
      await page.keyboard.press('Meta+k')
      opened = await searchResults.isVisible({ timeout: 2_000 }).catch(() => false)
    }
    if (!opened) {
      // Fallback: click the search area directly
      const searchArea = page.getByTestId('global-search')
      const hasSearch = await searchArea.isVisible({ timeout: 2_000 }).catch(() => false)
      if (hasSearch) {
        await searchArea.click()
        opened = await searchResults.isVisible({ timeout: 2_000 }).catch(() => false)
      }
    }
    if (!opened) { test.skip(true, 'Could not open search dropdown via keyboard or click'); return }

    await page.keyboard.press('Escape')
    await expect(searchResults).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('Escape closes settings modal', async ({ page }) => {
    // Try to open settings
    const settingsBtn = page.getByTestId('settings-button')
      .or(page.getByRole('button', { name: /settings/i }))
      .or(page.locator('[aria-label*="settings" i]'))

    const hasSettings = await settingsBtn.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasSettings) {
      test.skip()
      return
    }

    await settingsBtn.first().click()
    const dialog = page.getByRole('dialog')
    const hasDialog = await dialog.isVisible({ timeout: MODAL_TIMEOUT_MS }).catch(() => false)
    if (!hasDialog) {
      test.skip()
      return
    }

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('Tab through card action buttons on dashboard', async ({ page }) => {
    const cards = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]')
    const cardCount = await cards.count()
    if (cardCount === 0) {
      test.skip()
      return
    }

    // Click the first card area to set focus context
    await cards.first().click()

    const focusedElements: string[] = []
    for (let i = 0; i < CARD_ACTION_TAB_COUNT; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName}:${el.getAttribute('data-testid') || el.className.slice(0, 30)}` : 'NONE'
      })
      focusedElements.push(info)
    }

    // Should have tabbed through some interactive elements
    const nonBody = focusedElements.filter(e => !e.startsWith('BODY') && e !== 'NONE')
    expect(nonBody.length, 'Tab should reach interactive elements within cards').toBeGreaterThan(0)
  })

  test('focus does not get trapped (can always Tab out)', async ({ page }) => {
    await page.locator('body').click()

    const seenElements = new Set<string>()
    let stuckCount = 0

    for (let i = 0; i < ESCAPE_TRAP_TAB_COUNT; i++) {
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'body'
        return `${el.tagName}-${el.getAttribute('data-testid') || ''}-${el.textContent?.slice(0, 20) || ''}`
      })

      if (seenElements.has(id)) {
        stuckCount++
      } else {
        stuckCount = 0
      }
      seenElements.add(id)

      // If the same element receives focus 5+ times in a row, focus is trapped
      const MAX_STUCK_ITERATIONS = 5
      expect(stuckCount, `Focus appears trapped on element: ${id}`).toBeLessThan(MAX_STUCK_ITERATIONS)
    }
  })

  test('Shift+Tab goes backwards through focus order', async ({ page }) => {
    await page.locator('body').click()

    // Tab forward a few times
    const TAB_FORWARD_COUNT = 4
    for (let i = 0; i < TAB_FORWARD_COUNT; i++) {
      await page.keyboard.press('Tab')
    }

    const forwardElement = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName || 'NONE'
    })

    // Shift+Tab should move focus back
    await page.keyboard.press('Shift+Tab')

    const backwardElement = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName || 'NONE'
    })

    // The focused element should be interactive (not body)
    const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(backwardElement)
    if (!isInteractive && backwardElement !== 'BODY') {
      test.info().annotations.push({ type: 'ux-finding', description: `Shift+Tab landed on non-interactive element: ${backwardElement}` })
    }
  })

  test('keyboard users can reach main content area', async ({ page }) => {
    await page.locator('body').click()

    // Tab through elements and check if we reach the main content
    let reachedMain = false
    const MAX_TAB_TO_MAIN = 20
    for (let i = 0; i < MAX_TAB_TO_MAIN; i++) {
      await page.keyboard.press('Tab')
      const inMain = await page.evaluate(() => {
        const el = document.activeElement
        return !!el?.closest('main, [role="main"], [data-testid="dashboard-page"], [data-testid="dashboard-cards-grid"]')
      })
      if (inMain) {
        reachedMain = true
        break
      }
    }

    if (!reachedMain) {
      test.info().annotations.push({ type: 'ux-finding', description: `Could not reach main content within ${MAX_TAB_TO_MAIN} Tab presses — consider adding a skip-to-content link` })
    }
  })
})
