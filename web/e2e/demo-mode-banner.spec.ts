/**
 * Demo Mode Banner — Playwright E2E Tests
 *
 * Validates the demo-mode banner appearance, CTA text, dismissal,
 * and dashboard stat card rendering in demo mode.
 *
 * Coverage:
 *   - Banner visible on load with "Showing sample data only"
 *   - Banner CTA "Want your own local KubeStellar Console?"
 *   - Banner dismissed by clicking the X button
 *   - Dashboard stat cards: Clusters, Healthy, Pods, Nodes, Namespaces
 *
 * Base URL: http://localhost:5174
 *   Override: set PLAYWRIGHT_BASE_URL in the environment.
 *
 * Run: npx playwright test e2e/demo-mode-banner.spec.ts
 */

import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
} from './helpers/setup'

const VIEWPORT = { width: 1280, height: 720 } as const
const BANNER_VISIBLE_TIMEOUT_MS = 10_000
const STAT_CARD_TIMEOUT_MS = 15_000
const DISMISS_TIMEOUT_MS = 5_000
const DASHBOARD_MOUNT_TIMEOUT_MS = 20_000

test.describe('Demo Mode Banner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT)
    await setupDemoMode(page)
    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'demo banner load')
  })

  test('banner is visible on load with text "Showing sample data only"', async ({ page }) => {
    const sampleDataText = page.locator('span').filter({ hasText: /Showing sample data only/ }).first()
    await expect(sampleDataText).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })
  })

  test('banner has CTA "Want your own local KubeStellar Console?"', async ({ page }) => {
    const ctaText = page.locator('span').filter({ hasText: 'Want your own local KubeStellar Console?' }).first()
    await expect(ctaText).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })
  })

  test('banner can be dismissed by clicking the X button', async ({ page }) => {
    const dismissButton = page.getByRole('button', { name: /dismiss banner|exit demo mode/i })
    await expect(dismissButton).toBeVisible({ timeout: BANNER_VISIBLE_TIMEOUT_MS })
    await dismissButton.click()
    const sampleDataText = page.locator('span').filter({ hasText: /Showing sample data only/ }).first()
    await expect(sampleDataText).not.toBeVisible({ timeout: DISMISS_TIMEOUT_MS })
  })

  test('dashboard stat cards render — Clusters, Healthy, Pods, Nodes, Namespaces', async ({ page }) => {
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_MOUNT_TIMEOUT_MS })
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
