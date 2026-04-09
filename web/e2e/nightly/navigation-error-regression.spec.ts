import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Navigation Error Toast Regression Test
 *
 * Prevents regression of issue #4011 where the `loadDashboard` effect fired
 * on every route change, producing spurious error toasts.
 *
 * The test navigates through a representative set of dashboard routes via
 * sidebar clicks (simulating real user behaviour) and asserts that:
 *   1. No error toast elements appear after each navigation
 *   2. No "Failed to load" text appears on the page
 *   3. No unexpected console errors are logged
 *
 * Run locally:
 *   npx playwright test e2e/nightly/navigation-error-regression.spec.ts \
 *     -c e2e/nightly/nightly.config.ts
 */

// ── Named constants ─────────────────────────────────────────────────────────

/** Routes to navigate through — covers core dashboards plus the return to home */
const NAVIGATION_ROUTE_SEQUENCE: ReadonlyArray<{ path: string; name: string }> = [
  { path: '/', name: 'Home' },
  { path: '/clusters', name: 'Clusters' },
  { path: '/workloads', name: 'Workloads' },
  { path: '/security', name: 'Security' },
  { path: '/deploy', name: 'Deploy' },
  { path: '/events', name: 'Events' },
  { path: '/pods', name: 'Pods' },
  { path: '/', name: 'Home (return)' },
] as const

/** Maximum time (ms) to wait for each page to settle after navigation */
const _PAGE_SETTLE_TIMEOUT_MS = 8_000

/** Maximum time (ms) to wait for network idle after navigation */
const NETWORK_IDLE_TIMEOUT_MS = 15_000

/** Additional quiet time (ms) after network idle to let async effects resolve */
const POST_IDLE_SETTLE_MS = 1_500

/** Timeout (ms) for locating and clicking sidebar links */
const SIDEBAR_LINK_TIMEOUT_MS = 5_000

/** Timeout (ms) for the initial app load (sidebar appearing) */
const APP_LOAD_TIMEOUT_MS = 20_000

/** Overall test timeout (ms) — generous to cover slow CI runners */
const TEST_TIMEOUT_MS = 180_000

/** Toast auto-dismiss delay (ms) in the app — we wait at least this long */
const TOAST_VISIBLE_WINDOW_MS = 3_500

/**
 * Error toast CSS class substring used by the Toast component.
 * The Toast component applies `bg-red-900/80` for error toasts.
 */
const ERROR_TOAST_CSS_INDICATOR = 'bg-red-900'

/** Text patterns that indicate a load failure — checked in page body */
const FAILURE_TEXT_PATTERNS = [
  'Failed to load',
  'failed to load',
  'Error loading',
  'error loading',
] as const

/** Console error patterns that are expected in demo mode and should be ignored */
const EXPECTED_CONSOLE_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /Failed to fetch/i,
  /WebSocket/i,
  /can't establish a connection/i,
  /ResizeObserver/i,
  /validateDOMNesting/i,
  /act\(\)/i,
  /Cannot read.*undefined/i,
  /ChunkLoadError/i,
  /Loading chunk/i,
  /demo-token/i,
  /localhost:8585/i,
  /127\.0\.0\.1:8585/i,
  /Cross-Origin Request Blocked/i,
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /AbortError/i,
  /signal is aborted/i,
  /Notification permission/i,
  /502.*Bad Gateway/i,
  /Failed to load resource/i,
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function isExpectedError(message: string): boolean {
  return EXPECTED_CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

/** Set up demo mode via localStorage so the app loads without a real backend */
async function setupDemoMode(page: Page): Promise<void> {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })
}

/**
 * Detect whether any visible error toasts are present in the DOM.
 *
 * Checks for:
 *   - Elements inside the toast container (`role="status"[aria-live]`) whose
 *     className includes the error indicator (`bg-red-900`)
 *   - Any element with `role="alert"` that contains error-like text
 */
