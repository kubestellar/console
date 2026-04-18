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

// Per-test timeout backstop. The in-test waitForFunction assertions use
// 15-30s timeouts (STREAM_DATA_TIMEOUT_MS, NETLIFY_FETCH_TIMEOUT_MS in the
// spec), so this outer Playwright timeout only fires when a page truly hangs.
// 60s is enough for the slowest real case (SSE stream + chart render on a
// cold preview server) while preventing a single hang from eating minutes
// of wall time — with 12 tests, even 2m × 12 = 24m was too much headroom
// when the nightly-test-suite workflow has a 120m budget shared with Go +
// security suites.
const PER_TEST_TIMEOUT_MS = 60_000

export default defineConfig({
  testDir: '.',
  timeout: PER_TEST_TIMEOUT_MS,
  expect: { timeout: 20_000 },
  // retries:0 — benchmark tests hit live external services (Google Drive,
  // GitHub Actions, Netlify functions) so retries double wall time on every
  // flake without improving signal. Accept the occasional red rather than
  // routinely burning 20+ extra minutes in the nightly suite (#8262).
  retries: 0,
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
