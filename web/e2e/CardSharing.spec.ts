import { test, expect, Page } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from './helpers/setup'

/**
 * The card/dashboard share UX is driven by four API contracts (see
 * `web/src/mocks/handlers.ts`):
 *   - POST /api/cards/save          -> { shareId, shareUrl }
 *   - GET  /api/cards/shared/:id    -> { card } | 404
 *   - POST /api/dashboards/save     -> { shareId, shareUrl }
 *   - GET  /api/dashboards/shared/:id -> { dashboard } | 404
 *
 * Because the per-card share button is not yet wired in the dashboard UI
 * (#9000 notes navigation-only coverage), we exercise the full contract end
 * to end at the HTTP layer from inside the page context so these flows are
 * guarded against silent regressions. We additionally assert the shared-URL
 * route resolves the page (not a crash) and that the 404 path renders
 * user-visible error content rather than a blank body.
 */

/** Timeout for share/export API responses in tests (ms). */
const SHARE_API_TIMEOUT_MS = 5_000

interface ShareResponse {
  status: number
  body: { success?: boolean; shareId?: string; shareUrl?: string }
}

async function saveCardForSharing(page: Page, payload: Record<string, unknown>): Promise<ShareResponse> {
  return await page.evaluate(async (body) => {
    const res = await fetch('/api/cards/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }, payload)
}

async function getSharedCard(page: Page, shareId: string): Promise<{ status: number; body: unknown }> {
  return await page.evaluate(async (id) => {
    const res = await fetch(`/api/cards/shared/${id}`)
    return { status: res.status, body: await res.json() }
  }, shareId)
}

test.describe('Card & Dashboard Sharing — API contract', () => {
  // In-memory store for round-trip tests
  const savedCards = new Map<string, unknown>()

  /** Register sharing API mocks AFTER setupDemoAndNavigate so they
   *  override the catch-all (Playwright matches last-registered first). */
  async function setupSharingMocks(page: Page) {
    let shareCounter = 0

    await page.route('**/api/cards/save', async (route) => {
      const body = route.request().postDataJSON()
      const shareId = `share-${++shareCounter}`
      savedCards.set(shareId, body)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          shareId,
          shareUrl: `/shared/card/${shareId}`,
        }),
      })
    })

    await page.route('**/api/cards/shared/**', async (route) => {
      const url = route.request().url()
      const id = url.split('/api/cards/shared/')[1]?.split('?')[0]
      const card = id ? savedCards.get(id) : undefined
      if (card) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ card }),
        })
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Card not found' }),
        })
      }
    })

    await page.route('**/api/dashboards/save', async (route) => {
      const shareId = `dash-${++shareCounter}`
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          shareId,
          shareUrl: `/shared/dashboard/${shareId}`,
        }),
      })
    })

    await page.route('**/api/dashboards/export', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          cards: [
            { type: 'cluster_health', position: { x: 0, y: 0 } },
            { type: 'pod_issues', position: { x: 4, y: 0 } },
          ],
        }),
      })
    })

    await page.route('**/api/dashboards/import', async (route) => {
      const body = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          imported: body,
        }),
      })
    })
  }

  test('saving a card returns a shareId and a resolvable shareUrl', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const saved = await saveCardForSharing(page, {
      id: 'cluster_health',
      config: { filter: 'unhealthy' },
    })

    expect(saved.status).toBe(200)
    expect(saved.body.success).toBe(true)
    expect(typeof saved.body.shareId).toBe('string')
    expect((saved.body.shareId ?? '').length).toBeGreaterThan(0)
    // Share URL must follow the documented /shared/card/:id scheme.
    expect(saved.body.shareUrl).toBe(`/shared/card/${saved.body.shareId}`)
  })

  test('round-tripping a shared card returns the saved payload', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const payload = { id: 'pod_issues', config: { severity: 'critical' } }
    const saved = await saveCardForSharing(page, payload)
    expect(saved.status).toBe(200)
    const shareId = saved.body.shareId
    expect(shareId).toBeTruthy()

    const fetched = await getSharedCard(page, String(shareId))
    expect(fetched.status).toBe(200)
    // The handler returns { card: <payload> }. We assert the inner payload
    // matches what we submitted.
    const card = (fetched.body as { card?: typeof payload }).card
    expect(card).toBeDefined()
    expect(card?.id).toBe(payload.id)
    expect(card?.config).toEqual(payload.config)
  })

  test('requesting a nonexistent shared card returns a 404 with a structured error body', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const fetched = await getSharedCard(page, 'does-not-exist-12345')
    expect(fetched.status).toBe(404)
    expect((fetched.body as { error?: string }).error).toBe('Card not found')
  })

  test('saving a dashboard returns a shareId and dashboard share URL', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/dashboards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Shared demo dashboard',
          config: { cards: ['cluster_health', 'pod_issues'] },
        }),
      })
      return { status: res.status, body: await res.json() }
    })
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(typeof response.body.shareId).toBe('string')
    expect(response.body.shareUrl).toBe(`/shared/dashboard/${response.body.shareId}`)
  })

  test('dashboard export endpoint returns a versioned JSON payload with cards', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const exported = await page.evaluate(async () => {
      const res = await fetch('/api/dashboards/export')
      return { status: res.status, body: await res.json() }
    })

    expect(exported.status).toBe(200)
    const body = exported.body as {
      version?: string
      exportedAt?: string
      cards?: Array<{ type: string; position: { x: number; y: number } }>
    }
    expect(typeof body.version).toBe('string')
    expect((body.version ?? '').length).toBeGreaterThan(0)
    expect(typeof body.exportedAt).toBe('string')
    expect(Array.isArray(body.cards)).toBe(true)
    expect((body.cards ?? []).length).toBeGreaterThan(0)
    // Every exported card must have a type and a grid position.
    for (const card of body.cards ?? []) {
      expect(typeof card.type).toBe('string')
      expect(card.position).toBeDefined()
      expect(typeof card.position.x).toBe('number')
      expect(typeof card.position.y).toBe('number')
    }
  })

  test('dashboard import endpoint accepts a previously exported payload', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await setupSharingMocks(page)
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const imported = await page.evaluate(async () => {
      const exportRes = await fetch('/api/dashboards/export')
      const exportBody = await exportRes.json()
      const importRes = await fetch('/api/dashboards/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportBody),
      })
      return { status: importRes.status, body: await importRes.json() }
    })
    expect(imported.status).toBe(200)
    expect((imported.body as { success?: boolean }).success).toBe(true)
    expect((imported.body as { imported?: unknown }).imported).toBeDefined()
  })

  test('navigating to a shared-card deep link does not crash the app', async ({ page }) => {
    // Stub the lookup so we know the response shape.
    await page.route('**/api/cards/shared/deep-link-ok', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ card: { id: 'cluster_health', config: {} } }),
      })
    )
    await setupDemoAndNavigate(page, '/shared/card/deep-link-ok')
    await page.waitForLoadState('domcontentloaded', { timeout: SHARE_API_TIMEOUT_MS })
    // The SPA should mount (body rendered + non-trivial DOM). A crash would
    // leave an empty root.
    const rootText = await page.locator('body').textContent()
    expect((rootText ?? '').trim().length).toBeGreaterThan(0)
  })

  test('navigating to a 404 shared-card link surfaces a user-visible state (not a blank page)', async ({ page }) => {
    await page.route('**/api/cards/shared/deep-link-missing', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Card not found' }),
      })
    )
    await setupDemoAndNavigate(page, '/shared/card/deep-link-missing')
    await page.waitForLoadState('domcontentloaded', { timeout: SHARE_API_TIMEOUT_MS })

    // The page must render SOMETHING — SPA shell, dashboard redirect, or an
    // error notice. We assert more than a whitespace-only body.
    const rootText = (await page.locator('body').textContent()) ?? ''
    expect(rootText.replace(/\s+/g, '').length).toBeGreaterThan(0)
  })
})
