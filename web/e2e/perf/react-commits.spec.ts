import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PERF_BUDGET_NAVIGATION_COMMITS,
  NAVIGATION_SETTLE_MS,
  PERF_SIGNAL_REACT_COMMITS_NAV,
} from './constants'

/**
 * React-commits-per-navigation perf gate.
 *
 * Counts how many React commits happen during a single SPA navigation by
 * installing a fake `__REACT_DEVTOOLS_GLOBAL_HOOK__` BEFORE the app bundle
 * loads. The real DevTools hook is gated on non-prod (dev / preview with
 * __DEV__), so this file runs against the vite dev server via PERF_DEV=1
 * in the workflow.
 *
 * Writes a perf-result.json that the reusable auto-issue workflow picks up.
 *
 * See #6149 for the regression this gate exists to catch.
 */

// Where the landing route settles. '/' bounces to the default dashboard.
const HOME_ROUTE = '/'
// Target route for the navigation under measurement.
const NAV_TARGET_ROUTE = '/clusters'
// URL glob passed to waitForURL after the sidebar link click. Matches any
// protocol/host with the target path.
const NAV_TARGET_URL_GLOB = '**/clusters'
// Case-insensitive accessible-name matcher for the sidebar link. Matches the
// rendered "Clusters" link in the KubeStellar sidebar without locking us to
// a brittle CSS selector.
const NAV_TARGET_LINK_NAME = /clusters/i
// localStorage keys+values that force demo mode AND seed the demo token. The
// CI runner has no backend, so without BOTH set:
//   - missing kc-demo-mode → app falls through to the login screen
//   - missing token         → AuthProvider.refreshUser() runs
//                             checkOAuthConfiguredWithRetry() (5 retries × 2s
//                             = up to 10s of background re-renders) and the
//                             commit counter measures auth-revalidate noise
//                             instead of the SPA navigation cost (#6176).
//
// These mirror src/lib/constants/storage.ts:
//   STORAGE_KEY_DEMO_MODE = 'kc-demo-mode'
//   STORAGE_KEY_TOKEN     = 'token'
//   DEMO_TOKEN_VALUE      = 'demo-token'
const DEMO_MODE_STORAGE_KEY = 'kc-demo-mode'
const DEMO_MODE_STORAGE_VALUE = 'true'
const TOKEN_STORAGE_KEY = 'token'
const DEMO_TOKEN_VALUE = 'demo-token'

// The init script uses a named global so we can read it later from the page.
const COMMIT_COUNTER_KEY = '__perfCommitCount'

// Resolve the repo root so we can write perf-result.json at a stable path
// regardless of where playwright was launched from.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_DIR = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(WEB_DIR, '..')
const RESULT_FILE = path.join(REPO_ROOT, 'web', 'perf-result.json')

interface PerfResult {
  signal: string
  displayName: string
  value: number
  budget: number
  unit: string
  context: Record<string, string | number | undefined>
}

let recordedCommits = -1

test.afterAll(() => {
  if (recordedCommits < 0) {
    // Test never ran far enough to record — still write a result so the
    // workflow can surface the failure path.
    recordedCommits = Number.MAX_SAFE_INTEGER
  }
  const result: PerfResult = {
    signal: PERF_SIGNAL_REACT_COMMITS_NAV,
    displayName: 'Dashboard navigation React commits',
    value: recordedCommits,
    budget: PERF_BUDGET_NAVIGATION_COMMITS,
    unit: 'commits',
    context: {
      navigatedTo: NAV_TARGET_ROUTE,
      runId: process.env.GITHUB_RUN_ID,
      runUrl:
        process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : undefined,
      headSha: process.env.GITHUB_SHA,
      lastSuccessfulSha: process.env.LAST_SUCCESSFUL_SHA,
    },
  }
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2))
})

test('react commits per navigation stays under budget', async ({ page }) => {
  // Force demo mode BEFORE any app script runs. In CI there's no backend and
  // no kc-agent, so without this the app would bounce to the login screen and
  // the sidebar link we click below wouldn't exist. Demo mode short-circuits
  // auth and serves canned data — exactly the same thing the Settings page
  // toggle does. See #6170.
  await page.addInitScript(
    ({ demoKey, demoValue, tokenKey, tokenValue }) => {
      try {
        window.localStorage.setItem(demoKey, demoValue)
        window.localStorage.setItem(tokenKey, tokenValue)
      } catch {
        // Ignore: happens when the test storage partition is not yet
        // available. The next page load will still see the attempt.
      }
    },
    {
      demoKey: DEMO_MODE_STORAGE_KEY,
      demoValue: DEMO_MODE_STORAGE_VALUE,
      tokenKey: TOKEN_STORAGE_KEY,
      tokenValue: DEMO_TOKEN_VALUE,
    },
  )

  // Install the fake DevTools hook BEFORE any app script runs. React 19
  // calls `onCommitFiberRoot` on every commit when the hook is present.
  await page.addInitScript(
    ({ counterKey }) => {
      const w = window as unknown as Record<string, unknown>
      w[counterKey] = 0
      // Minimal shape React looks for. supportsFiber must be true; the
      // renderer id returned from inject is unused here.
      const hook = {
        supportsFiber: true,
        renderers: new Map(),
        onCommitFiberRoot: () => {
          w[counterKey] = (w[counterKey] as number) + 1
        },
        onCommitFiberUnmount: () => {},
        inject: () => 1,
      }
      ;(w as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
    },
    { counterKey: COMMIT_COUNTER_KEY },
  )

  await page.goto(HOME_ROUTE)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(NAVIGATION_SETTLE_MS)

  // Reset counter — we only care about commits caused by the navigation.
  await page.evaluate((key) => {
    ;(window as unknown as Record<string, number>)[key] = 0
  }, COMMIT_COUNTER_KEY)

  // Real client-side navigation: click the sidebar link instead of calling
  // `page.goto(NAV_TARGET_ROUTE)`. `page.goto` triggers a full document load,
  // which would mount the entire React tree from scratch and measure the
  // cold-mount cost — NOT the in-app SPA route transition that #6149 is
  // about. Clicking the link exercises the React Router transition, which
  // is exactly what we want to budget. See #6170.
  await page.getByRole('link', { name: NAV_TARGET_LINK_NAME }).first().click()
  await page.waitForURL(NAV_TARGET_URL_GLOB)
  await page.waitForTimeout(NAVIGATION_SETTLE_MS)

  const count = await page.evaluate(
    (key) => (window as unknown as Record<string, number>)[key] ?? -1,
    COMMIT_COUNTER_KEY,
  )
  recordedCommits = count

  expect(
    count,
    `React commits during navigation (${count}) exceeded budget ${PERF_BUDGET_NAVIGATION_COMMITS}`,
  ).toBeLessThanOrEqual(PERF_BUDGET_NAVIGATION_COMMITS)
})
