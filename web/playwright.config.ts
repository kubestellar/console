import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for KubeStellar Klaude Console (kkc)
 *
 * Comprehensive E2E testing with focus on:
 * - AI interactivity features
 * - Card/dashboard management
 * - Sharing and export functionality
 * - Multi-cluster operations
 */
export default defineConfig({
  testDir: './e2e',

  // Skip flaky tests until they are stabilized
  // Re-enable these incrementally as they are fixed
  testIgnore: [
    // Tour.spec.ts - re-enabled after stabilization
    // Sidebar.spec.ts - re-enabled after stabilization
    // AIMode.spec.ts - re-enabled after stabilization
    '**/AIRecommendations.spec.ts',
    '**/CardChat.spec.ts',
    '**/CardSharing.spec.ts',
    '**/DrillDown.spec.ts',
    // Clusters.spec.ts - re-enabled after stabilization
    // Events.spec.ts - re-enabled after stabilization
    // Settings.spec.ts - re-enabled after stabilization
    '**/auth.setup.ts',
  ],

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if test.only is left in
  forbidOnly: !!process.env.CI,

  // Retry failed tests (more in CI)
  retries: process.env.CI ? 2 : 0,

  // Workers - limit in CI for stability
  workers: process.env.CI ? 2 : '50%',

  // Reporter configuration
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['github'],
      ]
    : [['html', { open: 'never' }]],

  // Global timeout per test
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Default viewport
    viewport: { width: 1280, height: 720 },
  },

  // Projects for different browsers
  // Note: Each test handles its own auth mocking in beforeEach,
  // so we don't need a global setup project
  projects: [
    // Chromium tests
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Firefox tests
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },

    // Webkit tests
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },

    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },

    // Mobile Safari
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
      },
    },
  ],

  // Web server config - starts dev server before tests
  // Skip webServer if PLAYWRIGHT_BASE_URL is set (using existing server)
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120000,
      },

  // Output directory
  outputDir: 'test-results',
})
