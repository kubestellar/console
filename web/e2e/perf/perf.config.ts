import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for dashboard performance testing.
 *
 * Uses `vite preview` (production build) by default so measurements reflect
 * what users actually experience — bundled chunks, not unbundled ESM.
 * Override with PLAYWRIGHT_BASE_URL or PERF_DEV=1 for dev server testing.
 *
 * Runs sequentially (1 worker) so each measurement gets a clean
 * browser context without contention.
 */

const PREVIEW_PORT = 4174
const DEV_PORT = 5174
const useDevServer = !!process.env.PERF_DEV

function getWebServer() {
  if (process.env.PLAYWRIGHT_BASE_URL) return undefined

  if (useDevServer) {
    return {
      command: `npm run dev -- --port ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    }
  }

  // Production build + preview server — measures real bundled performance
  return {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT}`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: [
    ['json', { outputFile: '../test-results/perf-results.json' }],
    ['html', { open: 'never', outputFolder: '../perf-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: getWebServer(),
  outputDir: '../test-results/perf',
})
