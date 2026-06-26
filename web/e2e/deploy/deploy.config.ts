import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for deploy dashboard integration testing.
 *
 * Tests workload listing, resource marshalling (dependency resolution),
 * cluster groups, deployment missions with logs, and deploy-status polling.
 *
 * Uses `vite preview` (production build) by default.
 * Override with PLAYWRIGHT_BASE_URL or PERF_DEV=1 for dev server testing.
 */

const PREVIEW_PORT = 4174
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
    timeout: 240_000, // Increased to 4 minutes for build stability
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: 120_000, // 2 min — tests use fully-mocked APIs, no real network I/O
  expect: { timeout: 20_000 },
  retries: 1, // 1 retry sufficient for flakes; avoids tripling wall-clock budget
  workers: 1,
  reporter: [
    ['json', { outputFile: '../test-results/deploy-results.json' }],
    ['html', { open: 'never', outputFolder: '../deploy-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: getWebServer(),
  outputDir: '../test-results/deploy',
})
