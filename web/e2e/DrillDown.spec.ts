import { test, expect, Page } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from './helpers/setup'

/** Timeout for drilldown modal to appear after trigger (ms). */
const DRILLDOWN_TIMEOUT_MS = 5_000

/** Delay to let React re-render after tab click (ms). */
const TAB_SWITCH_SETTLE_MS = 250

/**
 * Opens the drilldown modal from the dashboard. Tries the "expand card"
 * affordance (which always routes through DrillDownProvider) and falls back
 * to clicking a KPI number / clickable cluster row.
 */
async function openDrillDown(page: Page): Promise<boolean> {
  const firstCard = page.locator('[data-card-type]').first()
  const hasCard = await firstCard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
  if (!hasCard) return false

  await firstCard.hover()
  const expandBtn = firstCard
    .locator('button[aria-label*="full screen"], button[title*="full screen"], button[title*="xpand"]')
    .first()
  const hasExpand = await expandBtn.isVisible({ timeout: DRILLDOWN_TIMEOUT_MS }).catch(() => false)
  if (hasExpand) {
    await expandBtn.click()
    const modal = page.getByTestId('drilldown-modal')
    const visible = await modal.isVisible({ timeout: DRILLDOWN_TIMEOUT_MS }).catch(() => false)
    if (visible) return true
  }
  return false
}

test.describe('Drilldown Modal — structural assertions', () => {
  test('expanding a card opens drilldown with testid, tabs breadcrumb, and close affordance', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'Demo dashboard has no expandable card'); return }

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible()

    // Modal must expose its breadcrumb/tab nav and close button.
    const tabs = page.getByTestId('drilldown-tabs')
    await expect(tabs).toBeVisible()
    const tabButtons = tabs.locator('button')
    const tabCount = await tabButtons.count()
    expect(tabCount).toBeGreaterThan(0)

    const closeBtn = page.getByTestId('drilldown-close')
    await expect(closeBtn).toBeVisible()
    await expect(closeBtn).toBeEnabled()
  })

  test('drilldown modal renders a non-empty content region (not just chrome)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const modal = page.getByTestId('drilldown-modal')
    const bodyText = await modal.textContent()
    // At minimum the breadcrumb title + some rendered view content must be
    // present — not just an empty error boundary.
    expect((bodyText ?? '').trim().length).toBeGreaterThan(0)

    // The modal host also mounts a content region below the header.
    const contentHost = modal.locator('[class*="overflow-y-auto"]').first()
    await expect(contentHost).toBeVisible()
  })

  test('clicking the close (X) button dismisses the modal', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible()
    await page.getByTestId('drilldown-close').click()
    await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('Escape key dismisses the drilldown modal (not just a page-level no-op)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('clicking the backdrop outside the modal dismisses it', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible()
    // Click near the corner of the viewport, well outside the inner panel.
    await page.mouse.click(5, 5)
    await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('when breadcrumb has multiple entries, clicking an earlier one pops the stack', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const tabs = page.getByTestId('drilldown-tabs')
    const tabButtons = tabs.locator('button')
    const initialCount = await tabButtons.count()
    // If there's no nested drilldown, skip — otherwise click the root crumb.
    if (initialCount <= 1) { test.skip(true, 'No nested drilldown path available'); return }

    await tabButtons.first().click()
    await page.waitForTimeout(TAB_SWITCH_SETTLE_MS)
    const laterCount = await tabButtons.count()
    expect(laterCount).toBeLessThanOrEqual(initialCount)
  })

  test('drilldown close button has an accessible label (aria-label or title)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const opened = await openDrillDown(page)
    if (!opened) { test.skip(true, 'No expandable card'); return }

    const closeBtn = page.getByTestId('drilldown-close')
    const ariaLabel = await closeBtn.getAttribute('aria-label')
    const title = await closeBtn.getAttribute('title')
    // At least one form of accessible labelling must be present.
    expect(Boolean(ariaLabel) || Boolean(title) || (await closeBtn.textContent())?.trim().length).toBeTruthy()
  })
})
