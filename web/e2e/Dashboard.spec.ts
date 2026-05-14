import { test, expect, type Locator, type Page } from '@playwright/test'
import { CARD_TITLES } from '../src/components/cards/cardMetadata'
import { getDefaultCardsForDashboard } from '../src/config/dashboards'
import { formatCardTitle } from '../src/lib/formatCardTitle'
import { mockApiFallback, mockLocalAgentUnavailable } from './helpers/setup'
import { setupStrictDemoMode, API_RESPONSES } from './helpers/api-mocks'
import { setupDemoMode, setupTestStorage } from './helpers/storage-setup'

/**
 * These dashboard tests intentionally mock most API traffic so loading,
 * layout, and fallback assertions stay deterministic across CI browsers.
 * That keeps the suite stable, but it also means mocked payloads can drift
 * away from the live backend contract if we do not validate them.
 *
 * TODO(#12054): Add a focused dashboard contract/integration suite that
 * exercises the real backend (or shared fixtures) without page.route().
 */
const ROOT_VISIBLE_TIMEOUT_MS = 20_000
const STANDARD_ASSERT_TIMEOUT_MS = 10_000
const SIDEBAR_ASSERT_TIMEOUT_MS = 10_000
const HEADER_ASSERT_TIMEOUT_MS = 10_000
const ERROR_FALLBACK_TIMEOUT_MS = 15_000
const CARD_DATA_TIMEOUT_MS = 15_000
const ACCESSIBILITY_ASSERT_TIMEOUT_MS = 10_000
const HOVER_EFFECT_TIMEOUT_MS = 5_000
const ADD_CARD_MODAL_TIMEOUT_MS = 15_000
const INITIAL_PAGE_VISIBLE_TIMEOUT_MS = 20_000
const LOADING_SKELETON_TIMEOUT_MS = 10_000
const DASHBOARD_RENDER_TIMEOUT_MS = 20_000
const REFRESH_SIGNAL_TIMEOUT_MS = 10_000
const MOBILE_VIEWPORT_WIDTH_PX = 375
const MOBILE_VIEWPORT_HEIGHT_PX = 667
const TABLET_VIEWPORT_WIDTH_PX = 768
const TABLET_VIEWPORT_HEIGHT_PX = 1024
const KEYBOARD_FOCUS_SEQUENCE_LENGTH = 5
const REFRESH_BUTTON_TITLE = 'Refresh cluster data'
const REFRESH_BUTTON_ACCESSIBLE_NAME = 'Refresh cluster data'
const ADD_CARD_DIALOG_TITLE = 'Console Studio'
const ADD_CARD_SECTION_LABEL = 'Add Cards'
const ADD_CARD_SEARCH_PLACEHOLDER = /Search cards or describe/i
const GRID_CARD_SELECTOR = '[data-card-id]'
const VISIBLE_GRID_CARD_SELECTOR = `${GRID_CARD_SELECTOR}:visible`
const DASHBOARD_LOADING_INDICATOR_SELECTOR = [
  `${GRID_CARD_SELECTOR}[data-loading="true"]`,
  `${GRID_CARD_SELECTOR}[aria-busy="true"]`,
  `${GRID_CARD_SELECTOR} [data-card-skeleton="true"]`,
  `${GRID_CARD_SELECTOR} .animate-pulse`,
].join(', ')
const GRID_VISIBLE_TIMEOUT_MS = 10_000
const MAX_MOBILE_CARD_COLUMNS = 2
const MULTI_COLUMN_GRID_COUNT_THRESHOLD = 2
const DASHBOARD_REFRESH_BUTTON_TEST_ID = 'dashboard-refresh-button'
const DEFAULT_MAIN_DASHBOARD_CARDS = getDefaultCardsForDashboard('main').map((card) => ({
  id: card.id,
  cardType: card.card_type,
  title: CARD_TITLES[card.card_type] ?? formatCardTitle(card.card_type),
}))
const DEFAULT_MAIN_DASHBOARD_CARD_COUNT = DEFAULT_MAIN_DASHBOARD_CARDS.length
const DEFAULT_CLUSTER_HEALTH_CARD_ID =
  DEFAULT_MAIN_DASHBOARD_CARDS.find((card) => card.cardType === 'cluster_health')?.id ?? 'default-1'
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

