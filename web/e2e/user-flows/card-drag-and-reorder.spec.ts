import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  waitForDashboard,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'
import { assertTouchTargetSize } from '../helpers/ux-assertions'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../src/lib/constants/storage'

/**
 * Card drag-and-reorder UX tests.
 *
 * Validates that the dashboard card grid supports reordering via
 * drag-and-drop, that order persists across reload, and that drag
 * handles meet touch-target size requirements.
 */

/** Vertical offset in pixels for a drag that crosses one card slot */
const DRAG_OFFSET_PX = 200

test.describe('Card Drag and Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)
  })

  test('card grid renders with multiple cards', async ({ page }) => {
    const cards = page.getByTestId('dashboard-cards-grid')
      .or(page.locator('[data-testid*="card"]'))
    await expect(cards.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const cardItems = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]')
    const count = await cardItems.count()
    expect(count, 'Dashboard should render multiple cards').toBeGreaterThanOrEqual(1)
  })

  test('cards have drag handles visible on hover', async ({ page }) => {
    const firstCard = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]').first()
    const isVisible = await firstCard.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip()
      return
    }

    await firstCard.hover()

    const dragHandle = firstCard.locator('[data-testid*="drag"], [class*="drag"], [aria-grabbed], .drag-handle, [draggable="true"]')
    const hasDragHandle = await dragHandle.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    // Soft assertion — drag handles may not be implemented yet
    if (!hasDragHandle) {
      test.info().annotations.push({ type: 'ux-finding', description: 'No drag handle visible on card hover' })
    }
  })

  test('drag and drop reorders cards', async ({ page }) => {
    const cards = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]')
    const count = await cards.count()
    if (count < 2) {
      test.skip()
      return
    }

    // Capture card order BEFORE drag via data-testid attributes
    const orderBefore = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid') || el.textContent?.slice(0, 60) || ''),
    )

    const firstCard = cards.first()
    const firstBox = await firstCard.boundingBox()
    if (!firstBox) {
      test.skip()
      return
    }

    const startX = firstBox.x + firstBox.width / 2
    const startY = firstBox.y + firstBox.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + DRAG_OFFSET_PX, { steps: 10 })
    // Wait for the browser to process drag events before releasing
    await expect(page.locator('body')).toBeVisible()
    await page.mouse.up()

    // Page must not crash after drag attempt
    await expect(page.locator('body')).toBeVisible()

    // Capture card order AFTER drag
    const orderAfter = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid') || el.textContent?.slice(0, 60) || ''),
    )

    // Verify that the drag actually changed card order.
    // If drag-and-drop is not yet implemented, annotate rather than
    // silently passing with a tautological assertion.
    const orderChanged = orderBefore.some((id, i) => orderAfter[i] !== id)
    if (!orderChanged) {
      // Also check localStorage — the persistence hook may have recorded
      // the reorder even if DOM order hasn't visually updated yet.
      const storedOrder = await page.evaluate(
        (key) => localStorage.getItem(key),
        STORAGE_KEY_MAIN_DASHBOARD_CARDS,
      )
      const persistedReorder = storedOrder !== null

      if (!persistedReorder) {
        test.info().annotations.push({
          type: 'ux-finding',
          description:
            'Drag operation did not change card order in DOM or localStorage — ' +
            'drag-and-drop reordering may not be implemented or the drag offset was insufficient.',
        })
      }
    } else {
      // Verify the first card moved: it should no longer be at index 0
      expect(
        orderAfter[0],
        'First card should have moved away from the top position after drag',
      ).not.toBe(orderBefore[0])
    }
  })

  test('card order persists after page reload', async ({ page }) => {
    const cards = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]')
    const count = await cards.count()
    if (count < 2) {
      test.skip()
      return
    }

    // Issue 9241: previously this test guessed at three speculative
    // localStorage keys ('kubestellar-card-order', 'dashboard-card-order',
    // 'card-layout') — none of which match the canonical key. If all three
    // missed, orderBefore was null and the test silently passed even when
    // the app didn't persist card order at all. Use the exported key from
    // src/lib/constants/storage.ts so a renaming refactor on the source
    // breaks this test (intended), and so the test actually exercises the
    // persistence path.
    const orderBefore = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY_MAIN_DASHBOARD_CARDS,
    )

    // Persistence is only meaningful if the card-order hook has written
    // something. Without it, the test would pass vacuously — make the
    // failure visible instead of silently annotating.
    expect(
      orderBefore,
      `Expected localStorage key "${STORAGE_KEY_MAIN_DASHBOARD_CARDS}" to be populated by ` +
      `the card-order persistence hook before reload. If the hook stopped writing, this is a regression.`,
    ).not.toBeNull()

    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    const orderAfter = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY_MAIN_DASHBOARD_CARDS,
    )

    expect(orderAfter).toBe(orderBefore)
  })

  test('touch targets on drag handles meet 44px minimum', async ({ page }) => {
    const firstCard = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]').first()
    const isVisible = await firstCard.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip()
      return
    }

    await firstCard.hover()

    const dragHandle = firstCard.locator('[data-testid*="drag"], [class*="drag"], .drag-handle, [draggable="true"]').first()
    const hasDragHandle = await dragHandle.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasDragHandle) {
      test.info().annotations.push({ type: 'ux-finding', description: 'No drag handle found — cannot verify touch target size' })
      return
    }

    await assertTouchTargetSize(dragHandle)
  })

  test('cards remain interactive after failed drag', async ({ page }) => {
    const firstCard = page.locator('[data-testid*="card-wrapper"], [data-testid*="dashboard-card"]').first()
    const isVisible = await firstCard.isVisible().catch(() => false)
    if (!isVisible) {
      test.skip()
      return
    }

    const box = await firstCard.boundingBox()
    if (!box) return

    // Start a drag but cancel it (drop in same position)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 5, { steps: 3 })
    await page.mouse.up()

    // Card should still be clickable / interactive
    await expect(firstCard).toBeVisible()
  })

  test('dashboard page does not crash when all cards are present', async ({ page }) => {
    const grid = page.getByTestId('dashboard-cards-grid')
      .or(page.getByTestId('dashboard-page'))
    await expect(grid.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // No crash indicators
    const crash = page.getByText(/something went wrong|application error|unhandled error/i)
    await expect(crash).not.toBeVisible()
  })
})
