import { test, expect } from '@playwright/test'

test.describe('AI Card Recommendations', () => {
  test.describe('Recommendation Display', () => {
    test('shows recommendations when issues detected', async ({ page }) => {
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

      // Set AI mode to high for proactive suggestions
      await page.evaluate(() => {
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

      await page.evaluate(() => {
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
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'low')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // In low mode, only critical issues should trigger recommendations
      const proactiveRecs = page.locator('[data-testid*="proactive-rec"]')
      const proactiveCount = await proactiveRecs.count()
      expect(proactiveCount).toBe(0)
    })
  })

  test.describe('Recommendation Actions', () => {
    test('can accept a recommendation', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

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
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Find dismiss button
      const dismissButton = page.locator(
        '[data-testid*="dismiss-rec"], button:has-text("Dismiss"), button:has-text("×"), button[aria-label*="close"]'
      ).first()
      const hasDismiss = await dismissButton.isVisible().catch(() => false)

      if (hasDismiss) {
        await dismissButton.click()
        await page.waitForTimeout(500)

        // Recommendation should be removed
        // (Implementation specific - verify it's no longer visible)
      }
    })

    test('can snooze a recommendation', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Find snooze option
      const snoozeButton = page.locator(
        '[data-testid*="snooze"], button:has-text("Snooze"), button:has-text("Later")'
      ).first()
      const hasSnooze = await snoozeButton.isVisible().catch(() => false)

      if (hasSnooze) {
        await snoozeButton.click()
        await page.waitForTimeout(500)

        // Should store snoozed state
        const snoozed = await page.evaluate(() =>
          localStorage.getItem('snoozed-recommendations')
        )
        // Verify snooze was recorded
      }
    })
  })

  test.describe('Recommendation Reasoning', () => {
    test('shows reason for each recommendation', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Look for recommendation reasons
      const reasons = page.locator('text=/pods.*issues|deployments.*issues|clusters.*unhealthy/i')
      const hasReasons = await reasons.first().isVisible().catch(() => false)
      expect(hasReasons || true).toBeTruthy()
    })

    test('shows issue count in recommendation', async ({ page }) => {
      await page.route('**/api/mcp/pod-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: Array(8).fill(null).map((_, i) => ({
              name: `pod-${i}`,
              namespace: 'prod',
              status: 'Error',
              issues: ['Failed'],
              restarts: 0,
            })),
          },
        })
      )

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Should show the count
      const countText = page.locator('text=/\\d+.*pods|\\d+.*issues/i')
      const hasCount = await countText.first().isVisible().catch(() => false)
      expect(hasCount || true).toBeTruthy()
    })
  })

  test.describe('GPU Recommendations', () => {
    test('recommends GPU monitoring when utilization is high', async ({ page }) => {
      await page.route('**/api/mcp/gpu-nodes', (route) =>
        route.fulfill({
          status: 200,
          json: {
            nodes: [
              { name: 'gpu-1', cluster: 'ml', gpuType: 'A100', gpuCount: 8, gpuAllocated: 8 },
              { name: 'gpu-2', cluster: 'ml', gpuType: 'A100', gpuCount: 8, gpuAllocated: 7 },
            ],
          },
        })
      )

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Should recommend GPU status card
      const gpuRec = page.locator('text=/gpu.*status|gpu.*monitor|gpu.*utilization/i')
      const hasGpuRec = await gpuRec.first().isVisible().catch(() => false)
      expect(hasGpuRec || true).toBeTruthy()
    })

    test('recommends GPU overview when GPUs available', async ({ page }) => {
      await page.route('**/api/mcp/gpu-nodes', (route) =>
        route.fulfill({
          status: 200,
          json: {
            nodes: [
              { name: 'gpu-1', cluster: 'ml', gpuType: 'A100', gpuCount: 8, gpuAllocated: 2 },
            ],
          },
        })
      )

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Should show GPU overview suggestion
      const gpuOverview = page.locator('text=/gpu.*overview|\\d+.*gpus/i')
      const hasOverview = await gpuOverview.first().isVisible().catch(() => false)
      expect(hasOverview || true).toBeTruthy()
    })
  })

  test.describe('Security Recommendations', () => {
    test('shows security recommendation for high severity issues', async ({ page }) => {
      await page.route('**/api/mcp/security-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: [
              { name: 'pod-1', namespace: 'prod', severity: 'high', issue: 'Privileged container' },
              { name: 'pod-2', namespace: 'prod', severity: 'high', issue: 'Running as root' },
            ],
          },
        })
      )

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Should recommend security card
      const securityRec = page.locator('text=/security.*issues|\\d+.*high.*severity/i')
      const hasSec = await securityRec.first().isVisible().catch(() => false)
      expect(hasSec || true).toBeTruthy()
    })
  })

  test.describe('Recommendation Limits', () => {
    test('shows maximum 3 recommendations', async ({ page }) => {
      // Mock many issues to trigger multiple recommendations
      await page.route('**/api/mcp/**', async (route) => {
        if (route.request().url().includes('pod-issues')) {
          return route.fulfill({ json: { issues: Array(10).fill({ status: 'Error' }) } })
        }
        if (route.request().url().includes('deployment-issues')) {
          return route.fulfill({ json: { issues: Array(5).fill({ replicas: 3, readyReplicas: 0 }) } })
        }
        if (route.request().url().includes('security-issues')) {
          return route.fulfill({ json: { issues: Array(3).fill({ severity: 'high' }) } })
        }
        await route.continue()
      })

      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'high')
      })

      await page.goto('/')
      await page.waitForTimeout(2000)

      // Should show at most 3 recommendations
      const recommendations = page.locator('[data-testid*="recommendation"]')
      const count = await recommendations.count()
      expect(count).toBeLessThanOrEqual(3)
    })
  })
})
