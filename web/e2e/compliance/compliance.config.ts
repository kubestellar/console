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
    timeout: 180_000,
  }
}

const port = useDevServer ? DEV_PORT : PREVIEW_PORT

export default defineConfig({
  testDir: '.',
  timeout: IS_CI ? 1_200_000 * CI_TIMEOUT_MULTIPLIER : 1_200_000, // 20 min local, 40 min CI
  expect: { timeout: IS_CI ? 60_000 : 30_000 },
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
