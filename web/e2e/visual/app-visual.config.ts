import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Playwright configuration for full-app visual regression testing.
 *
 * Uses `vite preview` to serve the built frontend. All tests use setupDemoMode()
 * which activates MSW (Mock Service Worker) — no Go backend needed.
 *
 * Baselines must be generated on Linux to match CI rendering.
 * On macOS: docker run --rm -v $(pwd):/work -w /work/web mcr.microsoft.com/playwright:v1.52.0-jammy \
 *   npx playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
 *
 * To update baselines after intentional layout changes:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
 */

const IS_CI = !!process.env.CI
const BASE_URL = process.env.APP_VISUAL_BASE_URL || 'http://localhost:4173'

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  globalTeardown: '../global-teardown.ts',
  testDir: '.',
  testMatch: 'app-*.spec.ts',
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
        command: 'npm run build && npm run preview -- --port 4173',
        url: BASE_URL,
        timeout: 300_000,
        reuseExistingServer: !IS_CI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  outputDir: '../test-results/app-visual',
})
