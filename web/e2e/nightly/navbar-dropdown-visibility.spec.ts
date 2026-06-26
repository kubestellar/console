import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, mockApiFallback, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'

/**
 * Nightly Navbar Dropdown Visibility Check
 *
 * Validates that ALL navbar dropdown panels render fully visible and
 * on top of page content (not clipped or obscured by dashboard cards,
 * stat widgets, or other stacking contexts).
 *
 * Each dropdown is opened, verified visible, and checked that its
 * bounding box is fully within the viewport. Then the dropdown is
 * closed before proceeding to the next.
 *
 * Run locally:
 *   npx playwright test e2e/nightly/navbar-dropdown-visibility.spec.ts \
 *     -c e2e/nightly/nightly.config.ts
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Time to wait after clicking a trigger for the dropdown to appear (ms) */
const DROPDOWN_APPEAR_MS = 3_000

/** Time to wait for page to settle before interacting (ms) */
const PAGE_SETTLE_MS = 2_000

/** Minimum expected z-index for navbar dropdowns */
const MIN_DROPDOWN_Z_INDEX = 400

/** Viewport dimensions matching nightly.config.ts */
const VIEWPORT_WIDTH = 1280
const VIEWPORT_HEIGHT = 900

interface DropdownSpec {
  name: string
  triggerTestId: string
  dropdownTestId: string
}

const NAVBAR_DROPDOWNS: DropdownSpec[] = [
  {
    name: 'Agent Status',
    triggerTestId: 'navbar-agent-status-btn',
    dropdownTestId: 'navbar-agent-status-dropdown',
  },
  {
    name: 'Token Usage',
    triggerTestId: 'navbar-token-usage-btn',
    dropdownTestId: 'navbar-token-usage-dropdown',
  },
  {
    name: 'Cluster Filter',
    triggerTestId: 'navbar-cluster-filter-btn',
    dropdownTestId: 'navbar-cluster-filter-dropdown',
  },
  {
    name: 'Alerts',
    triggerTestId: 'navbar-alerts-btn',
    dropdownTestId: 'navbar-alerts-dropdown',
  },
  {
    name: 'User Profile',
    triggerTestId: 'navbar-profile-btn',
    dropdownTestId: 'navbar-profile-dropdown',
  },
]

test.describe('Navbar dropdown visibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page)
    await setupDemoAndNavigate(page, '/')
    await page.waitForTimeout(PAGE_SETTLE_MS)
  })

  for (const dropdown of NAVBAR_DROPDOWNS) {
    test(`${dropdown.name} dropdown renders on top and fully visible`, async ({ page }) => {
      const trigger = page.getByTestId(dropdown.triggerTestId)

      // Some dropdowns may not be rendered at this viewport (e.g. hidden on certain views)
      if (!(await trigger.isVisible().catch(() => false))) {
        test.skip()
        return
      }

      // Use native click for cross-browser stability (webkit/firefox can miss
      // React event handlers during mid-render when using Playwright's synthetic click)
      await trigger.evaluate((el) => (el as HTMLElement).click())

      const panel = page.getByTestId(dropdown.dropdownTestId)
      await expect(panel).toBeVisible({ timeout: DROPDOWN_APPEAR_MS })

      // Verify the dropdown's bounding box is fully within the viewport
      const box = await panel.boundingBox()
      expect(box, `${dropdown.name} dropdown should have a bounding box`).not.toBeNull()

      if (box) {
        expect(box.x, `${dropdown.name} left edge should be >= 0`).toBeGreaterThanOrEqual(0)
        expect(box.y, `${dropdown.name} top edge should be >= 0`).toBeGreaterThanOrEqual(0)
        expect(
          box.x + box.width,
          `${dropdown.name} right edge should be within viewport`
        ).toBeLessThanOrEqual(VIEWPORT_WIDTH)
        expect(
          box.y + box.height,
          `${dropdown.name} bottom edge should be within viewport`
        ).toBeLessThanOrEqual(VIEWPORT_HEIGHT)
      }

      // Verify computed z-index is high enough to be on top of dashboard content
      const zIndex = await panel.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return parseInt(style.zIndex, 10) || 0
      })
      expect(
        zIndex,
        `${dropdown.name} z-index (${zIndex}) should be >= ${MIN_DROPDOWN_Z_INDEX}`
      ).toBeGreaterThanOrEqual(MIN_DROPDOWN_Z_INDEX)

      // Verify the dropdown is not obscured by clicking an element inside it.
      // Playwright's click() will fail if another element intercepts the click.
      const firstClickable = panel.locator('button, a, input, [role="menuitem"]').first()
      if (await firstClickable.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)) {
        await firstClickable.click({ trial: true, timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      }

      // Close the dropdown (press Escape) before the next test
      await page.keyboard.press('Escape')
      await expect(panel).not.toBeVisible({ timeout: DROPDOWN_APPEAR_MS })
    })
  }
})
