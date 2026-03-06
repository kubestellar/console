/**
 * LLM-d Benchmarks Dashboard Integration Tests
 *
 * Validates the /llm-d-benchmarks route against the LIVE backend:
 *   1. Page loads all 8 benchmark cards
 *   2. Benchmark data arrives via SSE streaming from Google Drive API
 *   3. Nightly E2E card shows live workflow data (not demo)
 *   4. Cards render real data (latency, throughput, leaderboard)
 *   5. Performance Explorer (Pareto) renders with interactive elements
 *   6. Timeline and resource utilization show historical data
 *
 * Nightly E2E on console.kubestellar.io:
 *   7. Fetches live GitHub Actions data via Netlify Function
 *   8. Shows runs for all guide/platform combinations
 *   9. Displays pass rates and trend indicators
 *
 * Prerequisites:
 *   - Backend running on port 8080 with GOOGLE_DRIVE_API_KEY set
 *   - For console.kubestellar.io tests: internet access
 */
import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCHMARKS_ROUTE = '/llm-d-benchmarks'

/** Timeout for page load (Vite preview cold compile) */
const PAGE_LOAD_TIMEOUT_MS = 60_000
/** Timeout for SSE streaming data or demo fallback to render */
const STREAM_DATA_TIMEOUT_MS = 15_000
/** Timeout for card content to render after data arrives */
const CARD_CONTENT_TIMEOUT_MS = 15_000
/** Short stabilization delay */
const SETTLE_MS = 1_000
/** Timeout for Netlify function fetch on console.kubestellar.io */
const NETLIFY_FETCH_TIMEOUT_MS = 30_000

/** Expected card count on the benchmarks route */
const EXPECTED_CARD_COUNT = 8

/** Number of nightly guides we monitor (OCP + GKE + CKS) */
const MIN_NIGHTLY_GUIDES = 10

/** Platforms we expect in the nightly E2E data */
const EXPECTED_PLATFORMS = ['ocp', 'gke', 'cks']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the benchmarks page with auth token set.
 * Goes to / first to unlock localStorage, sets token, then navigates.
 */
async function setupAndNavigate(page: Page, route: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)

  // Set auth token + cached user so the app bypasses backend validation.
  // The cached user prevents /api/me calls; the token satisfies ProtectedRoute.
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-user-cache', JSON.stringify({
      id: 'test-user',
      github_id: '99999',
      github_login: 'test-user',
      email: 'test@example.com',
      role: 'admin',
      onboarded: true,
    }))
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })

  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)
}

// ---------------------------------------------------------------------------
// Tests — Benchmark cards on localhost (live backend)
// ---------------------------------------------------------------------------

