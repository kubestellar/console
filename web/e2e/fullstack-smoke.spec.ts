import { test, expect } from '@playwright/test'

/**
 * Full-stack smoke test — kubestellar/console#6362
 *
 * Runs against the actual Go backend binary (not the Vite dev server), so
 * regressions that cross the Go<->frontend boundary (API shape drift, new
 * handlers missing from routing, build-tag issues) show up in CI.
 *
 * The existing Playwright suite in this directory hits 'npm run dev' — a
 * frontend-only smoke — so a Go-side regression wouldn't surface until
 * runtime. This test closes that specific blind spot.
 *
 * Caveats (deferred follow-up in #6362):
 *   - does not exercise kc-agent (no kubeconfig in CI)
 *   - does not exercise OAuth (GitHub OAuth flow requires real creds)
 *   - does not exercise WebSocket streams
 *
 * Driven from .github/workflows/fullstack-e2e.yml, which spins up the Go
 * binary with minimal env and points PLAYWRIGHT_BASE_URL at port 8080.
 */

// The Go backend serves both API and built frontend on port 8080 when
// startup-oauth.sh mode is active. The workflow sets PLAYWRIGHT_BASE_URL.
const FULLSTACK_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080'

// Skip when the suite is running against the default Vite dev server (5174).
// This test is ONLY meaningful when pointed at the Go binary.
test.skip(
  () => !process.env.FULLSTACK_SMOKE,
  'fullstack-smoke only runs in the dedicated fullstack-e2e workflow',
)

test.describe('full-stack smoke (#6362)', () => {
  test('/healthz returns ok', async ({ request }) => {
    const res = await request.get(`${FULLSTACK_BASE}/healthz`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Contract: pkg/api/server.go /healthz handler returns exactly
    // { status: "ok" } during normal operation and { status: "shutting_down" }
    // while draining. There is no "starting" state — the handler is
    // registered synchronously before the listener comes up.
    expect(['ok', 'shutting_down']).toContain(body.status)
  })

  test('root path serves the built frontend shell', async ({ page }) => {
    const res = await page.goto(`${FULLSTACK_BASE}/`)
    expect(res?.ok()).toBeTruthy()
    // The built frontend mounts into #root; if the Go binary is serving the
    // wrong assets we'll see a blank response or an API error body instead.
    await expect(page.locator('#root')).toBeAttached({ timeout: 15_000 })
  })

  test('/api endpoint round-trips without auth', async ({ request }) => {
    // /api/version is public and always present (pkg/api/server.go) — it's
    // the smallest round-trip that proves Go routing + handler wiring
    // without needing a live cluster or OAuth.
    const res = await request.get(`${FULLSTACK_BASE}/api/version`)
    // /api/version is registered before the auth middleware in
    // pkg/api/server.go, so it is unconditionally public. A 401 here
    // would mean the route order regressed; a 404 would mean the route
    // was dropped from Go routing. Only 200 is acceptable.
    expect(res.status()).toBe(200)
  })
})
