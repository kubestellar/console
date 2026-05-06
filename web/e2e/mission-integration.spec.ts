import { test, expect } from '@playwright/test'

/**
 * Mission integration tests — kubestellar/console#10683
 *
 * Validates real mission API endpoints against the running Go backend.
 * Unlike web/e2e/Missions.spec.ts (which mocks all backend interactions),
 * these tests hit the actual /api/missions/* routes to verify handler wiring,
 * response shapes, and end-to-end data flow.
 *
 * Run locally:
 *   npm run test:e2e:fullstack          (builds + starts backend automatically)
 *   # or manually:
 *   FULLSTACK_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:8080 \
 *     npx playwright test e2e/mission-integration.spec.ts --project=chromium
 */

// ── Named constants (no magic numbers per CLAUDE.md) ────────────────────────
const API_REQUEST_TIMEOUT_MS = 15_000
const EXPECTED_HTTP_OK = 200
const EXPECTED_HTTP_UNPROCESSABLE_ENTITY = 422
const EXPECTED_HTTP_BAD_GATEWAY = 502

const FULLSTACK_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080'

// Only run against the real Go backend — skip in default Vite dev server mode.
test.skip(
  () => !process.env.FULLSTACK_SMOKE,
  'Set FULLSTACK_SMOKE=1 or use npm run test:e2e:fullstack (see scripts/run-fullstack-e2e.sh)',
)

test.describe('mission integration (real backend)', () => {
  test('GET /api/missions/browse returns mission catalog', async ({ request }) => {
    const res = await request.get(`${FULLSTACK_BASE}/api/missions/browse`, {
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    // The route must exist and be wired. GitHub API may return data or an
    // error, but a 404 means the route itself is missing from Go routing.
    expect(res.status()).not.toBe(404)

    if (res.status() === EXPECTED_HTTP_OK) {
      const body = await res.json()
      // The browse endpoint returns an array of mission entries
      expect(Array.isArray(body)).toBe(true)
    }
  })

  test('GET /api/missions/scores returns KB scores', async ({ request }) => {
    const res = await request.get(`${FULLSTACK_BASE}/api/missions/scores`, {
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    expect(res.status()).not.toBe(404)

    if (res.status() === EXPECTED_HTTP_OK) {
      const body = await res.json()
      // Scores endpoint returns an object (map of project scores)
      expect(typeof body).toBe('object')
      expect(body).not.toBeNull()
    }
  })

  test('POST /api/missions/validate accepts or rejects a payload', async ({ request }) => {
    const minimalPayload = {
      mission: {
        apiVersion: 'kc-mission-v1',
        kind: 'Mission',
        metadata: { name: 'test-mission' },
        spec: { description: 'A test mission' },
      },
      path: 'fixes/demo/install.json',
    }

    const res = await request.post(`${FULLSTACK_BASE}/api/missions/validate`, {
      data: minimalPayload,
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    // The validate endpoint should return 200 (valid), 422 (index lookup or
    // nightly quality rejection), or 502 if the KB index cannot be fetched.
    // A 404 means the route is missing; 401/403 means auth middleware is
    // blocking a route that should be reachable in this test config.
    const acceptableStatuses = [
      EXPECTED_HTTP_OK,
      EXPECTED_HTTP_UNPROCESSABLE_ENTITY,
      EXPECTED_HTTP_BAD_GATEWAY,
    ]
    expect(acceptableStatuses).toContain(res.status())
  })

  test('GET /api/health returns health with oauth_configured field', async ({ request }) => {
    const res = await request.get(`${FULLSTACK_BASE}/api/health`, {
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    expect(res.status()).toBe(EXPECTED_HTTP_OK)

    const body = await res.json()
    expect(body).toHaveProperty('oauth_configured')
  })

  test('GET /api/version is accessible', async ({ request }) => {
    const res = await request.get(`${FULLSTACK_BASE}/api/version`, {
      timeout: API_REQUEST_TIMEOUT_MS,
    })
    expect(res.status()).toBe(EXPECTED_HTTP_OK)
  })
})
