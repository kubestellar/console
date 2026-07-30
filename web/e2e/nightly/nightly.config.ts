import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for nightly dashboard health testing.
 *
 * Tests all 30+ dashboard routes for:
 *   - Console errors (unexpected JS errors)
 *   - Card rendering (content-loaded, visible cards)
 *   - Demo mode indicators (Demo badge)
 *   - No blank pages / crashes
 *
 * Uses production build (vite preview) by default.
 * Override with PLAYWRIGHT_BASE_URL for an already-running server.
 */

const PREVIEW_PORT = 4175
const DEV_PORT = 5174
const useDevServer = !!process.env.PERF_DEV
const IS_CI = !!process.env.CI

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
    command: `test -d dist || npm run build; npx vite preview --port ${PREVIEW_PORT} --host`,
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: IS_CI ? 300_000 : 180_000, // 5 min CI, 3 min local
  expect: { timeout: IS_CI ? 30_000 : 15_000 },
  retries: IS_CI ? 1 : 0,
  workers: 1, // Sequential — shares demo mode state
  reporter: [
    ['json', { outputFile: '../test-results/nightly-dashboard-results.json' }],
    ['html', { open: 'never', outputFolder: '../nightly-report' }],
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
  outputDir: '../test-results/nightly',
})
