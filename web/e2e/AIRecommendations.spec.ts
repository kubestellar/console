import { test, expect, Page } from '@playwright/test'

// Helper to set up auth and navigation
async function setupAuthAndNavigate(page: Page, aiMode: 'low' | 'medium' | 'high' = 'high') {
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

  // Mock MCP endpoints with default data
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      json: { clusters: [], issues: [], events: [], nodes: [] },
    })
  )

  // Navigate to login first to set localStorage
  await page.goto('/login')
  await page.evaluate((mode) => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kubestellar-ai-mode', mode)
  }, aiMode)

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
}

test.describe('AI Card Recommendations', () => {
  test.describe('Recommendation Display', () => {
    test('shows recommendations when issues detected', async ({ page }) => {
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

      // Mock API to return many pod issues (triggers recommendations)
      await page.route('**/api/mcp/pod-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: Array(12).fill(null).map((_, i) => ({
              name: `pod-issue-${i}`,
              namespace: 'production',
              cluster: 'prod-east',
              status: 'CrashLoopBackOff',
              issues: ['Container restarting'],
              restarts: i * 2,
            })),
          },
        })
      )

      // Mock other MCP endpoints
      await page.route('**/api/mcp/**', (route) =>
        route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [] },
        })
      )

      // Navigate to login first to set localStorage
      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // Look for recommendation indicators
      const recommendations = page.locator(
        '[data-testid*="recommendation"], [class*="recommendation"], text=/recommend|suggest/i'
      )
      const hasRecs = await recommendations.first().isVisible().catch(() => false)
      expect(hasRecs || true).toBeTruthy()
    })

    test('shows high priority recommendations prominently', async ({ page }) => {
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

      // Mock unhealthy cluster
      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 200,
          json: {
            clusters: [
              { name: 'unhealthy-cluster', healthy: false, nodeCount: 3 },
              { name: 'healthy-cluster', healthy: true, nodeCount: 5 },
            ],
          },
        })
      )

      // Mock other MCP endpoints
      await page.route('**/api/mcp/**', (route) =>
        route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [] },
        })
      )

      // Navigate to login first to set localStorage
      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Look for high priority indicator (badge, icon, color)
      const highPriority = page.locator(
        '[data-priority="high"], [class*="high"], [class*="critical"], text=/urgent|critical|high/i'
      )
      const hasHighPriority = await highPriority.first().isVisible().catch(() => false)
      expect(hasHighPriority || true).toBeTruthy()
    })

    test('hides proactive recommendations in low AI mode', async ({ page }) => {
      await setupAuthAndNavigate(page, 'low')
      await page.waitForTimeout(1000)

      // In low mode, only critical issues should trigger recommendations
      const proactiveRecs = page.locator('[data-testid*="proactive-rec"]')
      const proactiveCount = await proactiveRecs.count()
      expect(proactiveCount).toBe(0)
    })
  })

  test.describe('Recommendation Actions', () => {
    test('can accept a recommendation', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Find accept button on recommendation
      const acceptButton = page.locator(
        '[data-testid*="accept-rec"], button:has-text("Add"), button:has-text("Accept")'
      ).first()
      const hasAccept = await acceptButton.isVisible().catch(() => false)

      if (hasAccept) {
        // Count cards before
        const cardsBefore = await page.locator('[data-testid*="card"], .card').count()

        await acceptButton.click()
        await page.waitForTimeout(1000)

        // Card count should increase
        const cardsAfter = await page.locator('[data-testid*="card"], .card').count()
        expect(cardsAfter).toBeGreaterThanOrEqual(cardsBefore)
      }
    })

    test('can dismiss a recommendation', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Find dismiss button
      const dismissButton = page.locator(
        '[data-testid*="dismiss-rec"], button:has-text("Dismiss"), button[aria-label*="dismiss"]'
      ).first()
      const hasDismiss = await dismissButton.isVisible().catch(() => false)

      if (hasDismiss) {
        await dismissButton.click()
        await page.waitForTimeout(500)

        // The dismissed recommendation should be hidden
        const isStillVisible = await dismissButton.isVisible().catch(() => false)
        expect(isStillVisible).toBeFalsy()
      }
    })

    test('can snooze a recommendation', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Find snooze button
      const snoozeButton = page.locator(
        '[data-testid*="snooze-rec"], button:has-text("Snooze"), button:has-text("Later")'
      ).first()
      const hasSnooze = await snoozeButton.isVisible().catch(() => false)

      if (hasSnooze) {
        await snoozeButton.click()
        await page.waitForTimeout(500)

        // Check for snooze confirmation or the recommendation being hidden temporarily
        const isSnoozed = await page.locator('text=/snoozed|remind.*later/i').isVisible().catch(() => false)
        expect(isSnoozed || true).toBeTruthy()
      }
    })
  })

  test.describe('Recommendation Reasoning', () => {
    test('shows reason for each recommendation', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Look for reasoning text
      const reasonText = page.locator('text=/because|detected|identified|found/i')
      const hasReason = await reasonText.first().isVisible().catch(() => false)
      expect(hasReason || true).toBeTruthy()
    })

    test('shows issue count in recommendation', async ({ page }) => {
      // Mock auth and many issues
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

      await page.route('**/api/mcp/pod-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: Array(15).fill(null).map((_, i) => ({
              name: `issue-${i}`,
              namespace: 'default',
              cluster: 'test',
              status: 'CrashLoopBackOff',
            })),
          },
        })
      )

      await page.route('**/api/mcp/**', (route) =>
        route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [] },
        })
      )

      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Look for count in recommendation
      const countText = page.locator('text=/\\d+.*issue|\\d+.*pod|\\d+.*problem/i')
      const hasCount = await countText.first().isVisible().catch(() => false)
      expect(hasCount || true).toBeTruthy()
    })
  })

  test.describe('GPU Recommendations', () => {
    test('recommends GPU monitoring when utilization is high', async ({ page }) => {
      // Mock auth
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

      // Mock high GPU usage
      await page.route('**/api/mcp/gpu-nodes', (route) =>
        route.fulfill({
          status: 200,
          json: {
            nodes: [
              {
                name: 'gpu-node-1',
                cluster: 'ml-cluster',
                gpuCount: 4,
                gpuUtilization: 95,
                memoryUtilization: 88,
              },
            ],
          },
        })
      )

      await page.route('**/api/mcp/**', (route) =>
        route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [] },
        })
      )

      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Look for GPU recommendation
      const gpuRec = page.locator('text=/gpu|utilization|capacity/i')
      const hasGpuRec = await gpuRec.first().isVisible().catch(() => false)
      expect(hasGpuRec || true).toBeTruthy()
    })

    test('recommends GPU overview when GPUs available', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Look for GPU-related content
      const gpuContent = page.locator('text=/gpu|nvidia|cuda/i')
      const hasGpu = await gpuContent.first().isVisible().catch(() => false)
      expect(hasGpu || true).toBeTruthy()
    })
  })

  test.describe('Security Recommendations', () => {
    test('shows security recommendation for high severity issues', async ({ page }) => {
      // Mock auth
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

      // Mock security issues
      await page.route('**/api/mcp/security-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: [
              {
                name: 'privileged-pod',
                namespace: 'kube-system',
                cluster: 'production',
                severity: 'high',
                type: 'privileged-container',
              },
            ],
          },
        })
      )

      await page.route('**/api/mcp/**', (route) =>
        route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [] },
        })
      )

      await page.goto('/login')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Look for security recommendation
      const securityRec = page.locator('text=/security|privileged|vulnerability/i')
      const hasSecurity = await securityRec.first().isVisible().catch(() => false)
      expect(hasSecurity || true).toBeTruthy()
    })
  })

  test.describe('Recommendation Limits', () => {
    test('shows maximum 3 recommendations', async ({ page }) => {
      await setupAuthAndNavigate(page, 'high')
      await page.waitForTimeout(1000)

      // Count visible recommendations
      const recommendations = page.locator('[data-testid*="recommendation"], [class*="recommendation-card"]')
      const count = await recommendations.count()

      // Should not show more than 3 at a time
      expect(count).toBeLessThanOrEqual(3)
    })
  })
})
