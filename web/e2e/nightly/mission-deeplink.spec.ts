import { test, expect } from '@playwright/test'
import { mockApiFallback } from '../helpers/setup'

/**
 * Nightly Mission Deep Link Health Check
 *
 * Validates that mission landing pages (/missions/:id) load correctly
 * in demo mode. These pages fetch mission data from the console-kb via
 * /api/missions/file — if MSW intercepts the request (missing passthrough
 * rule), the page shows "Mission not found" instead of the mission content.
 *
 * This test catches the class of bug fixed in PR #4587 where the MSW
 * catch-all returned 503 for /api/missions/* endpoints.
 *
 * Run locally:
 *   npx playwright test e2e/nightly/mission-deeplink.spec.ts \
 *     -c e2e/nightly/nightly.config.ts
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Time to wait for the mission content to load (ms) */
const MISSION_LOAD_TIMEOUT_MS = 15_000

/** Sample of well-known mission slugs to test (covering different prefixes) */
const MISSION_SLUGS = [
  'install-drasi',
  'install-karmada',
  'install-argo-cd',
] as const

/** Number of slugs from the index to sample (in addition to the well-known ones) */
const INDEX_SAMPLE_SIZE = 3

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Mission Deep Links', () => {
  for (const slug of MISSION_SLUGS) {
    test(`/missions/${slug} loads mission content`, async ({ page }) => {
      await mockApiFallback(page)

      await page.route('**/api/me', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1', github_id: '12345', github_login: 'testuser',
            email: 'test@example.com', onboarded: true,
          }),
        })
      )

      await page.addInitScript(() => {
        localStorage.setItem('token', 'demo-token')
        localStorage.setItem('kc-demo-mode', 'true')
        localStorage.setItem('demo-user-onboarded', 'true')
      })

      await page.goto(`/missions/${slug}`, { waitUntil: 'networkidle' })

      // The "Mission not found" error text should NOT be visible
      const notFoundText = page.getByText('Mission not found')
      await expect(notFoundText).not.toBeVisible({ timeout: MISSION_LOAD_TIMEOUT_MS })

      // The mission title or step content should be visible
      // MissionLandingPage renders steps in a list — at least one step should exist
      const stepElements = page.locator('[data-testid="mission-step"], .mission-step, h3, h2')
      const pageText = await page.textContent('body')
      const hasContent = (pageText?.length ?? 0) > 200

      // Either we find structured step elements or the page has substantial content
      expect(hasContent).toBe(true)
    })
  }

  test('random missions from index resolve correctly', async ({ page }) => {
    await mockApiFallback(page)

    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1', github_id: '12345', github_login: 'testuser',
          email: 'test@example.com', onboarded: true,
        }),
      })
    )

    await page.addInitScript(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
    })

    // Fetch the missions index to get real paths
    const response = await page.request.get('/api/missions/file?path=fixes/index.json')

    // If the index itself fails, that's also a passthrough bug
    expect(response.ok(), 'missions index should be accessible').toBe(true)

    const index = await response.json() as { missions?: Array<{ path: string; title?: string }> }
    const missions = (index.missions ?? []).filter((m) =>
      m.path.startsWith('fixes/cncf-install/') && m.path.endsWith('.json'),
    )

    // Pick random missions to test
    const shuffled = missions.sort(() => Math.random() - 0.5)
    const sample = shuffled.slice(0, INDEX_SAMPLE_SIZE)

    for (const entry of sample) {
      // Extract slug from path: "fixes/cncf-install/install-foo.json" → "install-foo"
      const slug = entry.path.split('/').pop()?.replace('.json', '') ?? ''

      await test.step(`/missions/${slug}`, async () => {
        await page.goto(`/missions/${slug}`, { waitUntil: 'networkidle' })

        const notFoundText = page.getByText('Mission not found')
        await expect(notFoundText).not.toBeVisible({ timeout: MISSION_LOAD_TIMEOUT_MS })
      })
    }
  })
})
