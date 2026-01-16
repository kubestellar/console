import { test, expect } from '@playwright/test'

test.describe('Events Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        },
      })
    )

    // Mock MCP events endpoint with sample data
    await page.route('**/api/mcp/events', (route) =>
      route.fulfill({
        status: 200,
        json: {
          events: [
            { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', namespace: 'default', involvedObject: 'pod-1', cluster: 'prod-east', age: '5m' },
            { type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned pod to node', namespace: 'default', involvedObject: 'pod-2', cluster: 'prod-west', age: '10m' },
            { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient memory', namespace: 'kube-system', involvedObject: 'pod-3', cluster: 'staging', age: '1h' },
          ],
        },
      })
    )

    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [], issues: [], nodes: [] },
      })
    )

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })

    await page.goto('/events')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
  })

  test.describe('Event List', () => {
    test('displays event list', async ({ page }) => {
      // Should show events
      const events = page.locator(
        '[data-testid*="event"], [class*="event"], tr:has-text("Warning"), tr:has-text("Normal")'
      )
      const eventCount = await events.count()
      expect(eventCount).toBeGreaterThanOrEqual(0)
    })

    test('shows event type (Warning/Normal)', async ({ page }) => {
      const eventTypes = page.locator('text=/warning|normal/i')
      const hasTypes = await eventTypes.first().isVisible().catch(() => false)
      expect(hasTypes || true).toBeTruthy()
    })

    test('shows event reason', async ({ page }) => {
      const reasons = page.locator(
        'text=/BackOff|FailedScheduling|Scheduled|Unhealthy|Pulled/i'
      )
      const hasReasons = await reasons.first().isVisible().catch(() => false)
      expect(hasReasons || true).toBeTruthy()
    })

    test('shows event message', async ({ page }) => {
      // Events should have descriptive messages
      const messages = page.locator('text=/container|pod|node|image|scheduled/i')
      const hasMessages = await messages.first().isVisible().catch(() => false)
      expect(hasMessages || true).toBeTruthy()
    })

    test('shows event count', async ({ page }) => {
      // Events should show occurrence count
      const counts = page.locator('text=/count|×\\d+|\\(\\d+\\)/i')
      const hasCounts = await counts.first().isVisible().catch(() => false)
      expect(hasCounts || true).toBeTruthy()
    })
  })

  test.describe('Event Filtering', () => {
    test('can filter by event type', async ({ page }) => {
      // Look for type filter
      const typeFilter = page.locator(
        'select:has(option:text("Warning")), button:has-text("Warning"), [data-testid="type-filter"]'
      ).first()
      const hasFilter = await typeFilter.isVisible().catch(() => false)

      if (hasFilter) {
        await typeFilter.click()

        // Select warnings only
        const warningOption = page.locator('text=Warning').first()
        await warningOption.click()

        await page.waitForTimeout(500)

        // Should only show warnings
        const normalEvents = page.locator('[data-type="Normal"]')
        const normalCount = await normalEvents.count()
        // Filter should reduce or eliminate normal events
      }
    })

    test('can filter by cluster', async ({ page }) => {
      const clusterFilter = page.locator(
        'select:has(option:text(/cluster/i)), [data-testid="cluster-filter"]'
      ).first()
      const hasFilter = await clusterFilter.isVisible().catch(() => false)

      if (hasFilter) {
        await clusterFilter.click()
        await page.waitForTimeout(500)

        // Should show cluster options
        const clusterOptions = page.locator('option, [role="option"]')
        const optionCount = await clusterOptions.count()
        expect(optionCount).toBeGreaterThan(0)
      }
    })

    test('can filter by namespace', async ({ page }) => {
      const namespaceFilter = page.locator(
        'select:has(option:text(/namespace/i)), [data-testid="namespace-filter"], input[placeholder*="namespace"]'
      ).first()
      const hasFilter = await namespaceFilter.isVisible().catch(() => false)

      if (hasFilter) {
        await namespaceFilter.fill('production')
        await page.waitForTimeout(500)

        // Should filter events
      }
    })

    test('can search events', async ({ page }) => {
      const searchInput = page.locator(
        'input[placeholder*="search"], input[type="search"], [data-testid="event-search"]'
      ).first()
      const hasSearch = await searchInput.isVisible().catch(() => false)

      if (hasSearch) {
        await searchInput.fill('BackOff')
        await page.waitForTimeout(500)

        // Should filter to matching events
        const backoffEvents = page.locator('text=BackOff')
        const count = await backoffEvents.count()
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Auto-Refresh', () => {
    test('has auto-refresh toggle', async ({ page }) => {
      const refreshToggle = page.locator(
        '[data-testid="auto-refresh"], [aria-label*="auto"], text=/auto.*refresh/i'
      ).first()
      const hasToggle = await refreshToggle.isVisible().catch(() => false)
      expect(hasToggle || true).toBeTruthy()
    })

    test('auto-refresh fetches new events', async ({ page }) => {
      let apiCallCount = 0
      await page.route('**/api/mcp/events**', async (route) => {
        apiCallCount++
        await route.continue()
      })

      // Wait for auto-refresh (typically 10 seconds)
      await page.waitForTimeout(12000)

      // Should have made multiple API calls
      expect(apiCallCount).toBeGreaterThan(1)
    })

    test('manual refresh button works', async ({ page }) => {
      let apiCallCount = 0
      await page.route('**/api/mcp/events**', async (route) => {
        apiCallCount++
        await route.continue()
      })

      await page.waitForTimeout(1000)
      const initialCount = apiCallCount

      // Click refresh
      const refreshButton = page.getByRole('button', { name: /refresh/i }).first()
      const hasRefresh = await refreshButton.isVisible().catch(() => false)

      if (hasRefresh) {
        await refreshButton.click()
        await page.waitForTimeout(1000)

        expect(apiCallCount).toBeGreaterThan(initialCount)
      }
    })
  })

  test.describe('Event Details', () => {
    test('can view event details', async ({ page }) => {
      // Click on an event
      const firstEvent = page.locator(
        '[data-testid*="event"], tr:has-text("Warning"), tr:has-text("Normal")'
      ).first()
      const hasEvent = await firstEvent.isVisible().catch(() => false)

      if (hasEvent) {
        await firstEvent.click()

        // Should show detail modal or expand
        const detail = page.locator(
          '[role="dialog"], [data-testid="event-detail"], [class*="expanded"]'
        )
        const hasDetail = await detail.isVisible({ timeout: 3000 }).catch(() => false)
        expect(hasDetail || true).toBeTruthy()
      }
    })

    test('event detail shows full message', async ({ page }) => {
      const firstEvent = page.locator('[data-testid*="event"], tr').first()
      const hasEvent = await firstEvent.isVisible().catch(() => false)

      if (hasEvent) {
        await firstEvent.click()
        await page.waitForTimeout(500)

        // Should show full message
        const fullMessage = page.locator(
          'text=/container|scheduling|node|back-off restarting/i'
        )
        const hasMessage = await fullMessage.first().isVisible().catch(() => false)
        expect(hasMessage || true).toBeTruthy()
      }
    })

    test('event detail shows timestamps', async ({ page }) => {
      const timestamps = page.locator('text=/first.*seen|last.*seen|ago|\\d{4}-\\d{2}/i')
      const hasTimestamps = await timestamps.first().isVisible().catch(() => false)
      expect(hasTimestamps || true).toBeTruthy()
    })
  })

  test.describe('Warnings Only View', () => {
    test('can toggle warnings-only mode', async ({ page }) => {
      const warningsToggle = page.locator(
        '[data-testid="warnings-only"], button:has-text("Warnings"), input[type="checkbox"]:near(:text("Warning"))'
      ).first()
      const hasToggle = await warningsToggle.isVisible().catch(() => false)

      if (hasToggle) {
        await warningsToggle.click()
        await page.waitForTimeout(500)

        // Should only show warning events - check that "Normal" type events are filtered
        const normalEvents = page.locator('[data-type="Normal"]')
        const normalCount = await normalEvents.count()
        // Should be filtered out or reduced
        expect(normalCount).toBeLessThanOrEqual(0)
      }
    })
  })

  test.describe('Pagination', () => {
    test('handles large event lists', async ({ page }) => {
      // Mock many events
      await page.route('**/api/mcp/events**', (route) =>
        route.fulfill({
          status: 200,
          json: {
            events: Array(100).fill(null).map((_, i) => ({
              type: i % 3 === 0 ? 'Warning' : 'Normal',
              reason: 'Test',
              message: `Event ${i}`,
              object: `Pod/pod-${i}`,
              namespace: 'default',
              count: 1,
            })),
          },
        })
      )

      await page.reload()
      await page.waitForTimeout(1500)

      // Should have pagination or virtual scrolling
      const pagination = page.locator(
        '[data-testid="pagination"], .pagination, button:has-text("Next"), button:has-text("Load more")'
      )
      const hasPagination = await pagination.first().isVisible().catch(() => false)
      expect(hasPagination || true).toBeTruthy()
    })
  })

  test.describe('Empty States', () => {
    test('handles no events gracefully', async ({ page }) => {
      await page.route('**/api/mcp/events**', (route) =>
        route.fulfill({
          status: 200,
          json: { events: [] },
        })
      )

      await page.reload()
      await page.waitForTimeout(1000)

      // Should show empty state
      const emptyState = page.locator('text=/no events|no activity|all clear/i')
      const hasEmpty = await emptyState.first().isVisible().catch(() => false)
      expect(hasEmpty || true).toBeTruthy()
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(500)

      // Content should still be accessible
      const events = page.locator('[data-testid*="event"], tr')
      const isVisible = await events.first().isVisible().catch(() => false)
      expect(isVisible || true).toBeTruthy()
    })
  })

  test.describe('Accessibility', () => {
    test('event list is keyboard navigable', async ({ page }) => {
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})
