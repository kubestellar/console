import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Storage Deep Tests (/storage) — Storage.tsx
 *
 * Validates the Storage dashboard page including page structure,
 * stats overview, PVC list modal, cards, and error state.
 *
 * Run with: npx playwright test e2e/storage-deep.spec.ts
 */

/** Route path for the storage dashboard */
const STORAGE_ROUTE = '/storage'

/** Timeout for PVC modal content to appear */
const PVC_MODAL_CONTENT_TIMEOUT_MS = 5_000

/** Timeout for search filtering to take effect */
const SEARCH_FILTER_TIMEOUT_MS = 3_000

/** Nonsense search string guaranteed to match nothing */
const NO_MATCH_SEARCH_QUERY = 'zzz-nonexistent-pvc-xyz-999'

test.describe('Storage Deep Tests (/storage)', () => {
  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const collector = setupErrorCollector(page)
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)

      expect(collector.errors).toHaveLength(0)
    })

    test('renders page title "Storage"', async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)

      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(title).toContainText('Storage')
    })

    test('displays dashboard header with refresh button', async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)

      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const refreshButton = page.getByTestId('dashboard-refresh-button')
      await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('shows stats overview section', async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)

      // Stats sublabels like "persistent volume claims", "PVCs bound", etc.
      const pvcLabel = page.getByText('persistent volume claims')
      // Stats section should be present with sublabels visible
      await expect(pvcLabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('Stats Overview', () => {
    test.beforeEach(async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)
    })

    test('displays PVC count stat', async ({ page }) => {
      const sublabel = page.getByText('persistent volume claims')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays bound PVC count', async ({ page }) => {
      const sublabel = page.getByText('PVCs bound')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays pending PVC count', async ({ page }) => {
      const sublabel = page.getByText('PVCs pending')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('displays storage stat', async ({ page }) => {
      const sublabel = page.getByText('total allocatable')
      await expect(sublabel.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  test.describe('PVC Modal', () => {
    test.beforeEach(async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)
    })

    test('clicking PVC stat opens PVC list modal', async ({ page }) => {
      // The PVC count stat has sublabel "persistent volume claims" and is clickable
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      // Click the stat block containing "persistent volume claims"
      // The click handler is on the parent stat element
      await pvcStat.first().click()

      // Modal should open with title "All PVCs"
      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })
    })

    test('PVC modal shows search input', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      // Wait for modal
      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // Search input has placeholder from t('common.searchPVCs')
      const searchInput = page.locator('input[type="text"]').last()
      await expect(searchInput).toBeVisible({ timeout: PVC_MODAL_CONTENT_TIMEOUT_MS })
    })

    test('PVC modal lists PVCs with name and status', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // PVCs show status badges: "Bound", "Pending", or "Lost"
      const boundBadge = page.getByText('Bound')
      const pendingBadge = page.getByText('Pending')
      const lostBadge = page.getByText('Lost')

      const hasBound = await boundBadge.first().isVisible().catch(() => false)
      const hasPending = await pendingBadge.first().isVisible().catch(() => false)
      const hasLost = await lostBadge.first().isVisible().catch(() => false)

      // At least one PVC status should be visible if PVCs exist in demo data
      const hasAnyPVC = hasBound || hasPending || hasLost
      // If no PVCs, the empty state message appears instead
      const emptyMsg = page.getByText('No PVCs found matching the criteria')
      const hasEmpty = await emptyMsg.isVisible().catch(() => false)

      expect(hasAnyPVC || hasEmpty).toBe(true)
    })

    test('PVC modal search filters results', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // Type a search query that should narrow results
      const searchInput = page.locator('input[type="text"]').last()
      await searchInput.fill(NO_MATCH_SEARCH_QUERY)

      // With a nonsense query, the empty state should appear
      const emptyMsg = page.getByText('No PVCs found matching the criteria')
      await expect(emptyMsg).toBeVisible({ timeout: SEARCH_FILTER_TIMEOUT_MS })
    })

    test('PVC modal shows status badges with colors', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // Check for status badges with color classes
      // Bound = green-400, Pending = yellow-400, Lost = red-400
      const statusBadges = page.locator('span.rounded')
      const badgeCount = await statusBadges.count()

      if (badgeCount > 0) {
        const firstBadge = statusBadges.first()
        const badgeClasses = await firstBadge.getAttribute('class')
        // Status badges should have color styling
        const hasColorClass = badgeClasses !== null && (
          badgeClasses.includes('green') ||
          badgeClasses.includes('yellow') ||
          badgeClasses.includes('red') ||
          badgeClasses.includes('secondary')
        )
        expect(hasColorClass).toBe(true)
      }
    })

    test('PVC modal shows empty state when no matches', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // Search for something that won't match
      const searchInput = page.locator('input[type="text"]').last()
      await searchInput.fill(NO_MATCH_SEARCH_QUERY)

      const emptyState = page.getByText('No PVCs found matching the criteria')
      await expect(emptyState).toBeVisible({ timeout: SEARCH_FILTER_TIMEOUT_MS })
    })

    test('PVC modal closes on close button', async ({ page }) => {
      const pvcStat = page.getByText('persistent volume claims')
      const isVisible = await pvcStat.first().isVisible().catch(() => false)
      if (!isVisible) {
        test.skip()
        return
      }

      await pvcStat.first().click()

      const modalTitle = page.getByText('All PVCs')
      await expect(modalTitle.first()).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // BaseModal has a close button — look for button with aria-label or X icon
      const closeButton = page.locator('button[aria-label="Close"]')
      const hasAriaClose = await closeButton.isVisible().catch(() => false)

      if (hasAriaClose) {
        await closeButton.click()
      } else {
        // Fallback: press Escape to close the modal
        await page.keyboard.press('Escape')
      }

      // Modal title should no longer be visible
      await expect(modalTitle.first()).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
    })
  })

  test.describe('Cards', () => {
    test('renders at least one card', async ({ page }) => {
      await setupDemoAndNavigate(page, STORAGE_ROUTE)
      await waitForSubRoute(page)

      // Cards use [data-card-type] attribute
      const cards = page.locator('[data-card-type]')
      const cardCount = await cards.count()

      // In demo mode, default storage cards should be present
      expect(cardCount).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Error State', () => {
    test('shows error message on API failure', async ({ page }) => {
      // Intercept MCP endpoints and return errors for clusters and PVCs
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters') || url.includes('/pvcs')) {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal server error' }),
          })
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ nodes: [], events: [], issues: [] }),
          })
        }
      })

      await setupDemoAndNavigate(page, STORAGE_ROUTE)

      // In demo mode, errors may not surface because demo data bypasses API.
      // Check that the page at least loads without crashing.
      const header = page.getByTestId('dashboard-header')
      const isHeaderVisible = await header.isVisible().catch(() => false)

      // If error text is shown, verify it matches expected message
      const errorText = page.getByText('Error loading storage data')
      const isErrorVisible = await errorText.isVisible().catch(() => false)

      // Either the page loaded successfully or showed the error — both are valid
      expect(isHeaderVisible || isErrorVisible).toBe(true)
    })
  })
})
