import { defineConfig } from '@playwright/test'
import {
  CI_EXPECT_TIMEOUT_MS,
  CI_LIVE_TEST_TIMEOUT_MS,
  LOCAL_EXPECT_TIMEOUT_MS,
  LOCAL_LIVE_TEST_TIMEOUT_MS,
} from './playwrightTiming'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.LIVE_CANARY_CONSOLE_URL
  || process.env.SELF_HOSTED_CONSOLE_URL
  || process.env.VISUAL_LOGIN_BASE_URL
  || process.env.PLAYWRIGHT_BASE_URL
  || 'http://127.0.0.1:18081'

export default defineConfig({
  testDir: '.',
  testMatch: ['macos-popup/*.spec.ts'],
  timeout: isCI ? CI_LIVE_TEST_TIMEOUT_MS : LOCAL_LIVE_TEST_TIMEOUT_MS,
  expect: { timeout: isCI ? CI_EXPECT_TIMEOUT_MS : LOCAL_EXPECT_TIMEOUT_MS },
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
