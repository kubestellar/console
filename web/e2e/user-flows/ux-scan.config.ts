import { defineConfig, devices } from '@playwright/test'

const DEFAULT_BASE_URL = 'http://localhost:8080'
const DEFAULT_STORAGE_STATE = 'auth.json'

const UX_SWEEP_TIMEOUT_MS = 240_000
const EXPECT_TIMEOUT_MS = 20_000
const UX_ARTIFACTS_OUTPUT_DIR = '../../test-results/ux-scan/artifacts'
const UX_HTML_REPORT_DIR = '../../test-results/ux-scan/playwright-report'
const UX_RAW_RESULTS_FILE = '../../test-results/ux-scan/ux-raw-results.json'

const baseURL =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL
const storageState =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: UX_SWEEP_TIMEOUT_MS,
  expect: {
    timeout: EXPECT_TIMEOUT_MS,
  },
  // Keep UX scan outputs under web/test-results/ux-scan (repo-standard location).
  outputDir: UX_ARTIFACTS_OUTPUT_DIR,
  reporter: [
    ['list'],
    ['html', { outputFolder: UX_HTML_REPORT_DIR, open: 'never' }],
    ['json', { outputFile: UX_RAW_RESULTS_FILE }],
  ],
  use: {
    baseURL,
    storageState,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
