import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for LLM-d Benchmarks dashboard tests.
 *
 * Tests benchmark cards (live Google Drive data via SSE streaming),
 * nightly E2E status (live GitHub Actions data), and
 * console.kubestellar.io Netlify function responses.
 */

/** Port for the vite preview server (static frontend, API calls use fallback paths) */
const PREVIEW_PORT = 4175

function getWebServer() {
  if (process.env.PLAYWRIGHT_BASE_URL) return undefined

  return {
    command: `test -d dist || npm run build; npx vite preview --port ${PREVIEW_PORT} --host`,
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  }
}

// Per-test timeout. The in-test waitForFunction assertions use 15-30s
// timeouts (STREAM_DATA_TIMEOUT_MS, NETLIFY_FETCH_TIMEOUT_MS in the spec),
// so the outer Playwright timeout only matters as a backstop when a page
// hangs. 5 minutes was vastly over-budget — a single retry storm against
// live Google Drive / GitHub Actions / Netlify could eat 20+ minutes and
// cancel the whole nightly-test-suite workflow at 90m (seen on 2026-04-13
// through 04-15). 2 minutes is enough backstop for the slowest real case
// (SSE streaming + chart render on a cold preview server) without letting
// a hang compound across all 12 tests.
const PER_TEST_TIMEOUT_MS = 120_000

export default defineConfig({
  testDir: '.',
  timeout: PER_TEST_TIMEOUT_MS,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: 1,
  reporter: [
    ['json', { outputFile: '../test-results/benchmark-results.json' }],
    ['html', { open: 'never', outputFolder: '../benchmark-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PREVIEW_PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: getWebServer(),
  outputDir: '../test-results/benchmarks',
})
