import { test, expect, type Page } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
} from '../helpers/setup'
import { collectConsoleErrors } from '../helpers/ux-assertions'

/**
 * User-flow E2E for the /quantum dashboard route.
 *
 * Covers two regression classes from the testing-protocol audit
 * (2026-06-09, deferred PR 3):
 *
 * 1. Demo-mode landing — all four quantum cards render without crashing the
 *    page when no quantum workload is reachable. Guards against #16052-style
 *    Card render errors caused by stale-cache hydration of `lastIbmError`.
 *
 * 2. ControlPanel default badge — confirms the consumer chain
 *    (useQuantumAuthStatus → ControlPanel → CardWrapper → DOM) wires up the
 *    "Not configured" badge in default demo state. Guards against the
 *    consumer-chain regressions from PRs #15948 / #15957 / #15960 / #16052.
 *
 * The "Stored" → "Configured" badge transitions are NOT covered here because
 * the global `kc-demo-mode` flag short-circuits every useCache hook
 * (cacheCore.ts: `effectiveEnabled = enabled && (!demoMode || liveInDemoMode)`),
 * so `/api/quantum/auth/status` route mocks never reach the fetcher in demo
 * mode. Those transitions are exhaustively covered by unit tests in
 * `web/src/components/cards/quantum/__tests__/QuantumControlPanel.test.tsx`.
 *
 * Uses the standard `web/playwright.config.ts` (NOT `app-visual.config.ts`).
 */

const QUANTUM_ROUTE = '/quantum'
const SIDEBAR_TIMEOUT_MS = 15_000

// Card wrapper titles (CardWrapper renders these as h2). Match the
// `title` field in `web/src/config/dashboards/quantum.ts`. We use exact
// strings (not partial regexes) so we don't double-match a body subheading
// that happens to share text — e.g. "Execution Histogram" appears as both
// the h2 wrapper title and an h3 body subheading on the histogram card.
const HEADING_QUBIT_GRID = 'Quantum Qubit Grid'
const HEADING_HISTOGRAM = 'Execution Histogram'
const HEADING_CIRCUIT = 'Quantum Circuit Viewer'
const HEADING_CONTROL_PANEL = 'Quantum Control Panel'

const BADGE_NOT_CONFIGURED = /Not configured/i

/**
 * Wait for the /quantum dashboard shell to render. The page uses the standard
 * dashboard shell (sidebar + cards grid).
 */
async function waitForQuantumPage(page: Page) {
  await expect(page.getByTestId('sidebar')).toBeVisible({
    timeout: SIDEBAR_TIMEOUT_MS,
  })
  await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({
    timeout: SIDEBAR_TIMEOUT_MS,
  })
}

/**
 * Locate a quantum card by its CardWrapper title (h2). Scopes to the dashboard
 * cards grid (so headings reused elsewhere in the app — sidebar, nav, help
 * panels — cannot false-match), then selects the `[data-card-type]` wrapper
 * whose subtree contains a matching level-2 heading.
 *
 * Note on `has:` semantics — the inner heading locator is built from `page`,
 * not from `cardsGrid`. Playwright's `has:` filter applies the inner locator
 * RELATIVE TO each candidate (each `[data-card-type]`), not against the page
 * as a whole. Building it off a chained scope like `cardsGrid` breaks this
 * relative resolution and matches zero cards. Page-rooted is the documented
 * pattern; the outer `cardsGrid` chain still constrains the candidates.
 *
 * Level-2 + `exact: true` anchors on the CardWrapper title and avoids
 * collisions with body subheadings (e.g. "Execution Histogram" renders as
 * both an h2 wrapper title AND an h3 body subheading on the histogram card).
 */
function findQuantumCardByHeading(page: Page, heading: string) {
  return page
    .getByTestId('dashboard-cards-grid')
    .locator('[data-card-type]')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading, exact: true }) })
}

test.describe('Quantum demo user flows', () => {
  test('demo-mode landing: all four quantum cards render without crashing', async ({ page }) => {
    const assertNoUnexpectedErrors = collectConsoleErrors(page)

    await setupDemoAndNavigate(page, QUANTUM_ROUTE)
    await waitForQuantumPage(page)

    const cardsGrid = page.getByTestId('dashboard-cards-grid')

    // Each card's CardWrapper title (h2) must render exactly once AND be
    // visible to the user. `toHaveCount(1)` catches duplicate-render
    // regressions that `.first()` would silently mask; `toBeVisible` ensures
    // the card is actually painted (not collapsed, hidden, or offscreen).
    // level=2+exact pins the assertion to the wrapper title and not a body
    // subheading.
    for (const heading of [HEADING_QUBIT_GRID, HEADING_HISTOGRAM, HEADING_CIRCUIT, HEADING_CONTROL_PANEL]) {
      const cardHeading = cardsGrid.getByRole('heading', {
        level: 2,
        name: heading,
        exact: true,
      })
      await expect(cardHeading).toHaveCount(1, { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(cardHeading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }

    // Each card must mount with a `data-card-type` wrapper, proving the
    // CardWrapper rendered the body (not just the heading from a fallback).
    for (const heading of [HEADING_QUBIT_GRID, HEADING_HISTOGRAM, HEADING_CIRCUIT, HEADING_CONTROL_PANEL]) {
      const card = findQuantumCardByHeading(page, heading)
      await expect(card).toHaveCount(1, { timeout: PAGE_LOAD_TIMEOUT_MS })
    }

    // No render-error / cache-hydration crashes should reach the console.
    assertNoUnexpectedErrors()
  })

  test('control panel: shows "Not configured" badge in default demo state', async ({ page }) => {
    // Default demo mode: workload reports nothing because the auth-status hook
    // is short-circuited by the global demo-mode flag (effectiveEnabled=false).
    // The hook returns DEFAULT_AUTH_STATUS (tokenStored:false, lastIbmError:null)
    // → ibmCredentialState="none" → "Not configured" badge renders.
    await setupDemoAndNavigate(page, QUANTUM_ROUTE)
    await waitForQuantumPage(page)

    const controlPanelCard = findQuantumCardByHeading(page, HEADING_CONTROL_PANEL)
    await expect(controlPanelCard).toHaveCount(1, { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Assert uniqueness BEFORE visibility. `toBeVisible` runs in strict mode
    // (no implicit `.first()`), so if the badge text appears more than once
    // in the card body — e.g., a tooltip, status pill, or sr-only label —
    // we want a clear strict-mode error, not a confusing visibility failure.
    const badge = controlPanelCard.getByText(BADGE_NOT_CONFIGURED)
    await expect(badge).toHaveCount(1, { timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(badge).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })
})
