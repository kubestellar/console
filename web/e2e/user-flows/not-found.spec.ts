import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  waitForNetworkIdleBestEffort,
} from '../helpers/setup'

/**
 * 404 / not-found route coverage.
 *
 * Issue 9236: no spec verified that an unmatched route renders meaningful
 * content (not a blank screen) and exposes an affordance to return home.
 *
 * App.tsx line 646 uses `<Route path="*" element={<Navigate to={ROUTES.HOME}
 * replace />} />` — any unmatched route under the authenticated dashboard
 * redirects to `/`. These tests assert that behavior end-to-end so a future
 * refactor to a dedicated 404 page (or a regression that leaves the user
 * on a blank screen) is caught.
 */

/** Minimum body text length considered "not blank" */
const MIN_BODY_TEXT_LENGTH = 50

/** Unique suffix generator base for unmatched route path */
const UNMATCHED_ROUTE_PREFIX = '/does-not-exist-'

test.describe('404 / not-found route', () => {
  test('unmatched route renders non-blank content with visible text', async ({ page }) => {
    await setupDemoMode(page)
    const unmatched = `${UNMATCHED_ROUTE_PREFIX}${Date.now()}`
    await page.goto(unmatched)
    await waitForNetworkIdleBestEffort(page)

    // Body must render actual text — catches a true blank screen regression.
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const content = await body.textContent()
    expect(content?.length ?? 0).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
  })

  test('unmatched route exposes a return-home affordance (sidebar or nav)', async ({ page }) => {
    await setupDemoAndNavigate(page, `${UNMATCHED_ROUTE_PREFIX}${Date.now()}`)

    // The current app redirects unmatched routes to HOME via <Navigate>, so
    // the dashboard chrome (sidebar / navbar) should be visible. If a future
    // change introduces a dedicated 404 page, this test should still pass as
    // long as SOME navigation affordance back to / is rendered.
    const sidebarOrNav = page
      .locator('nav')
      .or(page.locator('[data-testid*="sidebar"]'))
      .or(page.getByRole('link', { name: /home|dashboard/i }))

    await expect(sidebarOrNav.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })
})
