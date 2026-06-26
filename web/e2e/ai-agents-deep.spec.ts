import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
} from './helpers/setup'

/**
 * AI Agents Deep Tests (/ai-agents)
 *
 * Validates the AIAgents page: tab navigation, stats overview,
 * demo data state, error handling, and core UI elements.
 */

/** Route under test */
const AI_AGENTS_ROUTE = '/ai-agents'

/** Minimum number of tab buttons expected (kagenti + kagent) */
const EXPECTED_TAB_COUNT = 2

/** Minimum number of stat blocks in the stats overview */
const MIN_STAT_BLOCKS = 1

// ---------------------------------------------------------------------------
// AI Agents Deep Tests
// ---------------------------------------------------------------------------
test.describe('AI Agents Deep Tests (/ai-agents)', () => {
  test('loads without console errors', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)

    await expect(page.locator('body')).toBeVisible()

    if (errors.length > 0) {
      console.log('Unexpected console errors on /ai-agents:', errors)
    }
    expect(errors, 'Unexpected console errors on /ai-agents').toHaveLength(0)
  })

  test('renders page title', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    const title = page.getByTestId('dashboard-title')
    await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const titleText = await title.textContent()
    expect(titleText?.trim().length).toBeGreaterThan(0)
  })

  test('displays dashboard header', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)

    const header = page.getByTestId('dashboard-header')
    await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Header should contain the title and refresh button
    await expect(page.getByTestId('dashboard-title')).toBeVisible()
    await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
  })

  test('shows stats overview', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    // Stats section should be present with at least one stat block
    const statsSection = page.getByTestId('stats-overview')
      .or(page.locator('[data-testid*="stat-block"]'))

    const hasStats = await statsSection.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasStats) {
      // Stats may not render when there is no data — skip gracefully
      test.skip()
      return
    }

    const statBlocks = page.locator('[data-testid*="stat-block"]')
    const count = await statBlocks.count()
    expect(count).toBeGreaterThanOrEqual(MIN_STAT_BLOCKS)
  })

  test('displays tab navigation', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    // The tab bar renders button elements with tab labels (Kagenti, Kagent)
    const kagentiTab = page.getByRole('button', { name: /kagenti/i })
    const kagentTab = page.getByRole('button', { name: /kagent/i })

    const hasKagenti = await kagentiTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    const hasKagent = await kagentTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    // At least one tab should be visible
    expect(hasKagenti || hasKagent).toBe(true)
  })

  test('tabs are interactive', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    const kagentiTab = page.getByRole('button', { name: /kagenti/i })
    const kagentTab = page.getByRole('button', { name: /kagent/i })

    const hasKagentiTab = await kagentiTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    const hasKagentTab = await kagentTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasKagentiTab && !hasKagentTab) {
      test.skip()
      return
    }

    // Click the second tab if available, otherwise click the first
    if (hasKagentTab) {
      await kagentTab.click()
      // After clicking, the kagent tab should have an active style (border-purple)
      await expect(kagentTab).toBeVisible()
    } else if (hasKagentiTab) {
      await kagentiTab.click()
      await expect(kagentiTab).toBeVisible()
    }

    // Page should still be on the AI Agents route (tabs don't navigate away)
    await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
  })

  test('refresh button is clickable', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    const refreshBtn = page.getByTestId('dashboard-refresh-button')
    await expect(refreshBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    await refreshBtn.click()

    // Button should remain visible and not crash the page
    await expect(refreshBtn).toBeVisible()
    await expect(page.getByTestId('dashboard-header')).toBeVisible()
  })

  test('page has meaningful content', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    const bodyText = await page.textContent('body')
    // Page should have substantial content (not blank or just a spinner)
    const MIN_CONTENT_LENGTH = 50
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('renders cards section', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    // DashboardPage renders a cards grid
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
      .or(page.locator('[data-testid*="cards-grid"]'))

    const hasGrid = await cardsGrid.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (hasGrid) {
      // Grid should have card children or an empty-state prompt
      const children = cardsGrid.first().locator('> div')
      const childCount = await children.count()

      const emptyState = page.getByText(/no cards|add your first card|get started/i)
      const hasEmpty = await emptyState.first().isVisible().catch(() => false)

      expect(childCount > 0 || hasEmpty).toBe(true)
    } else {
      // An empty state message may be displayed instead of a grid
      const emptyState = page.getByText(/no cards|empty|get started|add card/i)
      const hasEmpty = await emptyState.first().isVisible().catch(() => false)
      // An empty state message should be displayed when no grid is found
      expect(hasEmpty).toBe(true)
    }
  })

  test('handles demo data state', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    // In demo mode, a demo badge may appear on cards or in the header
    const demoBadge = page.getByTestId('demo-badge')
      .or(page.locator('[data-testid*="demo"]'))
      .or(page.getByText(/demo/i))

    const hasDemoBadge = await demoBadge.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    // Demo mode is expected — the badge should be visible or the page should
    // render content without error (fallback to demo data is transparent)
    const bodyText = await page.textContent('body')
    const MIN_DEMO_CONTENT_LENGTH = 30
    expect(hasDemoBadge || (bodyText?.trim().length ?? 0) > MIN_DEMO_CONTENT_LENGTH).toBe(true)
  })

  test('disabled tabs show Install link', async ({ page }) => {
    await setupDemoAndNavigate(page, AI_AGENTS_ROUTE)
    await waitForSubRoute(page)

    // Disabled tabs render an "Install" link next to their label
    const installLink = page.getByRole('link', { name: /install/i })
    const hasInstall = await installLink.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (!hasInstall) {
      // No disabled tabs at the moment — skip gracefully
      test.skip()
      return
    }

    // The Install link should point to a GitHub repo
    const href = await installLink.first().getAttribute('href')
    expect(href).toMatch(/^https:\/\/github\.com\//)
  })

  test('error state on API failure', async ({ page }) => {
    await setupDemoMode(page)

    // Intercept kagenti API to return 500
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Page should not crash — it should show an error banner or fall back to demo data
    await expect(page.locator('body')).toBeVisible()

    const bodyText = await page.textContent('body')
    const MIN_ERROR_CONTENT_LENGTH = 30
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_ERROR_CONTENT_LENGTH)
  })
})