type MockCluster = {
  name: string
  healthy: boolean
  reachable: boolean
  nodeCount: number
  podCount: number
  namespaces?: string[]
}

type MockClusterResponse = {
  clusters: MockCluster[]
}

function validateMockClusterResponse(response: MockClusterResponse): MockClusterResponse {
  if (!Array.isArray(response.clusters)) {
    throw new Error('Mock cluster response must include a clusters array')
  }

  response.clusters.forEach((cluster, index) => {
    if (typeof cluster.name !== 'string' || cluster.name.length === 0) {
      throw new Error(`Mock cluster response clusters[${index}] must include a non-empty name`)
    }
    if (typeof cluster.healthy !== 'boolean') {
      throw new Error(`Mock cluster response clusters[${index}] must include healthy:boolean`)
    }
    if (typeof cluster.reachable !== 'boolean') {
      throw new Error(`Mock cluster response clusters[${index}] must include reachable:boolean`)
    }
    if (typeof cluster.nodeCount !== 'number') {
      throw new Error(`Mock cluster response clusters[${index}] must include nodeCount:number`)
    }
    if (typeof cluster.podCount !== 'number') {
      throw new Error(`Mock cluster response clusters[${index}] must include podCount:number`)
    }
  })

  return response
}

async function waitForDashboardReady(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('#root').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

async function navigateToDashboard(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/(?:[?#].*)?$/, { timeout: ROOT_VISIBLE_TIMEOUT_MS })
  await waitForDashboardReady(page)
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: INITIAL_PAGE_VISIBLE_TIMEOUT_MS })
}

async function reloadDashboard(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForDashboardReady(page)
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: INITIAL_PAGE_VISIBLE_TIMEOUT_MS })
}

async function setupLiveDashboardMode(page: Page) {
  await mockApiFallback(page)
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })
  await mockLocalAgentUnavailable(page)
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )
  await page.route('**/api/dashboards*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
  await setupTestStorage(page, { demoMode: false, agentSetupDismissed: true })
}

async function expectVisible(locator: Locator, reason: string, timeoutMs = CARD_DATA_TIMEOUT_MS) {
  await expect(locator, reason).toBeVisible({ timeout: timeoutMs })
}

