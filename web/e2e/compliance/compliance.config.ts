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
    timeout: 120_000,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: 1_200_000, // 20 minutes — cold + warm phases across all batches
  expect: { timeout: 30_000 },
  retries: 0,
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