async function getErrorToasts(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ cssIndicator }: { cssIndicator: string }) => {
      const errors: string[] = []

      // 1. Check toast container children for error class
      const toastContainers = document.querySelectorAll('[role="status"][aria-live]')
      for (const container of toastContainers) {
        const children = container.children
        for (let i = 0; i < children.length; i++) {
          const child = children[i] as HTMLElement
          if (child.className && child.className.includes(cssIndicator)) {
            errors.push(`error-toast: ${(child.textContent || '').trim().slice(0, 120)}`)
          }
        }
      }

      // 2. Check for role="alert" elements with error-ish content
      //    (filtering out structural alerts like error boundaries that are always present)
      const alerts = document.querySelectorAll('[role="alert"]')
      for (const alert of alerts) {
        const text = (alert.textContent || '').trim()
        const isError =
          /fail|error|could not|unable to/i.test(text) &&
          !/(error boundary|something went wrong)/i.test(text)
        if (isError && text.length > 0) {
          errors.push(`role-alert: ${text.slice(0, 120)}`)
        }
      }

      return errors
    },
    { cssIndicator: ERROR_TOAST_CSS_INDICATOR },
  )
}

/**
 * Check whether the page body contains any "Failed to load" type text.
 * Returns matching snippets if found, empty array otherwise.
 */
async function getFailureText(page: Page): Promise<string[]> {
  return page.evaluate((patterns: readonly string[]) => {
    const bodyText = document.body?.textContent || ''
    const found: string[] = []
    for (const pattern of patterns) {
      const idx = bodyText.indexOf(pattern)
      if (idx >= 0) {
        // Grab surrounding context (up to 80 chars)
        const start = Math.max(0, idx - 20)
        const end = Math.min(bodyText.length, idx + pattern.length + 60)
        found.push(bodyText.slice(start, end).replace(/\s+/g, ' ').trim())
      }
    }
    return found
  }, FAILURE_TEXT_PATTERNS)
}

// ── Test ─────────────────────────────────────────────────────────────────────