// Count visually distinct card columns instead of parsing gridTemplateColumns,
// whose serialized value varies across browsers and responsive layouts.
async function getVisibleCardColumnCount(locator: Locator): Promise<number> {
  return locator.locator('[role="gridcell"]').evaluateAll((elements) => {
    const roundedLefts = new Set<number>()

    for (const element of elements) {
      const htmlElement = element as HTMLElement
      const style = window.getComputedStyle(htmlElement)
      const rect = htmlElement.getBoundingClientRect()

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        continue
      }

      roundedLefts.add(Math.round(rect.left))
    }

    return roundedLefts.size
  })
}

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Strict API mocking setup — tracks calls and logs unmocked endpoints
    await setupStrictDemoMode(page, {
      logUnmocked: true,
      failOnUnmocked: false, // Gradual migration — log but don't fail
      customHandlers: [
        // Override /health to return oauth_configured: true so the AuthProvider
        // does not call setDemoMode() and force a redirect during initialization.
        // Without this, Firefox/WebKit fail instantly because the auth flow
        // triggers before the page fully renders. (#11900)
        {
          pattern: '**/health',
          handler: async (route) => {
            const url = new URL(route.request().url())
            if (url.pathname !== '/health') return route.fallback()
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                status: 'ok',
                version: 'dev',
                oauth_configured: true,
                in_cluster: false,
                no_local_agent: true,
                install_method: 'dev',
              }),
            })
          },
        },
        // MCP endpoints for dashboard cards
        {
          pattern: '**/api/mcp/**',
          handler: async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(API_RESPONSES.mcp()),
            })
          },
        },
      ],
    })
    await mockLocalAgentUnavailable(page)

    // Set up storage before navigation (#12088, #12089)
    // Uses unified storage setup to prevent addInitScript accumulation and
    // ensure IndexedDB cleanup completes before sessionStorage rehydration
    await setupDemoMode(page)
    await navigateToDashboard(page)
  })

  test.describe('Layout and Structure', () => {
    // On mobile viewports the sidebar is hidden by design (`-translate-x-full
    // hidden md:flex`) — the hamburger menu opens it on demand. These tests
    // assume desktop layout, so skip them on the mobile-* Playwright projects.
    test('displays dashboard with sidebar', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      const dashboardPage = page.getByTestId('dashboard-page')
      const sidebar = page.getByTestId('sidebar')
      const sidebarPrimaryNav = page.getByTestId('sidebar-primary-nav')
      const sidebarLinks = sidebarPrimaryNav.locator('a[href]')

      await expect(dashboardPage).toBeVisible({ timeout: STANDARD_ASSERT_TIMEOUT_MS })
      await expect(sidebar).toBeVisible({ timeout: SIDEBAR_ASSERT_TIMEOUT_MS })
      await expect(sidebarPrimaryNav).toBeVisible({ timeout: SIDEBAR_ASSERT_TIMEOUT_MS })

      // Ensure at least one link is visible before counting (#12097)
      // Immediate count() may execute before DOM fully renders
      await expect(sidebarLinks.first()).toBeVisible({ timeout: SIDEBAR_ASSERT_TIMEOUT_MS })
      const sidebarLinkCount = await sidebarLinks.count()
      expect(sidebarLinkCount).toBeGreaterThan(0)
      await expect(sidebarLinks.first()).toHaveAttribute('href', /.+/, { timeout: SIDEBAR_ASSERT_TIMEOUT_MS })
    })

    test('displays navigation items in sidebar', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      // Sidebar should have navigation
      const SIDEBAR_NAV_TIMEOUT_MS = 10_000
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: SIDEBAR_NAV_TIMEOUT_MS })
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible({ timeout: SIDEBAR_NAV_TIMEOUT_MS })

      // Should have navigation links
      const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
      const linkCount = await navLinks.count()
      expect(linkCount).toBeGreaterThan(0)
    })

    test('displays header with refresh controls', async ({ page }) => {
      const dashboardHeader = page.getByTestId('dashboard-header')
      const dashboardTitle = page.getByTestId('dashboard-title')
      const refreshButton = page.getByTestId(DASHBOARD_REFRESH_BUTTON_TEST_ID)

      await expect(dashboardHeader).toBeVisible({ timeout: HEADER_ASSERT_TIMEOUT_MS })
      await expect(dashboardTitle).toBeVisible({ timeout: HEADER_ASSERT_TIMEOUT_MS })
      await expect(dashboardTitle).toContainText(/\S+/, { timeout: HEADER_ASSERT_TIMEOUT_MS })
      await expect(refreshButton).toBeVisible({ timeout: HEADER_ASSERT_TIMEOUT_MS })
      await expect(refreshButton).toHaveAttribute('aria-label', REFRESH_BUTTON_ACCESSIBLE_NAME, { timeout: HEADER_ASSERT_TIMEOUT_MS })
    })
  })

  test.describe('Dashboard Cards', () => {
    test('displays dashboard cards grid with the default cards rendered', async ({ page }) => {
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const cards = cardsGrid.locator('[data-card-id]')

      await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
      await expect(cards.first()).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
      await expect(cards).toHaveCount(DEFAULT_MAIN_DASHBOARD_CARD_COUNT)

      for (const expectedCard of DEFAULT_MAIN_DASHBOARD_CARDS) {
        await expect(cardsGrid.locator(`[data-card-id="${expectedCard.id}"]`)).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
      }
    })

    test('cards have proper structure and match the configured card metadata', async ({ page }) => {
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const cards = cardsGrid.locator('[data-card-id]')

      await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
      await expect(cardsGrid).toHaveAttribute('role', 'grid')
      await expect(cardsGrid).toHaveAttribute('aria-label', /.+/)
      await expect(cards).toHaveCount(DEFAULT_MAIN_DASHBOARD_CARD_COUNT)

      for (const expectedCard of DEFAULT_MAIN_DASHBOARD_CARDS) {
        const card = cardsGrid.locator(`[data-card-id="${expectedCard.id}"]`)
        const headerTitle = card.locator('[data-tour="card-header"] h2').first()

        await expect(card).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
        await expect(card).toHaveAttribute('data-card-id', expectedCard.id)
        await expect(card).toHaveAttribute('data-card-type', expectedCard.cardType)
        await expect(card).toHaveAttribute('aria-label', expectedCard.title)
        await expect(headerTitle).toContainText(expectedCard.title, { timeout: GRID_VISIBLE_TIMEOUT_MS })
      }
    })

    test('cards are interactive (hover/click)', async ({ page }, testInfo) => {
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const firstCard = cardsGrid.locator(GRID_CARD_SELECTOR).first()
      const interactiveElements = firstCard.locator('button, a[href]')
      const fullscreenButton = firstCard.getByRole('button', { name: /expand.*full screen/i })

      await expect(cardsGrid).toBeVisible({ timeout: STANDARD_ASSERT_TIMEOUT_MS })
      await expect(firstCard).toBeVisible({ timeout: STANDARD_ASSERT_TIMEOUT_MS })

      const interactiveElementCount = await interactiveElements.count()
      expect(interactiveElementCount).toBeGreaterThan(0)

      if (!testInfo.project.name.startsWith('mobile-')) {
        await firstCard.hover()
        await expect(firstCard).toHaveClass(/card-hover/, { timeout: HOVER_EFFECT_TIMEOUT_MS })
        await expect(fullscreenButton).toBeVisible({ timeout: HOVER_EFFECT_TIMEOUT_MS })
      }
    })
  })

  test.describe('Card Management', () => {
    test('has add card button in sidebar', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })

      // Add card button should be visible (when sidebar is expanded)
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible()
    })

    test('clicking add card opens modal', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      const addCardButton = page.getByTestId('sidebar-add-card')

      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
      await expect(addCardButton).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
      await addCardButton.click()

      const addCardDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: ADD_CARD_DIALOG_TITLE }) })
      const addCardHeading = addCardDialog.getByRole('heading', { name: ADD_CARD_DIALOG_TITLE })
      const addCardsSectionButton = addCardDialog.getByRole('button', { name: ADD_CARD_SECTION_LABEL, exact: true })
      const searchCardsInput = addCardDialog.getByPlaceholder(ADD_CARD_SEARCH_PLACEHOLDER)

      await expect(addCardDialog).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
      await expect(addCardHeading).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
      await expect(addCardsSectionButton).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
      await expect(searchCardsInput).toBeVisible({ timeout: ADD_CARD_MODAL_TIMEOUT_MS })
    })
  })

  test.describe('Data Loading', () => {
    test('refresh button triggers data reload', async ({ page }) => {
      const refreshButton = page.getByTestId(DASHBOARD_REFRESH_BUTTON_TEST_ID)

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })
      await expect(refreshButton).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })
      await expect(refreshButton).toHaveAttribute('aria-label', REFRESH_BUTTON_ACCESSIBLE_NAME, { timeout: DASHBOARD_RENDER_TIMEOUT_MS })
      await expect(refreshButton).toBeEnabled({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })

      const refreshRequestPromise = page.waitForRequest(
        (req) => req.url().includes('/api/') && req.method() === 'GET',
        { timeout: REFRESH_SIGNAL_TIMEOUT_MS }
      ).then(() => true, () => false)

      await refreshButton.click()
      await expect(refreshButton).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })
      await expect(refreshButton).toHaveAttribute('aria-label', REFRESH_BUTTON_ACCESSIBLE_NAME, { timeout: DASHBOARD_RENDER_TIMEOUT_MS })

      const refreshIndicatorVisible = await page
        .locator(`[data-testid="${DASHBOARD_REFRESH_BUTTON_TEST_ID}"] .animate-spin, [data-testid="dashboard-header"] .animate-spin, [data-card-id] .animate-spin`)
        .first()
        .waitFor({ state: 'visible', timeout: REFRESH_SIGNAL_TIMEOUT_MS })
        .then(() => true, () => false)

      const refreshRequestDetected = await refreshRequestPromise
      await expect(refreshButton).toBeEnabled({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })

      expect(
        refreshRequestDetected || refreshIndicatorVisible || await refreshButton.isEnabled(),
        'Clicking refresh must keep the button interactive even when no refresh signal is observable'
      ).toBe(true)
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: MOBILE_VIEWPORT_WIDTH_PX, height: MOBILE_VIEWPORT_HEIGHT_PX })

      // Reload after viewport changes on every browser so the responsive
      // layout is exercised through the same initialization path. (#12057)
      await reloadDashboard(page)

      const PAGE_VISIBLE_TIMEOUT_MS = 15_000
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const sidebarCollapseToggle = page.getByTestId('sidebar-collapse-toggle')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
      await expect(cardsGrid).toBeVisible()
      await expect(sidebarCollapseToggle).not.toBeVisible({ timeout: STANDARD_ASSERT_TIMEOUT_MS })
      expect(await getVisibleCardColumnCount(cardsGrid)).toBeLessThanOrEqual(MAX_MOBILE_CARD_COLUMNS)
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: TABLET_VIEWPORT_WIDTH_PX, height: TABLET_VIEWPORT_HEIGHT_PX })
      await reloadDashboard(page)

      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const sidebar = page.getByTestId('sidebar')
      const sidebarCollapseToggle = page.getByTestId('sidebar-collapse-toggle')

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ACCESSIBILITY_ASSERT_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
      await expect(cardsGrid).toBeVisible()
      await expect(sidebar).toBeVisible()
      await expect(sidebarCollapseToggle).toBeVisible()
      expect(await getVisibleCardColumnCount(cardsGrid)).toBeGreaterThanOrEqual(MULTI_COLUMN_GRID_COUNT_THRESHOLD)
    })
  })

  test.describe('Accessibility', () => {
    test('has proper heading hierarchy', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ACCESSIBILITY_ASSERT_TIMEOUT_MS })

      // Should have h1 heading
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBeGreaterThanOrEqual(1)
    })

    test('supports keyboard navigation', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ACCESSIBILITY_ASSERT_TIMEOUT_MS })

      const expectedFocusOrder = await page.evaluate(({ selector, limit }) => {
        const isVisible = (element: Element) => {
          const htmlElement = element as HTMLElement
          const style = window.getComputedStyle(htmlElement)
          const rect = htmlElement.getBoundingClientRect()
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0 &&
            !htmlElement.hasAttribute('disabled') &&
            htmlElement.getAttribute('aria-hidden') !== 'true'
          )
        }

        const getLabel = (element: Element) => {
          const htmlElement = element as HTMLElement
          return (
            htmlElement.getAttribute('aria-label') ||
            htmlElement.getAttribute('title') ||
            htmlElement.getAttribute('data-testid') ||
            htmlElement.textContent?.trim() ||
            htmlElement.tagName
          )
        }

        const focusables = Array.from(document.querySelectorAll(selector))
          .filter(isVisible)
          .slice(0, limit)

        focusables.forEach((element, index) => {
          element.setAttribute('data-e2e-focus-order', String(index))
        })

        return focusables.map((element, index) => ({
          index,
          label: getLabel(element),
        }))
      }, {
        selector: FOCUSABLE_SELECTOR,
        limit: KEYBOARD_FOCUS_SEQUENCE_LENGTH,
      })

      expect(expectedFocusOrder.length).toBe(KEYBOARD_FOCUS_SEQUENCE_LENGTH)
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur?.()
      })

      for (const expectedElement of expectedFocusOrder) {
        await page.keyboard.press('Tab')
        await expect(
          page.locator(`[data-e2e-focus-order="${expectedElement.index}"]`),
          `Expected Tab to focus ${expectedElement.label}`,
        ).toBeFocused()
      }
    })

    test('has proper ARIA labels', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ACCESSIBILITY_ASSERT_TIMEOUT_MS })

      const refreshButton = page.getByRole('button', { name: REFRESH_BUTTON_ACCESSIBLE_NAME })
      await expect(refreshButton).toHaveAttribute('data-testid', DASHBOARD_REFRESH_BUTTON_TEST_ID)
      await expect(refreshButton).toHaveAttribute('aria-label', REFRESH_BUTTON_ACCESSIBLE_NAME)
    })
  })

})


