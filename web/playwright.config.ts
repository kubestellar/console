import { defineConfig, devices } from '@playwright/test'

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const isCI = Boolean(env.CI)


/**
 * Playwright configuration for KubeStellar Console (kc)
 *
 * Comprehensive E2E testing with focus on:
 * - AI interactivity features
 * - Card/dashboard management
 * - Sharing and export functionality
 * - Multi-cluster operations
 */
export default defineConfig({
  testDir: './e2e',

  // #11296 — Register the coverage teardown. It is a no-op unless
  // VITE_COVERAGE=true, so registering it unconditionally is safe.
  globalTeardown: './e2e/global-teardown.ts',

  // Skip flaky tests until they are stabilized
  // Re-enable these incrementally as they are fixed
  //
  // #9076 — The previous `**/auth.setup.ts` entry has been removed along
  // with the file itself. No project declared `dependencies: ['setup']`, so
  // the file was dead code. All tests handle auth mocking inline via
  // `helpers/setup.ts::setupDemoMode`.
  // Visual regression tests require Storybook to be built and served
  // separately. They have their own configs (visual.config.ts,
  // app-visual.config.ts) and must not run in the main chromium shards.
  //
  // Mission tests (deeplink, explorer-import) use Playwright's `page.request`
  // (Node.js-level HTTP) to hit real backend endpoints — they cannot run when
  // PLAYWRIGHT_BASE_URL points at a standalone Vite preview (CI default).
  // When PLAYWRIGHT_BASE_URL is unset, Playwright starts the Go backend itself
  // (see webServer config below), so mission tests can run locally.
  testIgnore: [
    '**/visual/**',
    ...(env.PLAYWRIGHT_BASE_URL
      ? ['**/nightly/mission-deeplink.spec.ts', '**/nightly/mission-explorer-import.spec.ts']
      : []),
  ],

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if test.only is left in
  forbidOnly: isCI,

  // Retry failed tests once in CI (balances flake detection vs run time)
  retries: isCI ? 1 : 0,

  // Workers — CI gets 2 workers per shard for better stability, local uses half of available cores
  workers: isCI ? 2 : '50%',

  // Reporter configuration
  reporter: isCI
    ? [
        ['blob', { outputDir: 'blob-report' }],
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['github'],
      ]
    : [['html', { open: 'never' }], ['./e2e/helpers/ux-reporter.ts']],

  // Global timeout per test (increased for nightly stability)
  timeout: isCI ? 75000 : 60000,

  // Expect timeout (increased for slower CI environments)
  expect: {
    timeout: isCI ? 15000 : 10000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for all tests.
    //
    // #6452 — Default to the Go backend port (8080). In production the Go
    // backend serves BOTH the API and the built frontend on 8080, which is
    // also how startup-oauth.sh launches the console. Tests must match the
    // real deployment, not a standalone vite dev server. Override with
    // PLAYWRIGHT_BASE_URL=http://localhost:5174 if running against a detached
    // vite dev server (e.g. for fast local UI iteration).
    baseURL: env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',

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
      // Firefox is consistently slower than Chromium — increase timeout buffer
      timeout: 90000,
    },

    // Webkit tests
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
      // WebKit is consistently slower than Chromium — increase timeout buffer
      timeout: 90000,
    },

    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
      // Mobile emulation can be slower — increase timeout
      timeout: 90000,
    },

    // Mobile Safari
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
      },
      // Mobile Safari (WebKit) is consistently slower — increase timeout
      timeout: 90000,
    },
  ],

  // Web server config - starts dev server before tests.
  //
  // #6452/#6474 — When PLAYWRIGHT_BASE_URL is not set, launch the Go backend
  // (`go run .` from the repo root) on port 8080. In production the Go backend
  // serves BOTH the API and the built frontend on 8080, which is how
  // startup-oauth.sh launches the console. Tests must match the real
  // deployment topology, not a standalone vite dev server.
  //
  // If PLAYWRIGHT_BASE_URL explicitly points somewhere else (e.g. at a
  // pre-running server), we skip webServer and expect the caller to manage
  // the process. This is the path CI uses with a shared backend.
  //
  // Local dev: just `npm run test:e2e` and playwright will start the backend
  // itself. Previously this was `webServer: undefined`, which hung on connect.
  webServer: env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Run `go run .` from the repo root (one level up from web/).
        command: 'cd .. && go run .',
        url: 'http://localhost:8080',
        // Go backend can take a while to build on first run.
        // 3 minutes covers a cold `go run` compile on modest hardware.
        timeout: 180_000,
        reuseExistingServer: !isCI,
        stdout: 'pipe',
        stderr: 'pipe',
      },

  // Output directory
  outputDir: 'test-results',
})
