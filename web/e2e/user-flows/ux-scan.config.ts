import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174'
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE || 'auth.json'

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: {
    timeout: 20_000,
  },
  // Keep UX scan outputs under web/test-results/ux-scan (repo-standard location).
  outputDir: '../../test-results/ux-scan/artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../test-results/ux-scan/playwright-report', open: 'never' }],
    ['json', { outputFile: '../../test-results/ux-scan/ux-raw-results.json' }],
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
