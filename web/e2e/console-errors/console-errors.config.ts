import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for console error scanning.
 *
 * Traverses every route in the KubeStellar Console and captures Chrome
 * DevTools console messages (info, warn, error) plus uncaught exceptions.
 * Runs against a production build by default; override with
 * PLAYWRIGHT_BASE_URL to point at a running server.
 */

const PREVIEW_PORT = 4176
const DEV_PORT = 5174
const useDevServer = !!process.env.PERF_DEV

function getWebServer() {
  if (process.env.PLAYWRIGHT_BASE_URL) return undefined

  if (useDevServer) {
    return {
      command: `npm run dev -- --port ${DEV_PORT} --host`,
      url: `http://127.0.0.1:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    }
  }

  return {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --host`,
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: 600_000,        // 10 min — many routes to visit
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,              // Sequential — single browser context
  reporter: [
    ['json', { outputFile: '../test-results/console-errors-results.json' }],
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
  outputDir: '../test-results/console-errors',
})
