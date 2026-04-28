import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Playwright configuration for full-app visual regression testing.
 *
 * Unlike visual.config.ts (which screenshots isolated Storybook components),
 * this configuration runs against the actual application to catch layout
 * regressions that only appear in context — card grid overflow, sidebar
 * misalignment, navbar clipping, etc.
 *
 * The Go backend serves both the API and the built frontend on port 8080.
 * Override with APP_VISUAL_BASE_URL if running against a pre-started server.
 *
 * To update baselines after intentional layout changes:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
 */

const IS_CI = !!process.env.CI
const BASE_URL = process.env.APP_VISUAL_BASE_URL || 'http://localhost:8080'

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  testDir: '.',
  testMatch: 'app-visual-regression.spec.ts',
  timeout: IS_CI ? 120_000 : 60_000,
  expect: {
    timeout: IS_CI ? 30_000 : 15_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  retries: IS_CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../app-visual-report' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: process.env.APP_VISUAL_BASE_URL
    ? undefined
    : {
        command: `cd "${path.join(WEB_DIR, '..')}" && go run .`,
        url: BASE_URL,
        timeout: 180_000,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  outputDir: '../test-results/app-visual',
})
