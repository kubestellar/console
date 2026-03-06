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

export default defineConfig({
  testDir: '.',
  timeout: 300_000,
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
