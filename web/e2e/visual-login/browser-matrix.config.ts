import { defineConfig } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.VISUAL_LOGIN_BASE_URL
  || process.env.PLAYWRIGHT_BASE_URL
  || process.env.LIVE_CANARY_CONSOLE_URL
  || 'http://localhost:4173'

export default defineConfig({
  testDir: '.',
  testMatch: ['browser-matrix/*.spec.ts'],
  timeout: isCI ? 180_000 : 120_000,
  expect: { timeout: isCI ? 15_000 : 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI
    ? [
        ['list'],
        ['json', { outputFile: 'test-results/browser-matrix-results/results.json' }],
        ['github'],
      ]
    : [['html', { open: 'never', outputFolder: 'browser-matrix-report' }], ['list']],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'live-chromium', use: { browserName: 'chromium' } },
    { name: 'live-firefox', use: { browserName: 'firefox' } },
    { name: 'live-webkit', use: { browserName: 'webkit' } },
  ],
  outputDir: 'test-results/browser-matrix',
})
