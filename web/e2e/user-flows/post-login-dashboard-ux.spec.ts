import { test, expect, type Page } from '@playwright/test'
import { collectConsoleErrors } from '../helpers/ux-assertions'
import { setMode } from '../mocks/liveMocks'

const BASE_URL =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174'

const DASHBOARD_LOAD_TIMEOUT_MS = 20_000
const ROUTE_LOAD_TIMEOUT_MS = 20_000
const SEARCH_RESULTS_TIMEOUT_MS = 10_000
const DIALOG_TIMEOUT_MS = 10_000
const UX_SWEEP_TIMEOUT_MS = 240_000
const MIN_BODY_TEXT_LENGTH = 20

function routeMatcher(path: string): RegExp {
  if (path === '/') {
    return /\/($|\?)/
  }

  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?:\\?.*)?$`)
}

async function loginAndOpenInitialDashboard(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })

  // Simulate post-login auth state in a backend-independent way.
  await setMode(page, 'demo')

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })

  await expect(page).toHaveURL(routeMatcher('/'), { timeout: DASHBOARD_LOAD_TIMEOUT_MS })
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
}

async function assertRouteLoaded(page: Page, expectedPath: string) {
  await expect(page).toHaveURL(routeMatcher(expectedPath), { timeout: ROUTE_LOAD_TIMEOUT_MS })
  await expect(page.getByTestId('login-page')).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeVisible({ timeout: ROUTE_LOAD_TIMEOUT_MS })

  const bodyText = await page.locator('body').innerText()
  expect(bodyText.trim().length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
}

async function clickSidebarRoute(page: Page, href: string) {
  const link = page.locator(`[data-testid="sidebar"] a[href="${href}"]`).first()
  await expect(link).toBeVisible({ timeout: ROUTE_LOAD_TIMEOUT_MS })
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await assertRouteLoaded(page, href)
}

async function getVisibleSidebarRoutes(page: Page): Promise<string[]> {
  const routes = await page
    .locator('[data-testid="sidebar"] a[href^="/"]')
    .evaluateAll((nodes) => {
      const seen = new Set<string>()
      const hrefs: string[] = []

      for (const node of nodes) {
        const href = node.getAttribute('href')
        if (!href || !href.startsWith('/')) continue
        if (href.startsWith('/custom-dashboard/')) continue

        if (!seen.has(href)) {
          seen.add(href)
          hrefs.push(href)
        }
      }

      return hrefs
    })

  return routes
}

test.describe('Post-login initial dashboard UX sweep', () => {
  test('all key landing-dashboard interactions and routes behave correctly', async ({ page }) => {
    test.setTimeout(UX_SWEEP_TIMEOUT_MS)

    const assertNoConsoleErrors = collectConsoleErrors(page)

    await loginAndOpenInitialDashboard(page)

    const sidebarRoutes = await getVisibleSidebarRoutes(page)
    expect(sidebarRoutes.length).toBeGreaterThan(0)

    for (const href of sidebarRoutes) {
      await clickSidebarRoute(page, href)
    }

    await clickSidebarRoute(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    // Refresh button should be clickable and keep the dashboard interactive.
    const refreshButton = page.getByTestId('dashboard-refresh-button')
    await expect(refreshButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await refreshButton.click()
    await expect(refreshButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    // Add Card should open and close a dialog.
    const addCardButton = page.getByTestId('sidebar-add-card')
    await expect(addCardButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await addCardButton.click()

    const addCardDialog = page.getByRole('dialog')
    await expect(addCardDialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
    await page.keyboard.press('Escape')
    await expect(addCardDialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // "Add more..." customizer should also open/close correctly.
    const addMoreButton = page
      .getByTestId('sidebar')
      .getByRole('button', { name: /add more/i })
      .first()
    await expect(addMoreButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await addMoreButton.click()

    const customizerDialog = page.getByRole('dialog')
    await expect(customizerDialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
    await page.keyboard.press('Escape')
    await expect(customizerDialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Sidebar collapse/expand should change visibility of Add Card action.
    const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
    await expect(collapseToggle).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    await collapseToggle.click()
    await expect(addCardButton).not.toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    await collapseToggle.click()
    await expect(addCardButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    // Global search should find Settings and navigate there.
    const searchInput = page.getByTestId('global-search-input')
    await expect(searchInput).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await searchInput.click()
    await searchInput.fill('settings')

    const searchResults = page.getByTestId('global-search-results')
    await expect(searchResults).toBeVisible({ timeout: SEARCH_RESULTS_TIMEOUT_MS })

    const settingsResult = page
      .getByTestId('global-search-result-item')
      .filter({ hasText: /settings/i })
      .first()

    await expect(settingsResult).toBeVisible({ timeout: SEARCH_RESULTS_TIMEOUT_MS })
    await settingsResult.click()
    await assertRouteLoaded(page, '/settings')

    // Logo button should return the user to the initial dashboard.
    const homeLogoButton = page.locator('nav button[aria-label*="home" i]').first()
    await expect(homeLogoButton).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await homeLogoButton.click()
    await assertRouteLoaded(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })

    // Clusters stat block should open a drilldown or navigate to clusters when count > 0.
    const clustersStat = page.getByTestId('stat-block-clusters').first()
    const clustersStatVisible = await clustersStat.isVisible().catch(() => false)

    if (clustersStatVisible) {
      const clusterCount = await clustersStat.evaluate((node) => {
        const text = node.textContent ?? ''
        const match = text.match(/\b\d+\b/)
        return match ? Number(match[0]) : 0
      })

      if (clusterCount > 0) {
        await clustersStat.click()

        const drilldownModal = page.getByTestId('drilldown-modal')
        const openedDrilldown = await drilldownModal
          .isVisible({ timeout: DIALOG_TIMEOUT_MS })
          .catch(() => false)

        const navigatedToClusters = /\/clusters(?:\?.*)?$/.test(page.url())
        expect(openedDrilldown || navigatedToClusters).toBe(true)

        if (openedDrilldown) {
          await page.getByTestId('drilldown-close').click()
          await expect(drilldownModal).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
        }

        if (navigatedToClusters) {
          await clickSidebarRoute(page, '/')
        }
      }
    }

    // First card should be interactive and support drilldown expansion when available.
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: DASHBOARD_LOAD_TIMEOUT_MS })
    await firstCard.hover()

    const expandCardButton = firstCard
      .locator('button[title*="xpand" i], button[aria-label*="xpand" i], button[title*="full screen" i], button[aria-label*="full screen" i]')
      .first()

    const hasExpandButton = await expandCardButton.isVisible().catch(() => false)
    if (hasExpandButton) {
      await expandCardButton.click()
      const drilldownModal = page.getByTestId('drilldown-modal')
      await expect(drilldownModal).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
      await page.getByTestId('drilldown-close').click()
      await expect(drilldownModal).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
    }

    assertNoConsoleErrors()
  })
})
