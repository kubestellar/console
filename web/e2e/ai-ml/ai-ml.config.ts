import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for AI/ML dashboard integration testing.
 *
 * Tests stack discovery, Prometheus metrics, LLM-d visualization cards,
 * and comprehensive stack enumeration across clusters.
 *
 * Requires a live backend with connected clusters and deployed llm-d stacks.
 */

/** Port for the vite preview server (static frontend, API calls use fallback paths) */
const PREVIEW_PORT = 4176

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
    ['json', { outputFile: '../test-results/ai-ml-results.json' }],
    ['html', { open: 'never', outputFolder: '../ai-ml-report' }],
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
  outputDir: '../test-results/ai-ml',
})