test.describe('Dashboard Live Data Loading', () => {
  test.beforeEach(async ({ page }) => {
    await setupLiveDashboardMode(page)
  })

  test('shows loading state initially', async ({ page }) => {
    let resolveMcpApi: (() => void) | undefined
    const mcpApiReady = new Promise<void>((resolve) => {
      resolveMcpApi = resolve
    })

    await page.route('**/api/mcp/**', async (route) => {
      await mcpApiReady
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
      })
    })

    await navigateToDashboard(page)

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    const renderedCards = cardsGrid.locator(VISIBLE_GRID_CARD_SELECTOR)
    const loadingIndicator = cardsGrid.locator(DASHBOARD_LOADING_INDICATOR_SELECTOR).first()

    await expect(loadingIndicator).toBeVisible({ timeout: LOADING_SKELETON_TIMEOUT_MS })

    resolveMcpApi!()

    await expect(renderedCards.first()).toBeVisible({ timeout: INITIAL_PAGE_VISIBLE_TIMEOUT_MS })
  })

  test('handles API errors gracefully', async ({ page }) => {
    await page.route('**/api/mcp/clusters**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      })
    )

    await navigateToDashboard(page)

    const PAGE_VISIBLE_TIMEOUT_MS = 30_000
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: ERROR_FALLBACK_TIMEOUT_MS })

    const cards = cardsGrid.locator(VISIBLE_GRID_CARD_SELECTOR)
    await expect(cards.first()).toBeVisible({ timeout: ERROR_FALLBACK_TIMEOUT_MS })

    const demoBadge = cardsGrid.locator('[data-testid="demo-badge"]:visible').first()
    const demoBadgeAppeared = await demoBadge
      .isVisible({ timeout: ERROR_FALLBACK_TIMEOUT_MS })
      .catch(() => false)

    expect.soft(
      demoBadgeAppeared,
      'Expected at least one Demo badge in the dashboard cards after API fallback',
    ).toBe(true)

    if (!demoBadgeAppeared) {
      console.warn('Dashboard API fallback did not render a visible Demo badge — check isDemoData flag and CardWrapper yellow-outline rendering')
    }
  })
})

