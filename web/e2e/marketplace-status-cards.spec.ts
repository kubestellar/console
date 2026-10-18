import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Marketplace status cards E2E — buildpacks_status, coredns_status,
 * openkruise_status, openyurt_status.
 *
 * kubeflow_status and notary_status are not registered in this repo's card
 * registry (they ship from kubestellar/console-marketplace), so they cannot be
 * rendered here.
 *
 * Covers: card renders, loading state, data/demo-fallback state, error state.
 *
 * Closes #24433
 *
 * Run with: npx playwright test e2e/marketplace-status-cards.spec.ts
 */

const CLUSTER_ADMIN_STORAGE_KEY = 'kubestellar-cluster-admin-cards'
const CARD_VISIBLE_TIMEOUT_MS = 15000
const LOADING_DELAY_MS = 3000

const CARD_TYPES = [
  'buildpacks_status',
  'coredns_status',
  'openkruise_status',
  'openyurt_status',
] as const

const CARDS_UNDER_TEST = CARD_TYPES.map((cardType, i) => ({
  id: `test-${cardType}-1`,
  card_type: cardType,
  // config is required: loadDashboardCardsFromStorage rejects entries without
  // a plain-object config and silently falls back to the default card set.
  config: {},
  position: { w: 6, h: 3, x: (i % 2) * 6, y: Math.floor(i / 2) * 3 },
}))

const MOCK_CLUSTERS = [
  { name: 'prod-east', context: 'ctx-1', healthy: true, reachable: true, nodeCount: 5, podCount: 45 },
]

type Mode = 'data' | 'loading' | 'error'

async function setupCards(page: Page, mode: Mode) {
  await mockApiFallback(page)

  await page.route('**/api/me', route =>
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

  const handler = async (route: import('@playwright/test').Route) => {
    if (mode === 'loading') {
      await new Promise(resolve => setTimeout(resolve, LOADING_DELAY_MS))
    }
    if (mode === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
      return
    }
    const clusters = mode === 'data' ? MOCK_CLUSTERS : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters, issues: [], events: [], nodes: [], pods: [] }),
    })
  }
  await page.route('**/api/mcp/**', handler)
  await page.route('http://127.0.0.1:8585/**', handler)

  await page.addInitScript(
    ({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
      localStorage.setItem(storageKey, JSON.stringify(cards))
    },
    { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST }
  )

  await page.goto('/cluster-admin')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Marketplace status cards', () => {
  test.describe('Rendering with data', () => {
    test.beforeEach(async ({ page }) => {
      await setupCards(page, 'data')
    })

    for (const cardType of CARD_TYPES) {
      test(`${cardType} renders with content`, async ({ page }) => {
        const card = page.locator(`[data-card-type="${cardType}"]`)
        await expect(card).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })
        // Rendered state shows real text (data or demo fallback), not a blank shell
        await expect.poll(async () => ((await card.textContent()) ?? '').trim().length, {
          timeout: CARD_VISIBLE_TIMEOUT_MS,
        }).toBeGreaterThan(0)
      })
    }

    test('all four cards coexist on the same dashboard', async ({ page }) => {
      for (const cardType of CARD_TYPES) {
        await expect(page.locator(`[data-card-type="${cardType}"]`)).toBeVisible({
          timeout: CARD_VISIBLE_TIMEOUT_MS,
        })
      }
    })
  })

  test.describe('Loading state', () => {
    test('cards mount while API responses are delayed, then settle', async ({ page }) => {
      await setupCards(page, 'loading')
      for (const cardType of CARD_TYPES) {
        const card = page.locator(`[data-card-type="${cardType}"]`)
        await expect(card).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })
      }
      // After the delay elapses the cards must still be present with content
      for (const cardType of CARD_TYPES) {
        const card = page.locator(`[data-card-type="${cardType}"]`)
        await expect.poll(async () => ((await card.textContent()) ?? '').trim().length, {
          timeout: CARD_VISIBLE_TIMEOUT_MS + LOADING_DELAY_MS,
        }).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Error state', () => {
    test('cards stay rendered (empty/fallback) when the API returns 500', async ({ page }) => {
      await setupCards(page, 'error')
      for (const cardType of CARD_TYPES) {
        const card = page.locator(`[data-card-type="${cardType}"]`)
        await expect(card).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })
        await expect.poll(async () => ((await card.textContent()) ?? '').trim().length, {
          timeout: CARD_VISIBLE_TIMEOUT_MS,
        }).toBeGreaterThan(0)
      }
    })
  })
})
