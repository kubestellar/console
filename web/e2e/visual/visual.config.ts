import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for visual regression testing against Storybook.
 *
 * Builds Storybook as a static site, serves it, then captures
 * screenshots of each story for pixel-by-pixel comparison against baselines.
 *
 * Baseline screenshots are stored in the -snapshots/ directory and committed
 * to the repo. To update baselines after intentional visual changes:
 *   npx playwright test --config e2e/visual/visual.config.ts --update-snapshots
 */

const STORYBOOK_PORT = 6006
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  timeout: IS_CI ? 120_000 : 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  retries: IS_CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../visual-report' }],
    ['list'],
  ],
  use: {
    baseURL: `http://127.0.0.1:${STORYBOOK_PORT}`,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `npx serve ../storybook-static -l ${STORYBOOK_PORT} --no-clipboard`,
    url: `http://127.0.0.1:${STORYBOOK_PORT}`,
    reuseExistingServer: true,
    timeout: IS_CI ? 60_000 : 30_000,
  },
  outputDir: '../test-results/visual',
})
