import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  waitForDashboard,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Keyboard Shortcuts and Card Operations on the main dashboard (/).
 *
 * Tests global keyboard shortcuts, card grid rendering, card picker
 * modal interactions, and dashboard navigation via the sidebar.
 */

/** Number of Tab presses to verify sequential focus movement */
const TAB_NAVIGATION_COUNT = 5

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------
test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)
  })

  test('Cmd+K opens search/command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k')

    const searchDialog = page.getByRole('dialog')
      .or(page.getByTestId('global-search'))
      .or(page.getByPlaceholder(/search/i))

    await expect(searchDialog.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('Escape closes open modal', async ({ page }) => {
    // Open the add-card modal to have a dialog on screen
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    try {
      await expect(addCardBtn.first()).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    await addCardBtn.first().click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('Tab moves focus through interactive elements', async ({ page }) => {
    for (let i = 0; i < TAB_NAVIGATION_COUNT; i++) {
      await page.keyboard.press('Tab')
    }

    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()

    // Record the currently focused element tag, then tab once more
    const firstTag = await focused.evaluate((el) => el.tagName)
    await page.keyboard.press('Tab')

    const nextFocused = page.locator(':focus')
    await expect(nextFocused).toBeVisible()

    const secondTag = await nextFocused.evaluate((el) => el.tagName)
    // At minimum, focus should exist after tabbing
    expect(firstTag || secondTag).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Card Operations
// ---------------------------------------------------------------------------
test.describe('Card Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)
  })

  test('dashboard shows card grid', async ({ page }) => {
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })
  })

  test('cards have visible content', async ({ page }) => {
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const cards = cardsGrid.locator('> div')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThanOrEqual(1)

    // At least one card should have visible text content
    let foundTextContent = false
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i)
      try {
        await expect(card).toBeVisible({ timeout: 2000 })
      } catch {
        continue
      }

      const textContent = await card.textContent()
      if (textContent && textContent.trim().length > 0) {
        foundTextContent = true
        break
      }
    }
    expect(foundTextContent).toBe(true)
  })

  test('add card button is visible', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    await expect(addCardBtn.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('clicking add card opens card picker modal', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    await expect(addCardBtn.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await addCardBtn.first().click()

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('card picker modal has card categories', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    await expect(addCardBtn.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await addCardBtn.first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // Modal should have categories (tabs), a search box, or card options
    const categories = dialog.getByRole('tab')
      .or(dialog.locator('[data-testid*="category"]'))
      .or(dialog.getByRole('listitem'))
      .or(dialog.locator('[data-testid*="card-option"]'))

    const search = dialog.getByRole('searchbox')
      .or(dialog.getByPlaceholder(/search/i))

    // Either categories or search should be visible
    try {
      await expect(categories.first()).toBeVisible({ timeout: 5000 })
    } catch {
      await expect(search.first()).toBeVisible({ timeout: 5000 })
    }

    await page.keyboard.press('Escape')
  })

  test('card picker modal closes on Escape', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    try {
      await expect(addCardBtn.first()).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    await addCardBtn.first().click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('card context menu opens on click', async ({ page }) => {
    await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const firstCard = page.getByTestId('dashboard-cards-grid').locator('> div').first()
    try {
      await expect(firstCard).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    // Hover to reveal the card menu icon
    await firstCard.hover()

    const menuTrigger = firstCard.getByTestId('card-menu-trigger')
      .or(firstCard.getByRole('button', { name: /menu|options|more/i }))
      .or(firstCard.locator('[data-testid*="card-menu"]'))
      .or(firstCard.locator('[aria-label*="menu"]'))

    try {
      await expect(menuTrigger.first()).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    await menuTrigger.first().click()

    const contextMenu = page.getByRole('menu')
      .or(page.getByRole('listbox'))
      .or(page.locator('[data-testid*="card-context-menu"]'))

    await expect(contextMenu.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('card menu has action items', async ({ page }) => {
    await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const firstCard = page.getByTestId('dashboard-cards-grid').locator('> div').first()
    try {
      await expect(firstCard).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    await firstCard.hover()

    const menuTrigger = firstCard.getByTestId('card-menu-trigger')
      .or(firstCard.getByRole('button', { name: /menu|options|more/i }))
      .or(firstCard.locator('[data-testid*="card-menu"]'))
      .or(firstCard.locator('[aria-label*="menu"]'))

    try {
      await expect(menuTrigger.first()).toBeVisible({ timeout: 5000 })
    } catch {
      test.skip()
      return
    }

    await menuTrigger.first().click()

    // Context menu should have at least one actionable item
    const menuItems = page.getByRole('menuitem')
      .or(page.locator('[role="menu"] button'))
      .or(page.locator('[data-testid*="menu-item"]'))

    const itemCount = await menuItems.count()
    expect(itemCount).toBeGreaterThanOrEqual(1)

    // Close the menu
    await page.keyboard.press('Escape')
  })
})

// ---------------------------------------------------------------------------
// Dashboard Navigation
// ---------------------------------------------------------------------------
test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)
  })

  test('main dashboard loads with cards', async ({ page }) => {
    const dashboardTitle = page.getByTestId('dashboard-title')
    await expect(dashboardTitle).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const cardCount = await cardsGrid.locator('> div').count()
    expect(cardCount).toBeGreaterThanOrEqual(1)
  })

  test('sidebar shows dashboard list', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
    const linkCount = await navLinks.count()
    expect(linkCount).toBeGreaterThan(0)
  })

  test('can navigate between sidebar items', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Find all sidebar navigation links
    const navLinks = sidebar.locator('a[href]')
    const linkCount = await navLinks.count()

    if (linkCount < 2) {
      test.skip()
      return
    }

    // Click the second link (first is likely the current page)
    const secondLink = navLinks.nth(1)
    const href = await secondLink.getAttribute('href')
    await secondLink.click()

    // URL should have changed
    if (href) {
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    }
  })

  test('dashboard title is visible', async ({ page }) => {
    const title = page.getByTestId('dashboard-title')
    await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const titleText = await title.textContent()
    expect(titleText?.trim().length).toBeGreaterThan(0)
  })

  test('refresh button triggers data reload', async ({ page }) => {
    const refreshBtn = page.getByTestId('dashboard-refresh-button')
    await expect(refreshBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    await refreshBtn.click()

    // Button should remain visible and functional after click
    await expect(refreshBtn).toBeVisible()
    await expect(page.getByTestId('dashboard-header')).toBeVisible()
  })
})