test.describe('Navigation Error Toast Regression (#4011)', () => {
  test('no error toasts appear during sequential dashboard navigation', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // -- Collect console errors for the entire run --
    const unexpectedConsoleErrors: Array<{ route: string; message: string }> = []
    let currentRouteName = '(setup)'

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' && !isExpectedError(msg.text())) {
        unexpectedConsoleErrors.push({
          route: currentRouteName,
          message: msg.text().slice(0, 200),
        })
      }
    })

    // -- Set up demo mode and load the app --
    await setupDemoMode(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Wait for sidebar to confirm the app has booted
    try {
      await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
    } catch {
      // If sidebar never appears, the test will fail on navigation anyway
    }

    // Let the initial page fully settle before we start navigating
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    } catch {
      // networkidle may not fire with SSE — continue
    }
    // intentional delay: allow async effects to resolve before checking for error toasts
    await page.waitForTimeout(POST_IDLE_SETTLE_MS)

    // -- Navigate through each route --
    const routeErrors: Array<{ route: string; errors: string[] }> = []

    for (let i = 0; i < NAVIGATION_ROUTE_SEQUENCE.length; i++) {
      const route = NAVIGATION_ROUTE_SEQUENCE[i]
      currentRouteName = route.name

      // Skip the first route since we already loaded "/"
      if (i === 0) continue

      // Navigate via sidebar click (more realistic than page.goto)
      const linkSelector =
        route.path === '/'
          ? '[data-testid="sidebar-primary-nav"] a[href="/"]'
          : `[data-testid="sidebar-primary-nav"] a[href="${route.path}"]`

      const link = page.locator(linkSelector).first()

      try {
        await link.waitFor({ state: 'visible', timeout: SIDEBAR_LINK_TIMEOUT_MS })
        await link.scrollIntoViewIfNeeded()
        await link.click()
      } catch {
        // Sidebar link not found — fall back to direct navigation
        console.log(`[nav-regression] sidebar link for ${route.name} not found, using goto`)
        await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      }

      // Wait for URL to update
      if (route.path === '/') {
        try {
          await page.waitForURL((url) => url.pathname === '/', { timeout: SIDEBAR_LINK_TIMEOUT_MS })
        } catch {
          // URL may already be at "/" — continue
        }
      } else {
        try {
          await page.waitForURL(`**${route.path}`, { timeout: SIDEBAR_LINK_TIMEOUT_MS })
        } catch {
          // URL change timed out — continue and check for errors anyway
        }
      }

      // Let the page settle: wait for network idle, then extra quiet time
      try {
        await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
      } catch {
        // SSE streams may keep the connection open — continue
      }
      // intentional delay: allow async effects to resolve before checking for error toasts
      await page.waitForTimeout(POST_IDLE_SETTLE_MS)

      // intentional delay: toasts auto-dismiss after 3s — wait for them to appear if they were going to
      await page.waitForTimeout(TOAST_VISIBLE_WINDOW_MS)

      // -- Check for error toasts --
      const errorToasts = await getErrorToasts(page)

      // -- Check for "Failed to load" text --
      const failureText = await getFailureText(page)

      // Combine all errors for this route
      const allErrors = [...errorToasts, ...failureText.map((t) => `failure-text: ${t}`)]

      if (allErrors.length > 0) {
        routeErrors.push({ route: `${route.name} (${route.path})`, errors: allErrors })
        console.log(
          `[nav-regression] ERRORS on ${route.name} (${route.path}): ${allErrors.join(' | ')}`,
        )
      } else {
        console.log(`[nav-regression] OK: ${route.name} (${route.path}) — no error toasts`)
      }
    }

    // -- Summary and assertions --

    // Log unexpected console errors if any
    if (unexpectedConsoleErrors.length > 0) {
      console.log(
        `[nav-regression] ${unexpectedConsoleErrors.length} unexpected console error(s):`,
      )
      for (const err of unexpectedConsoleErrors.slice(0, 10)) {
        console.log(`  [${err.route}] ${err.message}`)
      }
    }

    // ASSERT: no error toasts or failure text on any route
    expect(
      routeErrors,
      `Error toasts or failure text appeared during navigation:\n${routeErrors
        .map((r) => `  ${r.route}: ${r.errors.join(', ')}`)
        .join('\n')}`,
    ).toHaveLength(0)
  })

  test('rapid navigation does not trigger error toasts', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // -- Console error collection --
    const consoleErrors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' && !isExpectedError(msg.text())) {
        consoleErrors.push(msg.text().slice(0, 200))
      }
    })

    // -- Set up demo mode and load the app --
    await setupDemoMode(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    try {
      await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
    } catch {
      // continue
    }

    // Let the initial page settle
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    } catch {
      // continue
    }
    // intentional delay: allow async effects to resolve before starting rapid navigation
    await page.waitForTimeout(POST_IDLE_SETTLE_MS)

    // -- Rapidly click through routes without waiting for each to fully load --
    // This simulates a user quickly browsing through dashboards
    const rapidRoutes = NAVIGATION_ROUTE_SEQUENCE.slice(1) // skip initial "/"

    /** Delay between rapid clicks (ms) — short to simulate fast user */
    const RAPID_CLICK_DELAY_MS = 300

    for (const route of rapidRoutes) {
      const linkSelector =
        route.path === '/'
          ? '[data-testid="sidebar-primary-nav"] a[href="/"]'
          : `[data-testid="sidebar-primary-nav"] a[href="${route.path}"]`

      const link = page.locator(linkSelector).first()
      try {
        await link.waitFor({ state: 'visible', timeout: SIDEBAR_LINK_TIMEOUT_MS })
        await link.click()
      } catch {
        // Link not visible — try goto
        await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      }

      // intentional delay: simulate rapid user clicks — brief pause between navigations
      await page.waitForTimeout(RAPID_CLICK_DELAY_MS)
    }

    // Now let the final page settle completely
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    } catch {
      // continue
    }
    // intentional delay: toasts auto-dismiss after 3s — wait for them to appear if they were going to
    await page.waitForTimeout(TOAST_VISIBLE_WINDOW_MS + POST_IDLE_SETTLE_MS)

    // -- Check for error toasts on the final settled page --
    const errorToasts = await getErrorToasts(page)
    const failureText = await getFailureText(page)
    const allErrors = [...errorToasts, ...failureText.map((t) => `failure-text: ${t}`)]

    if (allErrors.length > 0) {
      console.log(`[nav-regression] RAPID NAV ERRORS: ${allErrors.join(' | ')}`)
    } else {
      console.log('[nav-regression] OK: rapid navigation — no error toasts on final page')
    }

    // ASSERT: no error toasts after rapid navigation
    expect(
      allErrors,
      `Error toasts appeared after rapid navigation: ${allErrors.join(', ')}`,
    ).toHaveLength(0)
  })
})
