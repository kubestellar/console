import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PERF_BUDGET_IDLE_COMMITS_PER_SEC,
  IDLE_SAMPLE_WINDOW_MS,
  NAVIGATION_SETTLE_MS,
  PERF_SIGNAL_REACT_COMMITS_IDLE,
} from './constants'

/**
 * Idle React-commit-rate perf gate.
 *
 * Companion to react-commits.spec.ts. That spec measures commits during a
 * single SPA navigation; this one measures the **steady-state** commits/sec
 * after the page has fully settled with no user input. The two together
 * catch two distinct regression classes:
 *
 *  - navigation: a #6149-style cascade that runs during route transitions
 *  - idle: a #6201-style cascade where a wall-clock interval, an unstable
 *    provider value, or a sub-second tick keeps re-rendering the tree
 *    forever even when nothing is happening
 *
 * The idle case is invisible to the navigation gate because that gate only
 * watches the 2-second window after a sidebar click. A 1Hz ticker that
 * fires forever would never be flagged by the navigation gate; it would
 * happily report 14 commits per nav while accumulating ~30 commits/sec
 * idle in the background. We need a separate signal for it.
 *
 * Same dev-server requirement as react-commits.spec.ts: React 19 only calls
 * `onCommitFiberRoot` in dev mode, so this runs against `vite dev` via
 * `PERF_DEV=1` in the workflow.
 *
 * See #6201 for the regression class this gate exists to catch.
 */

const HOME_ROUTE = '/'

// localStorage keys+values that force demo mode AND seed the demo token.
// Same rationale as react-commits.spec.ts: without both, the auth-revalidate
// path runs and adds noise to the count. See #6176/#6178 for the original
// fix on the navigation spec.
const DEMO_MODE_STORAGE_KEY = 'kc-demo-mode'
const DEMO_MODE_STORAGE_VALUE = 'true'
const TOKEN_STORAGE_KEY = 'token'
const DEMO_TOKEN_VALUE = 'demo-token'

const COMMIT_COUNTER_KEY = '__perfCommitCount'

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

let recordedRate = -1

test.afterAll(() => {
  if (recordedRate < 0) {
    // Test never reached the measurement step — write a sentinel so the
    // workflow surfaces the failure path.
    recordedRate = Number.MAX_SAFE_INTEGER
  }
  const result: PerfResult = {
    signal: PERF_SIGNAL_REACT_COMMITS_IDLE,
    displayName: 'Dashboard idle React commits per second',
    value: recordedRate,
    budget: PERF_BUDGET_IDLE_COMMITS_PER_SEC,
    unit: 'commits/sec',
    context: {
      sampleWindowMs: IDLE_SAMPLE_WINDOW_MS,
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

test('react idle commit rate stays under budget', async ({ page }) => {
  await page.addInitScript(
    ({ demoKey, demoValue, tokenKey, tokenValue }) => {
      try {
        window.localStorage.setItem(demoKey, demoValue)
        window.localStorage.setItem(tokenKey, tokenValue)
        window.localStorage.setItem('kc-agent-setup-dismissed', 'true')
      } catch {
        // Ignore — same as the navigation spec.
      }
    },
    {
      demoKey: DEMO_MODE_STORAGE_KEY,
      demoValue: DEMO_MODE_STORAGE_VALUE,
      tokenKey: TOKEN_STORAGE_KEY,
      tokenValue: DEMO_TOKEN_VALUE,
    },
  )

  // Install the fake DevTools hook BEFORE any app script runs. Same minimal
  // shape the navigation spec uses — React 19 calls onCommitFiberRoot on
  // every commit when supportsFiber is true.
  await page.addInitScript(
    ({ counterKey }) => {
      const w = window as unknown as Record<string, unknown>
      w[counterKey] = 0
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
  // Initial settle: let cold-mount + first data fetches finish before we
  // start counting. Without this we'd be measuring mount + initial fetches
  // (the ~44/sec phase), not steady state.
  await page.waitForTimeout(NAVIGATION_SETTLE_MS)

  // Reset counter to zero so we measure ONLY the idle window from here on.
  await page.evaluate((key) => {
    ;(window as unknown as Record<string, number>)[key] = 0
  }, COMMIT_COUNTER_KEY)

  // Sit idle for IDLE_SAMPLE_WINDOW_MS. No clicks, no navigation, no
  // mouse movement — anything we do here would inject input events and
  // contaminate the count.
  await page.waitForTimeout(IDLE_SAMPLE_WINDOW_MS)

  const commits = await page.evaluate(
    (key) => (window as unknown as Record<string, number>)[key] ?? -1,
    COMMIT_COUNTER_KEY,
  )

  const rate = commits / (IDLE_SAMPLE_WINDOW_MS / 1000)
  recordedRate = rate

  expect(
    rate,
    `Idle React commits/sec (${rate.toFixed(2)}, ${commits} commits over ${IDLE_SAMPLE_WINDOW_MS}ms) exceeded budget ${PERF_BUDGET_IDLE_COMMITS_PER_SEC}`,
  ).toBeLessThanOrEqual(PERF_BUDGET_IDLE_COMMITS_PER_SEC)
})
