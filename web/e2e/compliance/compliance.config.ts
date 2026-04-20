import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for card loading compliance testing.
 *
 * Validates that all 150+ cards display correct loading behavior in
 * non-demo mode: clean skeletons (no demo badges), proper refresh
 * animation, SSE streaming, cache-then-update pattern.
 *
 * Uses `vite preview` (production build) by default.
 * Override with PLAYWRIGHT_BASE_URL or PERF_DEV=1 for dev server testing.
 *
 * Runs sequentially (1 worker) — cold→warm phases share browser state.
 *
 * ---------------------------------------------------------------------------
 * TOPOLOGY NOTE (#9077)
 * ---------------------------------------------------------------------------
 * This config uses a DIFFERENT server topology from the main
 * `playwright.config.ts`:
 *
 *   | Config                | Server              | Port | API routes |
 *   | --------------------- | ------------------- | ---- | ---------- |
 *   | playwright.config.ts  | Go backend (go run) | 8080 | Real       |
 *   | compliance.config.ts  | Vite preview        | 4174 | 404 unless mocked |
 *
 * The Go backend serves both the API and the built frontend. Vite preview
 * serves only static assets — any API request that is not explicitly mocked
 * will fall through to a 404.
 *
 * Tests written for THIS config MUST mock every API endpoint they rely on.
 * They cannot assume a real backend is reachable. Conversely, tests that
 * depend on real backend behavior (end-to-end deploy flows, live clusters)
 * must use the main `playwright.config.ts`, not this one.
 *
 * If you need to run the same test file under both configs, make sure the
 * test mocks all data endpoints so its behavior is topology-agnostic.
 * ---------------------------------------------------------------------------
 */

const PREVIEW_PORT = 4174
const DEV_PORT = 5174
const useDevServer = !!process.env.PERF_DEV
const IS_CI = !!process.env.CI
const CI_TIMEOUT_MULTIPLIER = 2

// Per-test timeout — applies to each test() in the compliance suite.
// Before Issue 9088 the compliance suite ran as a single monolithic test with
// a 40-minute timeout (20min × CI_TIMEOUT_MULTIPLIER). Now that the card
// loading compliance test is split into per-batch tests, each batch processes
// ~24 cards and finishes well under 5 minutes. CI doubles this (10 min) to
// tolerate runner jitter and cold Vite compiles.
const PER_TEST_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// Expect assertion timeout — upstream was 30s local / 60s CI; keep as-is since
// individual DOM waits are the same regardless of how the suite is sliced.
const EXPECT_TIMEOUT_LOCAL_MS = 30_000
const EXPECT_TIMEOUT_CI_MS = 60_000

// Retry count — CI gets 1 retry so transient execution-context failures
// (navigation mid-read, slow Vite module compile) can self-recover instead of
// failing the whole PR. Local runs get 0 retries to keep the signal loud.
const CI_RETRIES = 1
const LOCAL_RETRIES = 0

// Web server start-up windows (unchanged from pre-split config).
const DEV_SERVER_STARTUP_MS = 120_000
const PREVIEW_SERVER_STARTUP_MS = 180_000

function getWebServer() {
  if (process.env.PLAYWRIGHT_BASE_URL) return undefined

  if (useDevServer) {
    return {
      command: `npm run dev -- --port ${DEV_PORT} --host`,
      url: `http://127.0.0.1:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: DEV_SERVER_STARTUP_MS,
    }
  }

  return {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --host`,
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    reuseExistingServer: true,
    timeout: PREVIEW_SERVER_STARTUP_MS,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  // Per-test timeout (PER_TEST_TIMEOUT_MS × CI_TIMEOUT_MULTIPLIER in CI).
  // Tightened from the old 40-minute monolithic cap (Issue 9088) — each
  // per-batch test now does ~1/N the work, so the timeout can be ~1/4 what
  // the single monolithic test used to need.
  timeout: IS_CI ? PER_TEST_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_TEST_TIMEOUT_MS,
  expect: { timeout: IS_CI ? EXPECT_TIMEOUT_CI_MS : EXPECT_TIMEOUT_LOCAL_MS },
  // CI gets 1 retry to self-recover from transient issues (execution-context
  // destroyed mid-read, slow cold Vite compile). Local runs keep 0 retries
  // so flake shows up immediately instead of hiding.
  retries: IS_CI ? CI_RETRIES : LOCAL_RETRIES,
  // Keep workers=1 — the card loading compliance suite runs serially because
  // cold→warm phases share in-browser localStorage + IndexedDB state.
  workers: 1,
  reporter: [
    ['json', { outputFile: '../test-results/compliance-results.json' }],
    ['html', { open: 'never', outputFolder: '../compliance-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: getWebServer(),
  outputDir: '../test-results/compliance',
})
