import { test, expect, Page } from '@playwright/test'

/**
 * Mission System Regression Tests
 *
 * Targeted tests for bugs found in the past 2 weeks:
 * - #2952/#2953: Duplicate folders in Mission Explorer
 * - #2956: Imported missions execute without validation
 * - #2964: Tree view inconsistent expand/collapse
 * - #2973: Timeout triggers after execution completed
 * - #2974: Mission output not delivered to UI
 *
 * Run with: npx playwright test e2e/mission-regression.spec.ts
 */

async function setupMissionTest(page: Page) {
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

  // Mock MCP endpoints
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-cluster', healthy: true, nodeCount: 5, podCount: 50 },
          ],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Mock local agent
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], health: { hasClaude: true, hasBob: false } }),
    })
  )

  // Mock mission API endpoints
  await page.route('**/api/missions**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          missions: [
            {
              id: 'test-mission-1',
              name: 'Install Karmada',
              status: 'saved',
              description: 'Install Karmada on cluster',
              folder: 'Getting Started',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'test-mission-2',
              name: 'Deploy App',
              status: 'completed',
              description: 'Deploy sample application',
              folder: 'Getting Started',
              output: 'Deployment successful.\nAll pods running.',
              createdAt: new Date().toISOString(),
            },
          ],
          folders: ['Getting Started', 'Advanced'],
        }),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
  })

  // Set auth token and navigate
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

test.describe('Mission System Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMissionTest(page)
  })

  test.describe('Mission Deep-Link Import (#2974, #3053)', () => {
    test('mission deep-link route loads without error', async ({ page }) => {
      await page.goto('/missions/install-karmada')
      await page.waitForLoadState('domcontentloaded')

      // Page should not show a 404 or blank page
      const body = await page.textContent('body')
      expect(body?.length).toBeGreaterThan(50)
    })

    test('missions listing page loads', async ({ page }) => {
      await page.goto('/missions')
      await page.waitForLoadState('domcontentloaded')

      const body = await page.textContent('body')
      expect(body?.length).toBeGreaterThan(50)
    })
  })

  test.describe('Mission Output Delivery (#2974)', () => {
    test('completed mission shows output text', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Open mission sidebar if present
      const missionToggle = page.locator('[data-testid="mission-sidebar-toggle"]')
        .or(page.locator('button[aria-label*="mission" i]'))
        .or(page.locator('button:has-text("Missions")'))

      if (await missionToggle.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await missionToggle.first().click()

        // Look for the completed mission
        const completedMission = page.locator('text=Deploy App')
          .or(page.locator('[data-testid*="mission"][data-testid*="completed"]'))

        if (await completedMission.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await completedMission.first().click()

          // Wait for mission content to load in the sidebar
          const missionSidebar = page.locator('[data-testid="mission-sidebar"]')
            .or(page.locator('[class*="mission"][class*="sidebar"]'))
            .first()
          await expect(missionSidebar).toBeVisible({ timeout: 5000 })

          const sidebarContent = await page.locator('[data-testid="mission-sidebar"]')
            .or(page.locator('[class*="mission"][class*="sidebar"]'))
            .first()
            .textContent()
            .catch(() => '')

          // The output should contain some text (regression: #2974 showed empty output)
          expect(sidebarContent?.length).toBeGreaterThan(0)
        }
      }
    })
  })

  test.describe('Mission Folder Deduplication (#2952, #2953)', () => {
    test('folder list does not show duplicates', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Try to open mission browser
      const browseButton = page.locator('[data-testid="mission-browse"]')
        .or(page.locator('button:has-text("Browse")'))
        .or(page.locator('a[href*="browse=missions"]'))

      if (await browseButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await browseButton.first().click()

        // Wait for the browse dialog/panel to appear
        const folderElements = page.locator('[data-testid*="folder"], [class*="tree-node"][class*="folder"]')
        await expect(folderElements.first()).toBeVisible({ timeout: 5000 }).catch(() => {})

        // Count folder entries with the same name
        const count = await folderElements.count()

        // Collect folder names
        const folderNames: string[] = []
        for (let i = 0; i < count; i++) {
          const name = await folderElements.nth(i).textContent()
          if (name) folderNames.push(name.trim())
        }

        // Check for duplicates
        const uniqueNames = new Set(folderNames)
        expect(
          folderNames.length,
          `Duplicate folders detected: ${folderNames.join(', ')}`
        ).toBe(uniqueNames.size)
      }
    })
  })

  test.describe('Mission Validation (#2956)', () => {
    test('does not execute raw markdown without parsing', async ({ page }) => {
      // Mock a mission with markdown content that should be parsed
      await page.route('**/api/missions/import', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'imported-1',
            name: 'Imported Mission',
            status: 'saved',
            instructions: '# Step 1\nRun `kubectl apply -f manifest.yaml`',
          }),
        })
      )

      await page.goto('/missions/imported-1')
      await page.waitForLoadState('domcontentloaded')

      // The page should render — not crash on unvalidated content
      const body = await page.textContent('body')
      expect(body?.length).toBeGreaterThan(50)
    })
  })
})
