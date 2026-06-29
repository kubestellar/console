import { defineConfig } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.LIVE_CANARY_CONSOLE_URL
  || process.env.SELF_HOSTED_CONSOLE_URL
  || process.env.VISUAL_LOGIN_BASE_URL
  || process.env.PLAYWRIGHT_BASE_URL
  || 'http://127.0.0.1:18081'

export default defineConfig({
  testDir: '.',
  testMatch: ['macos-popup/*.spec.ts'],
  timeout: isCI ? 180_000 : 120_000,
  expect: { timeout: isCI ? 15_000 : 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI
    ? [
        ['list'],
        ['json', { outputFile: 'test-results/macos-popup-results/results.json' }],
        ['github'],
      ]
    : [['html', { open: 'never', outputFolder: 'macos-popup-report' }], ['list']],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'macos-webkit', use: { browserName: 'webkit' } },
  ],
  outputDir: 'test-results/macos-popup',
})
