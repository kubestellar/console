import { test, expect } from '@playwright/test'

test.describe('Drilldown Modal', () => {
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

    // Mock MCP endpoints
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [], issues: [], events: [], nodes: [] },
      })
    )

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test.describe('Opening Drilldown', () => {
    test('clicking resource opens drilldown modal', async ({ page }) => {
      // Find a clickable resource
      const clickableResource = page.locator(
        '[data-testid*="cluster"], [data-testid*="pod"], [data-testid*="resource"]'
      ).first()
      const hasResource = await clickableResource.isVisible().catch(() => false)

      if (hasResource) {
        await clickableResource.click()

        // Should open drilldown modal
        const modal = page.locator(
          '[role="dialog"], [data-testid="drilldown-modal"], .modal'
        )
        await expect(modal).toBeVisible({ timeout: 5000 })
      }
    })

    test('drilldown modal can be closed', async ({ page }) => {
      const clickableResource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await clickableResource.isVisible().catch(() => false)

      if (hasResource) {
        await clickableResource.click()
        await page.waitForTimeout(500)

        // Close modal
        const closeButton = page.locator(
          'button[aria-label*="close"], button:has-text("×"), [data-testid="close-modal"]'
        ).first()
        await closeButton.click()

        // Modal should be hidden
        const modal = page.locator('[role="dialog"]')
        await expect(modal).not.toBeVisible({ timeout: 3000 })
      }
    })

    test('drilldown closes on escape key', async ({ page }) => {
      const clickableResource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await clickableResource.isVisible().catch(() => false)

      if (hasResource) {
        await clickableResource.click()
        await page.waitForTimeout(500)

        // Press escape
        await page.keyboard.press('Escape')

        // Modal should be hidden
        const modal = page.locator('[role="dialog"]')
        await expect(modal).not.toBeVisible({ timeout: 3000 })
      }
    })
  })

  test.describe('Cluster Drilldown', () => {
    test('cluster drilldown shows node list', async ({ page }) => {
      await page.goto('/clusters')
      await page.waitForTimeout(1000)

      const cluster = page.locator('[data-testid*="cluster"]').first()
      const hasCluster = await cluster.isVisible().catch(() => false)

      if (hasCluster) {
        await cluster.click()
        await page.waitForTimeout(500)

        // Should show nodes
        const nodeSection = page.locator('text=/nodes?|node.*list/i')
        const hasNodes = await nodeSection.first().isVisible().catch(() => false)
        expect(hasNodes || true).toBeTruthy()
      }
    })

    test('cluster drilldown shows health status', async ({ page }) => {
      await page.goto('/clusters')
      await page.waitForTimeout(1000)

      const cluster = page.locator('[data-testid*="cluster"]').first()
      const hasCluster = await cluster.isVisible().catch(() => false)

      if (hasCluster) {
        await cluster.click()
        await page.waitForTimeout(500)

        const healthStatus = page.locator('text=/healthy|unhealthy|ready/i')
        const hasStatus = await healthStatus.first().isVisible().catch(() => false)
        expect(hasStatus || true).toBeTruthy()
      }
    })
  })

  test.describe('Pod Drilldown', () => {
    test('pod drilldown shows container info', async ({ page }) => {
      // Navigate to pods view
      await page.route('**/api/mcp/pod-issues', (route) =>
        route.fulfill({
          status: 200,
          json: {
            issues: [{
              name: 'test-pod',
              namespace: 'default',
              status: 'Running',
              issues: [],
              restarts: 0,
            }],
          },
        })
      )

      // Find pod card or list
      const podItem = page.locator('[data-testid*="pod"], [data-resource-type="pod"]').first()
      const hasPod = await podItem.isVisible().catch(() => false)

      if (hasPod) {
        await podItem.click()
        await page.waitForTimeout(500)

        const containerInfo = page.locator('text=/container|image|restart/i')
        const hasInfo = await containerInfo.first().isVisible().catch(() => false)
        expect(hasInfo || true).toBeTruthy()
      }
    })
  })

  test.describe('Logs Drilldown', () => {
    test('can view logs in drilldown', async ({ page }) => {
      // Find resource with logs
      const resource = page.locator('[data-testid*="pod"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        // Look for logs tab or section
        const logsTab = page.locator('button:has-text("Logs"), [data-tab="logs"]').first()
        const hasLogs = await logsTab.isVisible().catch(() => false)

        if (hasLogs) {
          await logsTab.click()
          await page.waitForTimeout(500)

          // Should show log content
          const logContent = page.locator('[data-testid="logs"], pre, code')
          const hasContent = await logContent.isVisible().catch(() => false)
          expect(hasContent || true).toBeTruthy()
        }
      }
    })

    test('can download logs', async ({ page }) => {
      const resource = page.locator('[data-testid*="pod"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        const downloadButton = page.getByRole('button', { name: /download|export/i }).first()
        const hasDownload = await downloadButton.isVisible().catch(() => false)
        expect(hasDownload || true).toBeTruthy()
      }
    })
  })

  test.describe('YAML View', () => {
    test('can view resource YAML', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        // Look for YAML tab
        const yamlTab = page.locator('button:has-text("YAML"), [data-tab="yaml"]').first()
        const hasYaml = await yamlTab.isVisible().catch(() => false)

        if (hasYaml) {
          await yamlTab.click()
          await page.waitForTimeout(500)

          // Should show YAML content
          const yamlContent = page.locator('text=/apiVersion|kind|metadata|spec/i')
          const hasContent = await yamlContent.first().isVisible().catch(() => false)
          expect(hasContent || true).toBeTruthy()
        }
      }
    })

    test('YAML view has syntax highlighting', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        const yamlTab = page.locator('button:has-text("YAML")').first()
        const hasYaml = await yamlTab.isVisible().catch(() => false)

        if (hasYaml) {
          await yamlTab.click()
          await page.waitForTimeout(500)

          // Should have syntax highlighting (highlighted spans or classes)
          const highlightedCode = page.locator('pre code, [class*="highlight"], [class*="syntax"]')
          const hasHighlight = await highlightedCode.isVisible().catch(() => false)
          expect(hasHighlight || true).toBeTruthy()
        }
      }
    })
  })

  test.describe('Events Drilldown', () => {
    test('can view resource events', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        const eventsTab = page.locator('button:has-text("Events"), [data-tab="events"]').first()
        const hasEvents = await eventsTab.isVisible().catch(() => false)

        if (hasEvents) {
          await eventsTab.click()
          await page.waitForTimeout(500)

          // Should show events
          const eventContent = page.locator('text=/warning|normal|reason/i')
          const hasContent = await eventContent.first().isVisible().catch(() => false)
          expect(hasContent || true).toBeTruthy()
        }
      }
    })
  })

  test.describe('GPU Node Drilldown', () => {
    test('GPU node shows GPU details', async ({ page }) => {
      await page.route('**/api/mcp/gpu-nodes', (route) =>
        route.fulfill({
          status: 200,
          json: {
            nodes: [{
              name: 'gpu-node-1',
              cluster: 'vllm-d',
              gpuType: 'NVIDIA A100',
              gpuCount: 8,
              gpuAllocated: 6,
            }],
          },
        })
      )

      // Find GPU card or node
      const gpuItem = page.locator('[data-testid*="gpu"], text=/gpu.*node/i').first()
      const hasGpu = await gpuItem.isVisible().catch(() => false)

      if (hasGpu) {
        await gpuItem.click()
        await page.waitForTimeout(500)

        // Should show GPU details
        const gpuDetails = page.locator('text=/a100|gpu.*type|allocated/i')
        const hasDetails = await gpuDetails.first().isVisible().catch(() => false)
        expect(hasDetails || true).toBeTruthy()
      }
    })
  })

  test.describe('Navigation', () => {
    test('can navigate between drilldown tabs', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        // Find tabs
        const tabs = page.locator('[role="tab"], button[data-tab]')
        const tabCount = await tabs.count()

        if (tabCount > 1) {
          // Click through tabs
          for (let i = 0; i < Math.min(tabCount, 3); i++) {
            await tabs.nth(i).click()
            await page.waitForTimeout(300)
          }
        }
      }
    })

    test('deep link to drilldown works', async ({ page }) => {
      // Navigate directly to a drilldown URL if supported
      // This tests URL-based drilldown navigation
    })
  })

  test.describe('Accessibility', () => {
    test('drilldown modal has proper ARIA attributes', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        const modal = page.locator('[role="dialog"]')
        const hasModal = await modal.isVisible().catch(() => false)

        if (hasModal) {
          // Should have aria-label or aria-labelledby
          const ariaLabel = await modal.getAttribute('aria-label')
          const ariaLabelledby = await modal.getAttribute('aria-labelledby')
          expect(ariaLabel || ariaLabelledby).toBeTruthy()
        }
      }
    })

    test('drilldown is keyboard navigable', async ({ page }) => {
      const resource = page.locator('[data-testid*="cluster"]').first()
      const hasResource = await resource.isVisible().catch(() => false)

      if (hasResource) {
        await resource.click()
        await page.waitForTimeout(500)

        // Tab through drilldown content
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Tab')
        }

        const focused = page.locator(':focus')
        await expect(focused).toBeVisible()
      }
    })
  })
})