test.describe('Dashboard Live Card Data Validation', () => {
  test.beforeEach(async ({ page }) => {
    await setupLiveDashboardMode(page)
  })

  test('renders pod count from mocked API data', async ({ page }) => {
    const MOCK_POD_COUNT = 42
    const mockPods = Array.from({ length: MOCK_POD_COUNT }, (_, i) => ({
      name: `test-pod-${i}`,
      namespace: 'default',
      cluster: 'test-cluster',
      status: 'Running',
    }))
    const mockPodResponse = { pods: mockPods }

    await page.route('**/api/mcp/**', (route) => {
      if (route.request().url().includes('/pods')) {
        return route.fallback()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(API_RESPONSES.mcp()),
      })
    })
    await page.route('**/api/mcp/pods**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPodResponse),
      })
    )

    const podsApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/pods') && resp.status() === 200
    )
    await navigateToDashboard(page)
    await podsApiPromise

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    const podCard = cardsGrid.locator('[data-card-type="pods"]')
    await expectVisible(podCard, 'Pod card not present on default dashboard')
    await expect(podCard).toContainText(new RegExp(String.raw`(?<!\d)${MOCK_POD_COUNT}(?!\d)`))
  })

  test('renders cluster health status from mocked API data', async ({ page }) => {
    const mockClusterResponse: MockClusterResponse = validateMockClusterResponse({
      clusters: [
        { name: 'test-healthy-cluster', healthy: true, reachable: true, nodeCount: 5, podCount: 20 },
        { name: 'test-unhealthy-cluster', healthy: false, reachable: true, nodeCount: 3, podCount: 10 },
      ],
    })

    await page.route('**/api/mcp/**', (route) => {
      if (route.request().url().includes('/clusters')) {
        return route.fallback()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(API_RESPONSES.mcp()),
      })
    })
    await page.route('**/api/mcp/clusters**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClusterResponse),
      })
    )

    const clustersApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/clusters') && resp.status() === 200
    )
    await navigateToDashboard(page)
    await clustersApiPromise

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    const clusterHealthCard = cardsGrid.locator('[data-card-type="cluster_health"]')
    await expectVisible(clusterHealthCard, 'Cluster health card not present on default dashboard layout')
    await expect(clusterHealthCard).toContainText('test-healthy-cluster')
    await expect(clusterHealthCard).toContainText('test-unhealthy-cluster')
  })

  test('renders namespace count from mocked cluster data', async ({ page }) => {
    const MOCK_NAMESPACE_COUNT = 15
    const mockClusterResponse: MockClusterResponse = validateMockClusterResponse({
      clusters: [{
        name: 'test-cluster',
        healthy: true,
        reachable: true,
        nodeCount: 5,
        podCount: 20,
        namespaces: Array.from({ length: MOCK_NAMESPACE_COUNT }, (_, i) => `namespace-${i}`),
      }],
    })

    await page.route('**/api/mcp/clusters**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClusterResponse),
      })
    )

    const clustersApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/clusters') && resp.status() === 200
    )
    await navigateToDashboard(page)
    await clustersApiPromise

    const namespaceStatBlock = page.getByTestId('stat-block-namespaces')
    await expectVisible(namespaceStatBlock, 'Namespace stat block not present on default dashboard')
    await expect(namespaceStatBlock).toContainText(new RegExp(String.raw`(?<!\d)${MOCK_NAMESPACE_COUNT}(?!\d)`))
  })
})

