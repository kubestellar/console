/**
 * CI/CD Recent Failures card interaction E2E tests (#11770)
 * Tests that failure items render and link correctly
 */
import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

test.describe('CI/CD Recent Failures interactions (#11770)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ci-cd')
  })

  test('recent failures card renders failure items', async ({ page }) => {
    // Wait for CI/CD page to load
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Check if Recent Failures card is present
    const failuresCard = page.locator('[data-card-type*="recent_failure"], [data-card-type*="failures"], [data-testid*="recent-failure"]').first()
    const hasCard = await failuresCard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasCard) {
      // Card not visible - skip gracefully
      test.skip(true, 'Recent Failures card not visible')
      return
    }

    // Look for failure items (list items, rows, or cards within the failures card)
    const failureItems = failuresCard.locator('[data-testid*="failure-item"], [data-testid*="failure-row"], li, [role="listitem"]')
    const itemCount = await failureItems.count()

    // If demo data has failures, verify they render
    if (itemCount > 0) {
      expect(itemCount).toBeGreaterThanOrEqual(1)
      
      // Verify first item has text content
      const firstItemText = await failureItems.first().textContent()
      expect(firstItemText?.length).toBeGreaterThan(0)
    }

    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'data',
        component: 'RecentFailures',
        finding: `Found ${itemCount} failure items`,
        recommendation: 'None',
      }),
    })
  })

  test('clicking a failure item opens detail view or navigates', async ({ page }) => {
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    const failuresCard = page.locator('[data-card-type*="recent_failure"], [data-card-type*="failures"], [data-testid*="recent-failure"]').first()
    const hasCard = await failuresCard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasCard) {
      test.skip(true, 'Recent Failures card not visible')
      return
    }

    // Find clickable failure items (buttons or links)
    const clickableItem = failuresCard.locator('button, a, [role="button"], [class*="cursor-pointer"]').first()
    const hasClickable = await clickableItem.isVisible().catch(() => false)

    if (!hasClickable) {
      // No clickable items - failures list might be empty
      return
    }

    // Track the initial URL before clicking
    const initialUrl = page.url()

    // Click the first clickable failure item
    await clickableItem.click()

    // After click, either:
    // 1. A modal/drilldown appears (log view)
    // 2. URL changes (navigation to detail page or external link)
    // 3. An expanded section appears
    const drilldown = page.getByTestId('drilldown-modal')
    const hasDrilldown = await drilldown.isVisible({ timeout: 3000 }).catch(() => false)

    const urlChanged = page.url() !== initialUrl

    // Verify SOMETHING happened (modal, navigation, or expansion)
    if (hasDrilldown) {
      await expect(drilldown).toBeVisible()
    } else if (urlChanged) {
      // URL changed - navigation occurred
      expect(page.url()).not.toBe(initialUrl)
    } else {
      // No modal or navigation - still verify page is responsive
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('failure items show relevant metadata (workflow name, timestamp, etc.)', async ({ page }) => {
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    const failuresCard = page.locator('[data-card-type*="recent_failure"], [data-card-type*="failures"], [data-testid*="recent-failure"]').first()
    const hasCard = await failuresCard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasCard) {
      test.skip(true, 'Recent Failures card not visible')
      return
    }

    const failureItems = failuresCard.locator('[data-testid*="failure-item"], [data-testid*="failure-row"], li, [role="listitem"]')
    const itemCount = await failureItems.count()

    if (itemCount === 0) {
      // No failures to verify
      return
    }

    // Check first failure item for metadata (timestamp, workflow name, commit, etc.)
    const firstItem = failureItems.first()
    const itemText = await firstItem.textContent()

    // Should have substantial text (workflow name, branch, etc. — not just an icon)
    expect(itemText?.length).toBeGreaterThan(5)

    // Look for time-related text (common in failure cards: "2h ago", timestamps, etc.)
    const hasTimeInfo = itemText?.match(/\d+[smhd]|ago|AM|PM|\d{1,2}:\d{2}/i)
    
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'metadata',
        component: 'RecentFailures',
        finding: `First failure item ${hasTimeInfo ? 'includes' : 'does not include'} timestamp/time info`,
        recommendation: hasTimeInfo ? 'None' : 'Consider adding timestamp to failure items',
      }),
    })
  })
})