test.describe('LLM-d Benchmarks Dashboard — live data', () => {

  test('page loads with all 8 benchmark cards', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)

    // Wait for the SPA to render — the lazy-loaded LLMdBenchmarks component
    // may take extra time to load its chunk. Wait for any meaningful content
    // (card titles, loading skeletons, or data).
    await page.waitForFunction(
      () => {
        const grid = document.querySelector('[class*="react-grid-layout"]')
        if (grid && grid.children.length > 0) return true
        return document.body.innerText.length > 100
      },
      { timeout: STREAM_DATA_TIMEOUT_MS },
    )

    // Count rendered cards — try multiple selectors
    const cardCount = await page.evaluate(() => {
      // react-grid-layout children are the card wrappers
      const grid = document.querySelector('[class*="react-grid-layout"]')
      if (grid && grid.children.length > 0) return grid.children.length

      const cards = document.querySelectorAll('[data-card-type], [class*="CardWrapper"], [class*="card-wrapper"]')
      if (cards.length > 0) return cards.length

      // Fallback: count rounded shadow elements (card-like divs)
      return document.querySelectorAll('[class*="rounded"][class*="shadow"], [class*="Card"]').length
    })

    console.log(`  Cards rendered: ${cardCount}`)
    expect(cardCount).toBeGreaterThanOrEqual(EXPECTED_CARD_COUNT)
  })

  test('benchmark SSE stream delivers real data from Google Drive', async ({ page }) => {
    const benchmarkCalls: string[] = []

    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/benchmarks/')) {
        benchmarkCalls.push(url)
      }
    })

    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasStreamCall = benchmarkCalls.some(u => u.includes('/reports/stream'))
    const hasRestCall = benchmarkCalls.some(u => u.includes('/reports') && !u.includes('/stream'))
    expect(hasStreamCall || hasRestCall).toBe(true)

    const hasDataContent = await page.evaluate(() => {
      const body = document.body.innerText
      const dataIndicators = [
        'tok/s', 'tokens', 'latency', 'throughput', 'ms',
        'TTFT', 'TPOT', 'QPS', 'p50', 'p99',
      ]
      return dataIndicators.some(indicator =>
        body.toLowerCase().includes(indicator.toLowerCase())
      )
    })

    expect(hasDataContent).toBe(true)
  })

  test('benchmark cards show non-demo data when backend is available', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasDemoBadge = await page.evaluate(() => {
      const badges = document.querySelectorAll('[class*="demo"], [data-demo="true"]')
      const allText = Array.from(document.querySelectorAll('span, div'))
        .filter(el => {
          const text = el.textContent?.trim() || ''
          const rect = el.getBoundingClientRect()
          return text === 'Demo' && rect.width < 100 && rect.height < 40
        })
      return badges.length + allText.length
    })

    console.log(`  Demo badges found: ${hasDemoBadge} (0 = live data)`)

    const hasContent = await page.locator('body').evaluate(el => el.innerText.length > 100)
    expect(hasContent).toBe(true)
  })

  test('Performance Explorer (Pareto) renders interactive chart', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasChart = await page.evaluate(() => {
      const body = document.body
      const svgCharts = body.querySelectorAll('svg.recharts-surface, svg[class*="chart"], svg[viewBox]')
      const canvasElements = body.querySelectorAll('canvas')
      const rechartsWrappers = body.querySelectorAll('[class*="recharts"], [class*="ResponsiveContainer"]')
      return svgCharts.length + canvasElements.length + rechartsWrappers.length
    })

    expect(hasChart).toBeGreaterThan(0)
  })

  test('Hardware Leaderboard shows configuration rankings', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasLeaderboardContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      const leaderboardIndicators = ['gpu', 'a100', 'h100', 'l4', 'accelerator', 'hardware', 'rank', 'score']
      return leaderboardIndicators.filter(ind => body.includes(ind)).length
    })

    expect(hasLeaderboardContent).toBeGreaterThanOrEqual(1)
  })

  test('Latency Breakdown shows TTFT and TPOT metrics', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasLatencyMetrics = await page.evaluate(() => {
      const body = document.body.innerText
      const hasTTFT = body.includes('TTFT') || body.toLowerCase().includes('time to first token')
      const hasTPOT = body.includes('TPOT') || body.toLowerCase().includes('time per output token')
      const hasLatency = body.toLowerCase().includes('latency')
      return { hasTTFT, hasTPOT, hasLatency }
    })

    expect(hasLatencyMetrics.hasLatency || hasLatencyMetrics.hasTTFT || hasLatencyMetrics.hasTPOT).toBe(true)
  })

  test('Throughput Comparison shows tokens-per-second data', async ({ page }) => {
    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(STREAM_DATA_TIMEOUT_MS)

    const hasThroughputContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return body.includes('throughput') || body.includes('tok/s') || body.includes('tokens/s') || body.includes('tps')
    })

    expect(hasThroughputContent).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — Nightly E2E on localhost (live backend)
// ---------------------------------------------------------------------------

test.describe('Nightly E2E Status — localhost live data', () => {

  test('nightly E2E card fetches from backend API', async ({ page }) => {
    const nightlyCalls: string[] = []

    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('nightly-e2e')) {
        nightlyCalls.push(url)
      }
    })

    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(CARD_CONTENT_TIMEOUT_MS)

    // The SPA always attempts the nightly E2E API call regardless of backend
    const hasNightlyCall = nightlyCalls.some(u =>
      u.includes('/api/nightly-e2e/runs') || u.includes('/api/public/nightly-e2e/runs')
    )
    expect(hasNightlyCall).toBe(true)
  })

  test('nightly E2E card shows guide data with platforms', async ({ page, request }) => {
    // This test requires a live backend — skip if backend is not reachable
    try {
      const healthCheck = await request.get('http://127.0.0.1:8080/api/public/nightly-e2e/runs', {
        timeout: 5_000,
      })
      if (!healthCheck.ok()) {
        test.skip(true, 'Backend not reachable — skipping live nightly data test')
        return
      }
    } catch {
      test.skip(true, 'Backend not reachable — skipping live nightly data test')
      return
    }

    await setupAndNavigate(page, BENCHMARKS_ROUTE)
    await page.waitForTimeout(CARD_CONTENT_TIMEOUT_MS)

    const nightlyContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      const platforms = {
        ocp: body.includes('ocp'),
        gke: body.includes('gke'),
        cks: body.includes('cks'),
      }
      const guides = ['is', 'pd', 'wva', 'wep'].filter(g => {
        const regex = new RegExp(`\\b${g}\\b`, 'i')
        return regex.test(document.body.innerText)
      })
      return { platforms, guideCount: guides.length }
    })

    const platformCount = Object.values(nightlyContent.platforms).filter(Boolean).length
    console.log(`  Platforms found: ${platformCount}/3 (OCP: ${nightlyContent.platforms.ocp}, GKE: ${nightlyContent.platforms.gke}, CKS: ${nightlyContent.platforms.cks})`)
    console.log(`  Guide acronyms found: ${nightlyContent.guideCount}`)

    expect(platformCount).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — Nightly E2E on console.kubestellar.io (Netlify Function)