// #6459 — Data accuracy (not just structural presence). These tests
// inject deterministic data via route() and assert the rendered values
// exactly. They must FAIL when the numbers are wrong, so we use
// toContainText with specific expected values rather than existence
// assertions.
//
// #10433 — Moved to a standalone top-level describe so these tests do NOT
// inherit the outer `Dashboard Page` beforeEach (setupDashboardTest), which
// registers an addInitScript setting kc-demo-mode=true. Since addInitScript
// callbacks accumulate and cannot be removed, the outer demo-mode=true init
// script was racing with the inner demo-mode=false init script on cross-browser
// projects (webkit, firefox, mobile-safari, mobile-chrome), causing the app to
// load in demo mode and render 12 demo clusters instead of the 3 deterministic
// ones. By isolating these tests, the ONLY addInitScript registered is the one
// that sets kc-demo-mode=false, eliminating the race.
test.describe('Dashboard Data Accuracy (#6459)', () => {
  const EXPECTED_CLUSTER_COUNT = 3

  test.beforeEach(async ({ page }) => {
    // Catch-all mock (includes targeted /api/active-users response to prevent
    // NaN re-render loop in useActiveUsers — see #nightly-playwright).
    await mockApiFallback(page)

    // Override /health to return oauth_configured: true so the auth flow
    // does not force demo mode in webkit/firefox. mockApiFallback returns
    // oauth_configured: false which causes the AuthProvider to call
    // setDemoMode(), overriding localStorage and falling back to built-in
    // demo data instead of the mocked API data. (#10784)
    await page.route('**/health', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/health') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          version: 'dev',
          oauth_configured: true,
          in_cluster: false,
          no_local_agent: true,
          install_method: 'dev',
        }),
      })
    })

    await mockLocalAgentUnavailable(page)

    // Mock /api/dashboards so the dashboard component doesn't wait for a
    // backend response before falling back to demo cards.
    await page.route('**/api/dashboards*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    )

    // Mock authentication
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        }),
      })
    )

    // Deterministic cluster payload: exactly EXPECTED_CLUSTER_COUNT entries.
    // This is the single source of truth for both /clusters and the
    // dashboard summary — if either page shows a different count, the
    // consistency test fails.
    const deterministicClusters = Array.from(
      { length: EXPECTED_CLUSTER_COUNT },
      (_, i) => ({
        name: `accuracy-cluster-${i + 1}`,
        healthy: true,
        reachable: true,
        nodeCount: 2,
        podCount: 10,
      })
    )
    const deterministicClusterResponse: MockClusterResponse = validateMockClusterResponse({
      clusters: deterministicClusters,
    })

    await page.route('**/api/mcp/clusters**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(deterministicClusterResponse),
      })
    )

    // Catch-all fallback for any other MCP endpoints used by the grid.
    await page.route('**/api/mcp/**', (route) => {
      if (route.request().url().includes('/clusters')) {
        // Already handled above; must not double-fulfill.
        return route.fallback()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...deterministicClusterResponse,
          issues: [],
          events: [],
          nodes: [],
        }),
      })
    })

    // Seed localStorage BEFORE any page script runs (#9096, #12088, #12089).
    // Disable demo mode so the app fetches from the mocked API routes
    // above instead of returning built-in demo data (12 clusters).
    // Uses the shared storage helper so addInitScript does not accumulate
    // across tests and IndexedDB cleanup finishes before rehydration.
    await setupTestStorage(page, { demoMode: false, agentSetupDismissed: true })
  })

  test('cluster count in dashboard header matches /clusters page row count', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith('mobile-'),
      'Agent health polling transitions agentStatus to disconnected on mobile emulation, ' +
      'triggering forceSkeletonForOffline=true which hides ClusterGrid before cluster data renders. ' +
      'Data accuracy verified on desktop browsers.'
    )
    // 1. Visit /clusters and count the cluster rows.
    // Wait for the mock API response to be received before inspecting the
    // DOM — on firefox/webkit the SWR cache rehydrates stale (empty)
    // sessionStorage data synchronously, and the async mock response
    // arrives later. Without this guard the row count resolves to 0.
    // (#10955)
    const PAGE_RENDER_TIMEOUT_MS = 30_000
    const clustersApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/clusters') && resp.status() === 200
    )
    await page.goto('/clusters')
    await page.waitForLoadState('domcontentloaded')

    // Ensure the mocked /api/mcp/clusters response was delivered to the page.
    await clustersApiPromise

    // Wait for clusters page to fully render — Firefox/webkit may need extra time
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_RENDER_TIMEOUT_MS })

    // Wait for cluster data to actually render in the ClusterGrid before
    // counting rows. Use cluster-row-* testids instead of text search —
    // the ClusterHealth card also renders cluster.name as text inside
    // clusters-page, and on Firefox/WebKit it can appear before ClusterGrid
    // rows mount, causing getByText to resolve against the card rather than
    // the grid. (#10828, #10993)
    const DATA_RENDER_TIMEOUT_MS = 20_000
    const firstClusterRow = page.locator('[data-testid="cluster-row-accuracy-cluster-1"]')
    await expect(firstClusterRow).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // The clusters page renders a row per cluster. We count any element
    // whose data-testid matches the cluster-row pattern.
    const rowsByTestId = page.locator('[data-testid^="cluster-row-"]')
    await expect(rowsByTestId).toHaveCount(EXPECTED_CLUSTER_COUNT, {
      timeout: DATA_RENDER_TIMEOUT_MS,
    })

    // IMPORTANT: Wait for network to stabilize before navigating to next page (#12095)
    // Sequential page.goto() without stabilization causes navigation race conditions
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // 2. Visit / and assert the Clusters stat block matches the
    //    row count from /clusters.
    const dashboardClustersApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/clusters') && resp.status() === 200
    )
    await navigateToDashboard(page)
    await dashboardClustersApiPromise

    // Target the Clusters StatBlock directly and wait for the mocked cluster
    // payload to render before comparing counts across pages.
    const STAT_BLOCK_TIMEOUT_MS = 20_000
    const clusterStatBlock = page.getByTestId('stat-block-clusters')
    
    // Ensure container is visible before using .first() (#12096)
    // .first() may target stale DOM elements during re-render without synchronization
    await expect(clusterStatBlock.first()).toBeVisible({ timeout: STAT_BLOCK_TIMEOUT_MS })
    await expect(clusterStatBlock.first()).toContainText(
      new RegExp(String.raw`(?<!\d)${EXPECTED_CLUSTER_COUNT}(?!\d)`),
      { timeout: STAT_BLOCK_TIMEOUT_MS },
    )
  })

  test('injected cluster name renders on dashboard exactly as provided', async ({
    page,
  }) => {
    const DASHBOARD_CARD_TIMEOUT_MS = 20_000
    const injectedClusterName = 'accuracy-cluster-1'

    // A single card-level data-accuracy check: a unique cluster name we
    // injected via route() must appear verbatim inside the Cluster Health
    // card. If the card transforms, truncates, or mis-maps the API field,
    // this fails.
    const dashboardClustersApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/mcp/clusters') && resp.status() === 200
    )
    await navigateToDashboard(page)
    await dashboardClustersApiPromise

    const clusterHealthCard = page.locator(`[data-card-id="${DEFAULT_CLUSTER_HEALTH_CARD_ID}"]`)
    await expect(clusterHealthCard).toBeVisible({ timeout: DASHBOARD_CARD_TIMEOUT_MS })
    await expect(clusterHealthCard).toContainText(injectedClusterName, {
      timeout: DASHBOARD_CARD_TIMEOUT_MS,
    })
  })
})
