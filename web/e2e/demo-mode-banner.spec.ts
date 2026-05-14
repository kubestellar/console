import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../e2e/helpers/setup'

/**
 * Demo Mode Banner E2E Tests
 *
 * Validates the demo-mode banner that renders across the top of the console
 * when `kc-demo-mode=true` is set in localStorage (e.g. on the hosted site
 * or when no kc-agent is connected).
 *
 * Run against the Vite dev server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test tests/demo-mode-banner.spec.ts
 *
 * The banner lives in Layout.tsx and is rendered via the `activeBanners` array
 * when `showDemoBanner` is true (isDemoMode && !demoBannerDismissed).
 */

/** Viewport used across all tests — matches playwright.config.ts default. */
const VIEWPORT = { width: 1280, height: 720 } as const

/** Timeout for banner element visibility assertions. */
const BANNER_VISIBLE_TIMEOUT_MS = 10_000

/** Timeout for stat card visibility assertions (demo data loads immediately). */
const STAT_CARD_TIMEOUT_MS = 15_000

/** Timeout for post-dismiss assertions. */
const DISMISS_TIMEOUT_MS = 5_000

/** Timeout for the dashboard-page root element to mount. */
const DASHBOARD_MOUNT_TIMEOUT_MS = 20_000

test.describe('Demo Mode Banner', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure xl breakpoint (1280 px) is active so the full CTA text is visible.
    // The "Want your own local KubeStellar Console?" span is `hidden xl:inline`.
    await page.setViewportSize(VIEWPORT)

    // Wire up API mocks + seed localStorage (kc-demo-mode=true, demo-token, etc.)
    // before the page navigates so no /login flash occurs on webkit/safari.
    await setupDemoMode(page)
    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'demo banner load')
  })

  test('banner is visible on load with text "Showing sample data only"', async ({ page }) => {
    // The full locale string is "Showing sample data only — install locally to
    // monitor your real clusters" (layout.sampleDataInstallLocally). It lives
    // in a `hidden md:inline` span that is visible at md+ (768 px); the
    // default 1280 px viewport satisfies this threshold.
    const sampleDataText = page
      .locator('span')
      .filter({ hasText: /Showing sample data only/ })
      .first()

    await expect(sampleDataText).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })
  })

  test('banner has CTA "Want your own local KubeStellar Console?"', async ({ page }) => {
    // The CTA text lives in a `hidden xl:inline` span inside the accent Button.
    // It is visible at xl (1280 px) — the viewport set in beforeEach.
    const ctaText = page
      .locator('span')
      .filter({ hasText: 'Want your own local KubeStellar Console?' })
      .first()

    await expect(ctaText).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })
  })

  test('banner can be dismissed by clicking the X button', async ({ page }) => {
    // In local (non-Netlify) environments the X button aria-label is
    // "Exit demo mode" (toggleDemoMode). On the hosted site it is
    // "Dismiss banner" (setDemoBannerDismissed). Both are matched here
    // so the test is portable across environments.
    const dismissButton = page.getByRole('button', {
      name: /dismiss banner|exit demo mode/i,
    })
    await expect(dismissButton).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })

    await dismissButton.click()

    // After dismiss the "Showing sample data only" text must disappear.
    const sampleDataText = page
      .locator('span')
      .filter({ hasText: /Showing sample data only/ })
      .first()
    await expect(sampleDataText).not.toBeVisible({ timeout: DISMISS_TIMEOUT_MS })
  })

  test('dashboard stat cards render — Clusters, Healthy, Pods, Nodes, Namespaces', async ({ page }) => {
    // The main dashboard (/) renders a StatsOverview with dashboardType='dashboard'
    // (DASHBOARD_STAT_BLOCKS in StatsBlockDefinitions.ts). In demo mode the stat
    // blocks populate immediately from built-in demo data without a real backend.
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: DASHBOARD_MOUNT_TIMEOUT_MS,
    })

    const statCards = [
      page.getByTestId('stat-block-clusters'),
      page.getByTestId('stat-block-healthy'),
      page.getByTestId('stat-block-pods'),
      page.getByTestId('stat-block-nodes'),
      page.getByTestId('stat-block-namespaces'),
    ]

    for (const card of statCards) {
      await expect(card).toBeVisible({ timeout: STAT_CARD_TIMEOUT_MS })
    }
  })
})