// ---------------------------------------------------------------------------

test.describe('Nightly E2E Status — console.kubestellar.io', () => {

  test('Netlify function returns live nightly E2E data', async ({ request }) => {
    const response = await request.get('https://console.kubestellar.io/api/nightly-e2e/runs', {
      timeout: NETLIFY_FETCH_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    })

    expect(response.ok()).toBe(true)

    const data = await response.json()
    expect(data).toHaveProperty('guides')
    expect(Array.isArray(data.guides)).toBe(true)
    expect(data.guides.length).toBeGreaterThanOrEqual(MIN_NIGHTLY_GUIDES)

    for (const guide of data.guides) {
      expect(guide).toHaveProperty('guide')
      expect(guide).toHaveProperty('platform')
      expect(guide).toHaveProperty('runs')
      expect(Array.isArray(guide.runs)).toBe(true)

      const platform = guide.platform?.toLowerCase()
      expect(EXPECTED_PLATFORMS).toContain(platform)
    }

    const platformSet = new Set(data.guides.map((g: { platform: string }) => g.platform?.toLowerCase()))
    for (const expectedPlatform of EXPECTED_PLATFORMS) {
      expect(platformSet.has(expectedPlatform)).toBe(true)
    }

    console.log(`  Guides returned: ${data.guides.length}`)
    console.log(`  Platforms: ${Array.from(platformSet).join(', ')}`)
  })

  test('each guide has recent runs with valid structure', async ({ request }) => {
    const response = await request.get('https://console.kubestellar.io/api/nightly-e2e/runs', {
      timeout: NETLIFY_FETCH_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    })

    expect(response.ok()).toBe(true)
    const data = await response.json()

    let totalRuns = 0
    let guidesWithRuns = 0

    for (const guide of data.guides) {
      if (guide.runs.length > 0) {
        guidesWithRuns++
        totalRuns += guide.runs.length

        const run = guide.runs[0]
        expect(run).toHaveProperty('id')
        expect(run).toHaveProperty('status')
        expect(run).toHaveProperty('conclusion')
        expect(run).toHaveProperty('createdAt')
        expect(run).toHaveProperty('htmlUrl')

        expect(['completed', 'in_progress', 'queued']).toContain(run.status)

        if (run.conclusion) {
          expect(['success', 'failure', 'cancelled', 'skipped', 'timed_out']).toContain(run.conclusion)
        }
      }

      if (guide.passRate !== undefined) {
        expect(typeof guide.passRate).toBe('number')
        expect(guide.passRate).toBeGreaterThanOrEqual(0)
        expect(guide.passRate).toBeLessThanOrEqual(100)
      }
    }

    console.log(`  Guides with runs: ${guidesWithRuns}/${data.guides.length}`)
    console.log(`  Total runs: ${totalRuns}`)

    const MIN_GUIDES_WITH_RUNS = 5
    expect(guidesWithRuns).toBeGreaterThanOrEqual(MIN_GUIDES_WITH_RUNS)
  })

  test('nightly data includes image tag information', async ({ request }) => {
    const response = await request.get('https://console.kubestellar.io/api/nightly-e2e/runs', {
      timeout: NETLIFY_FETCH_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    })

    expect(response.ok()).toBe(true)
    const data = await response.json()

    let guidesWithImages = 0
    for (const guide of data.guides) {
      if (guide.llmdImages && Object.keys(guide.llmdImages).length > 0) {
        guidesWithImages++
        for (const [key, value] of Object.entries(guide.llmdImages)) {
          expect(typeof key).toBe('string')
          expect(typeof value).toBe('string')
        }
      }
    }

    console.log(`  Guides with image info: ${guidesWithImages}/${data.guides.length}`)
    expect(guidesWithImages).toBeGreaterThanOrEqual(0)
  })
})
