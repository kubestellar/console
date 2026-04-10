import { test, expect, type Page } from '@playwright/test'

/**
 * React commit budget guard (#6149).
 *
 * Catches regressions where a single dashboard-to-dashboard navigation
 * produces a cascade of React commits (hundreds instead of a handful).
 * Uses the React DevTools global hook (`__REACT_DEVTOOLS_GLOBAL_HOOK__`)
 * which React only calls in non-production builds when the hook is
 * installed before React itself loads — hence `addInitScript` and the
 * dev-server-only perf.config.ts (PERF_DEV=1).
 *
 * This test runs nightly only (see
 * .github/workflows/perf-react-commits-nightly.yml).
 */

// Maximum React commits allowed for a single dashboard-to-dashboard navigation.
// A correct navigation should be ~1-5 commits. We set the budget at 50 to give
// headroom for legitimate reactivity (suspended chunks resolving, query
// hydration, etc.) while still catching #6149-style cascades that produce
// hundreds of commits.
const PERF_BUDGET_NAVIGATION_COMMITS = 50

// How long to wait after navigation completes before stopping the commit
// counter. Long enough that any in-flight Suspense boundaries finish
// resolving (which produces 1-2 legitimate commits each).
const NAVIGATION_SETTLE_MS = 2_000

// Sentinel value returned from the page when the counter never initialized
// (e.g. init script didn't run). -1 forces the assertion to fail loudly
// instead of silently passing a zero-count.
const COMMIT_COUNT_SENTINEL_MISSING = -1

// Renderer ID used when stubbing the DevTools hook's internal map. React
// normally assigns this; a fixed value of 1 is fine because nothing else
// in the page consumes the map.
const STUB_RENDERER_ID = 1

declare global {
  interface Window {
    __reactCommitCount?: number
  }
}

async function installCommitCounter(page: Page) {
  await page.addInitScript(
    ({ stubRendererId }) => {
      // Install BEFORE React loads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hook: any = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ || {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
      window.__reactCommitCount = 0

      // The React DevTools hook fires `onCommitFiberRoot` for every commit.
      // Wrap whatever's already registered (or just install our own).
      const originalOnCommit = hook.onCommitFiberRoot
      hook.onCommitFiberRoot = function (...args: unknown[]) {
        window.__reactCommitCount = (window.__reactCommitCount ?? 0) + 1
        if (typeof originalOnCommit === 'function') {
          originalOnCommit.apply(hook, args)
        }
      }
      // Required for React to call onCommitFiberRoot at all:
      if (!hook.supportsFiber) hook.supportsFiber = true
      if (!hook.renderers) hook.renderers = new Map()
      if (!hook.inject) {
        hook.inject = (renderer: unknown) => {
          hook.renderers.set(stubRendererId, renderer)
          return stubRendererId
        }
      }
    },
    { stubRendererId: STUB_RENDERER_ID },
  )
}

test.describe('React commit budget', () => {
  test('dashboard-to-dashboard navigation stays under budget', async ({ page }) => {
    await installCommitCounter(page)

    // Land on the main dashboard and let it fully settle
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(NAVIGATION_SETTLE_MS)

    // Reset counter — we only care about the navigation itself
    await page.evaluate(() => {
      window.__reactCommitCount = 0
    })

    // Navigate to a different dashboard. Pick a stable one — adjust if
    // the route doesn't exist yet.
    await page.goto('/clusters')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(NAVIGATION_SETTLE_MS)

    const commits = await page.evaluate(
      (missing) => window.__reactCommitCount ?? missing,
      COMMIT_COUNT_SENTINEL_MISSING,
    )

    expect(
      commits,
      `dashboard navigation produced ${commits} React commits — budget is ${PERF_BUDGET_NAVIGATION_COMMITS}`,
    ).toBeLessThanOrEqual(PERF_BUDGET_NAVIGATION_COMMITS)
    expect(
      commits,
      'commit counter was never initialized — addInitScript did not run',
    ).toBeGreaterThanOrEqual(0)
  })
})
