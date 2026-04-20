import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for dashboard tests
 */
async function setupDashboardTest(page: Page) {
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

  // Mock cluster data
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [
          { name: 'cluster-1', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
          { name: 'cluster-2', context: 'ctx-2', healthy: true, nodeCount: 3, podCount: 32 },
        ],
        issues: [],
        events: [],
        nodes: [],
      }),
    })
  )

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardTest(page)
  })

  test.describe('Layout and Structure', () => {
    // On mobile viewports the sidebar is hidden by design (`-translate-x-full
    // hidden md:flex`) — the hamburger menu opens it on demand. These tests
    // assume desktop layout, so skip them on the mobile-* Playwright projects.
    test('displays dashboard with sidebar', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      // Check for main layout elements using data-testid
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
    })

    test('displays navigation items in sidebar', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')
      // Sidebar should have navigation
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible()

      // Should have navigation links
      const navLinks = page.getByTestId('sidebar-primary-nav').locator('a')
      const linkCount = await navLinks.count()
      expect(linkCount).toBeGreaterThan(0)
    })

    test('displays header with refresh controls', async ({ page }) => {
      // Check for navbar/header elements
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('dashboard-title')).toBeVisible()
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Dashboard Cards', () => {
    test('displays dashboard cards grid', async ({ page }) => {
      // Wait for cards grid to be visible
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 })
    })

    test('cards have proper structure', async ({ page }) => {
      // #9074 — This test previously asserted `cardCount >= 0`, which is
      // mathematically impossible to fail (Playwright `.count()` always
      // returns a non-negative integer). A regression that removed every
      // card from the dashboard would have gone undetected. The assertions
      // below verify real structural properties of the rendered cards.

      // Min number of default cards we expect on a fresh dashboard. The
      // default dashboard ships with several built-in cards; if this drops
      // to zero the dashboard is broken.
      const MIN_DEFAULT_CARDS = 1

      // Max time (ms) to wait for the cards grid + first card to appear.
      const GRID_VISIBLE_TIMEOUT_MS = 10_000

      // Max number of cards to spot-check structural attributes on. We
      // bound this so the test stays fast even on dashboards with many
      // cards while still catching regressions on the first few.
      const MAX_CARDS_TO_CHECK = 5

      // Wait for cards grid to be visible.
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

      // The grid itself must be a role=grid with an a11y label so screen
      // readers can announce it. This is part of the public contract of
      // the dashboard layout (see Dashboard.tsx).
      await expect(cardsGrid).toHaveAttribute('role', 'grid')
      await expect(cardsGrid).toHaveAttribute('aria-label', /.+/)

      // Every rendered card carries a `data-card-id` attribute applied by
      // CardWrapper. Counting those — rather than direct-child <div>s —
      // excludes non-card grid children like the DiscoverCardsPlaceholder
      // and any drag overlays. That makes this a real assertion about
      // *cards*, not arbitrary grid children.
      const cards = cardsGrid.locator('[data-card-id]')

      // Wait for at least one card to actually render before counting,
      // otherwise the count race with React's first paint could falsely
      // report zero. Playwright's `.first()` + toBeVisible serves as the
      // synchronization barrier.
      await expect(cards.first()).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

      const cardCount = await cards.count()
      expect(cardCount).toBeGreaterThanOrEqual(MIN_DEFAULT_CARDS)

      // Spot-check each card (up to MAX_CARDS_TO_CHECK) for the structural
      // attributes that downstream features depend on:
      //   - data-card-type: drives card-type-specific behaviors and
      //     analytics (cardType is used as the GA4 event label).
      //   - data-card-id: stable identity for drag/drop, persistence, and
      //     selector targeting in other tests.
      //   - aria-label: announced to screen readers as the card title.
      //   - <h3>: visible heading per the design system.
      const cardsToCheck = Math.min(cardCount, MAX_CARDS_TO_CHECK)
      for (let i = 0; i < cardsToCheck; i++) {
        const card = cards.nth(i)

        // Required attributes.
        await expect(card).toHaveAttribute('data-card-type', /.+/)
        await expect(card).toHaveAttribute('data-card-id', /.+/)
        await expect(card).toHaveAttribute('aria-label', /.+/)

        // Each card must render a visible <h3> heading (the title shown in
        // the card header). If a card variant ever stops rendering the
        // heading, this catches it.
        const heading = card.locator('h3').first()
        await expect(heading).toBeVisible()
        await expect(heading).not.toHaveText('')
      }
    })

    test('cards are interactive (hover/click)', async ({ page }) => {
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 })

      // Find first card in the grid
      const cardsGrid = page.getByTestId('dashboard-cards-grid')
      const firstCard = cardsGrid.locator('> div').first()

      // Card should be visible
      const isVisible = await firstCard.isVisible().catch(() => false)

      if (isVisible) {
        // Test hover - should not throw
        await firstCard.hover()

        // Card should remain visible after hover
        await expect(firstCard).toBeVisible()
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
      await expect(page.getByTestId('sidebar-add-card')).toBeVisible({ timeout: 5000 })

      // Click add card button
      await page.getByTestId('sidebar-add-card').click()

      // Modal should appear (look for modal content)
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Data Loading', () => {
    test('shows loading state initially', async ({ page }) => {
      // Delay the API response to see loading state
      await page.route('**/api/mcp/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
        })
      })

      // Seed localStorage BEFORE any page script runs (#9096).
      await page.addInitScript(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
      })

      await page.goto('/')

      // Dashboard page should be visible even during loading
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('handles API errors gracefully', async ({ page }) => {
      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' }),
        })
      )

      // Seed localStorage BEFORE any page script runs (#9096).
      await page.addInitScript(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
      })

      await page.goto('/')

      // Dashboard should still render (not crash)
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('refresh button triggers data reload', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 5000 })

      // Click refresh
      await page.getByTestId('dashboard-refresh-button').click()

      // Button should still be visible after click
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Page should still render at mobile size
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Header should still be visible
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      // Content should still be accessible
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-header')).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('has proper heading hierarchy', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have h1 heading
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBeGreaterThanOrEqual(1)
    })

    test('supports keyboard navigation', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('has proper ARIA labels', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Refresh button should have title for accessibility. The actual i18n
      // string is `common.refreshClusterData` → "Refresh cluster data"
      // (see web/src/locales/en/common.json and DashboardHeader.tsx).
      const refreshButton = page.getByTestId('dashboard-refresh-button')
      await expect(refreshButton).toHaveAttribute('title', 'Refresh cluster data')
    })
  })

  // #6459 — Data accuracy (not just structural presence). These tests
  // inject deterministic data via route() and assert the rendered values
  // exactly. They must FAIL when the numbers are wrong, so we use
  // toContainText with specific expected values rather than existence
  // assertions.
  test.describe('Data Accuracy (#6459)', () => {
    const EXPECTED_CLUSTER_COUNT = 3

    test.beforeEach(async ({ page }) => {
      // #6507(C) — The outer `Dashboard Page` describe's beforeEach
      // (setupDashboardTest) already registered handlers for **/api/me and
      // **/api/mcp/**. Unroute them here so our deterministic payload is the
      // ONLY source of data for these Data Accuracy tests — otherwise the
      // outer mock with 2 clusters could race with our EXPECTED_CLUSTER_COUNT.
      await page.unroute('**/api/me')
      await page.unroute('**/api/mcp/**')

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
          context: `ctx-${i + 1}`,
          healthy: true,
          reachable: true,
          nodeCount: 2,
          podCount: 10,
        })
      )

      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: deterministicClusters }),
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
            clusters: deterministicClusters,
            issues: [],
            events: [],
            nodes: [],
          }),
        })
      })

      // Seed localStorage BEFORE any page script runs (#9096).
      await page.addInitScript(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('demo-user-onboarded', 'true')
      })
    })

    test('cluster count in dashboard header matches /clusters page row count', async ({
      page,
    }) => {
      // 1. Visit /clusters and count the cluster rows.
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')

      // The clusters page renders a row per cluster. We count any element
      // whose data-testid matches the cluster-row pattern. If the test
      // infra doesn't expose cluster-row testids, fall back to counting
      // by name strings — both must agree with EXPECTED_CLUSTER_COUNT.
      const rowsByTestId = page.locator('[data-testid^="cluster-row-"]')
      const rowCountByTestId = await rowsByTestId.count().catch(() => 0)

      let clustersPageCount = rowCountByTestId
      if (clustersPageCount === 0) {
        // Fallback: count unique cluster-name text occurrences.
        let found = 0
        for (let i = 1; i <= EXPECTED_CLUSTER_COUNT; i++) {
          const hasName = await page
            .getByText(`accuracy-cluster-${i}`)
            .first()
            .isVisible()
            .catch(() => false)
          if (hasName) found++
        }
        clustersPageCount = found
      }

      expect(clustersPageCount).toBe(EXPECTED_CLUSTER_COUNT)

      // 2. Visit /, find any element that reports the cluster count,
      //    and assert it matches.
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({
        timeout: 10000,
      })

      // PR #6574 items A+B — target the StatBlock for `clusters` directly
      // via the new `stat-block-${id}` testid. Previously this spec looked
      // for `cluster-count` / `total-clusters` testids that didn't exist
      // on StatsOverview.tsx at all, so the `hasCountEl` check always fell
      // through to the structural fallback. Now we address the block
      // directly and use a word-boundary regex so the count can't
      // false-positive on substrings (e.g. "3" matching inside "30 nodes").
      const clusterStatBlock = page.getByTestId('stat-block-clusters').first()
      const hasStatBlock = await clusterStatBlock.isVisible().catch(() => false)
      if (hasStatBlock) {
        // Word-boundary match: the StatBlock wraps the numeric value in a
        // div with header text ("Clusters") and optional sublabel, so we
        // can't use toHaveText (which would match the whole block). A
        // word-bounded regex keeps this precise without requiring a deeper
        // DOM drill-down into every display mode (numeric/gauge/ring/etc).
        await expect(clusterStatBlock).toContainText(
          new RegExp(`\\b${EXPECTED_CLUSTER_COUNT}\\b`)
        )
      } else {
        // PR #6574 item B — Structural fallback. If the clusters StatBlock
        // isn't mounted (e.g. user hid it via StatsConfig), try an aria
        // role=status element that explicitly labels itself as a cluster
        // count. Use a word-boundary regex, not toContainText(String(n)),
        // so "3" can't silently match "30 nodes in 3 clusters".
        const countByLabel = page
          .getByRole('status')
          .filter({ hasText: /cluster/i })
          .first()
        const labelVisible = await countByLabel.isVisible().catch(() => false)
        if (labelVisible) {
          await expect(countByLabel).toHaveText(
            new RegExp(`\\b${EXPECTED_CLUSTER_COUNT}\\b`)
          )
        } else {
          // Last-resort: no element identifies itself as a cluster count.
          // That's a regression — the dashboard isn't reporting clusters at
          // all. Fail explicitly with a descriptive message.
          throw new Error(
            'Dashboard did not expose a cluster-count element (no ' +
              '[data-testid="stat-block-clusters"] or role=status with "cluster" text).'
          )
        }
      }
    })

    test('injected cluster name renders on dashboard exactly as provided', async ({
      page,
    }) => {
      // A single card-level data-accuracy check: a unique cluster name we
      // injected via route() must appear verbatim on the rendered page. If
      // the card transforms, truncates, or mis-maps the API field, this
      // fails. Uses toContainText so it's a real content assertion, not a
      // presence check.
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('dashboard-page')).toBeVisible({
        timeout: 10000,
      })

      // At least one of the injected names should appear. We don't care
      // which card renders it — what matters is that the API value round-
      // trips to the DOM without mutation.
      const body = page.locator('body')
      await expect(body).toContainText('accuracy-cluster-1', {
        timeout: 10000,
      })
    })

  })
})
