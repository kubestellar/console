import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'

/**
 * Onboarding-flow-after-login coverage.
 *
 * Issue 9238: no spec verified the first-time-user experience vs the
 * returning-user experience. This spec focuses on the localStorage flag
 * semantics documented in web/src/lib/constants/storage.ts:
 *   - demo-user-onboarded (STORAGE_KEY_ONBOARDED)
 *   - kubestellar-console-tour-completed (STORAGE_KEY_TOUR_COMPLETED)
 *
 * The existing onboarding-tour.spec.ts covers the tour tooltip / Skip /
 * Next interactions. This spec complements it by verifying the page-level
 * post-login state for first-time vs returning users.
 */

/** Tour completion localStorage key (mirrors STORAGE_KEY_TOUR_COMPLETED) */
const TOUR_COMPLETED_KEY = 'kubestellar-console-tour-completed'

/** Demo-user onboarded localStorage key (mirrors STORAGE_KEY_ONBOARDED) */
const ONBOARDED_KEY = 'demo-user-onboarded'

/** Timeout for tour tooltip / prompt appearance check */
const TOUR_TOOLTIP_TIMEOUT_MS = 5_000

/** Minimum body text length considered "dashboard rendered" */
const MIN_BODY_TEXT_LENGTH = 50

test.describe('Onboarding flow after login', () => {
  test('first-time user has tour-completed cleared and dashboard renders', async ({ page }) => {
    // Seed demo auth but explicitly clear the tour + onboarded flags so the
    // app sees a fresh user. The tour is opt-in (started from Settings), so
    // we assert the observable side of "first-time": dashboard loads AND
    // the tour-completed flag is NOT set afterwards.
    await setupDemoMode(page)
    await page.addInitScript((keys) => {
      localStorage.removeItem(keys.tour)
      localStorage.removeItem(keys.onboarded)
    }, { tour: TOUR_COMPLETED_KEY, onboarded: ONBOARDED_KEY })

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const content = await body.textContent()
    expect(content?.length ?? 0).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

    // Tour must not be marked complete for a first-time user.
    const tourFlag = await page.evaluate((key) => localStorage.getItem(key), TOUR_COMPLETED_KEY)
    expect(tourFlag).not.toBe('true')
  })

  test('returning user (tour-completed=true) does not see tour overlay', async ({ page }) => {
    // Returning users: tour dismissed previously. setupDemoAndNavigate sets
    // demo-user-onboarded=true, and we also seed tour-completed=true.
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'true')
    }, TOUR_COMPLETED_KEY)
    await setupDemoAndNavigate(page, '/')

    // Tour overlay selectors mirror onboarding-tour.spec.ts so the matcher
    // stays in sync with the Tour component's rendered DOM.
    const tourOverlay = page.locator('[class*="tour"], [class*="joyride"], [class*="onboarding"]')
    const hasTour = await tourOverlay.first().isVisible({ timeout: TOUR_TOOLTIP_TIMEOUT_MS }).catch(() => false)
    expect(hasTour, 'Tour must not render for returning users with tour-completed=true').toBe(false)
  })
})
