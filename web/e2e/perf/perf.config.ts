import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for dashboard performance testing.
 *
 * Runs sequentially (1 worker) so each measurement gets a clean
 * browser context without contention.
 */
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
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5174',
        url: 'http://localhost:5174',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  outputDir: '../test-results/perf',
})
