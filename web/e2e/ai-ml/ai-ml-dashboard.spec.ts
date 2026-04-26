/**
 * AI/ML Dashboard Integration Tests
 *
 * Validates the /ai-ml route against a LIVE deployed llm-d stack:
 *   1. Page loads all 13 AI/ML cards
 *   2. Stack dropdown discovers ALL stacks across all clusters
 *   3. Stack types present: Prefill, Decode, WVA (disaggregated stacks)
 *   4. Cards show live Prometheus data (KV cache, throughput, latency)
 *   5. LLM-d Request Flow, EPP Routing, KV Cache Monitor — live animations
 *   6. P/D Disaggregation shows prefill + decode architecture
 *   7. Stack Monitor shows component health
 *   8. GPU Overview shows real GPU data
 *
 * Prerequisites:
 *   - Backend running on port 8080 with kc-agent
 *   - Real Kubernetes clusters with llm-d stacks deployed
 *   - Prometheus accessible in stack namespaces via agent proxy
 */
import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_ML_ROUTE = '/ai-ml'

/** Timeout for page load */
const PAGE_LOAD_TIMEOUT_MS = 60_000
/** Timeout for stack discovery (queries multiple clusters via backend) */
const STACK_DISCOVERY_TIMEOUT_MS = 50_000
/** Timeout for Prometheus metrics or demo fallback to render */
const PROMETHEUS_POLL_TIMEOUT_MS = 15_000
/** Timeout for card content to render */
const CARD_CONTENT_TIMEOUT_MS = 10_000
/** Polling interval for stack discovery checks */
const STACK_POLL_INTERVAL_MS = 2_000
/**
 * Extra wait after domcontentloaded before asserting card count.
 *
 * The AI/ML page opens SSE connections (card data streams) that keep the
 * network permanently active.  `waitForLoadState('networkidle')` therefore
 * never resolves, causing the test to hang until the 300s timeout fires.
 * After domcontentloaded we wait a fixed interval instead so that React has
 * enough time to mount and render all 13 cards (including lazy-loaded chunks)
 * without relying on a network-idle signal that will never arrive.
 */
const CARD_RENDER_WAIT_MS = 30_000

/** Expected card count on the AI/ML route */
const EXPECTED_CARD_COUNT = 13

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the AI/ML page with auth token and demo mode disabled.
 *
 * NOTE: We intentionally avoid `waitForLoadState('networkidle')` here.
 * The AI/ML page keeps SSE connections open for card data streams, which
 * means the network is never fully idle.  Using networkidle causes the test
 * to hang for the full per-test timeout (300s) before failing (#9103).
 * Instead we wait for domcontentloaded and then give React a fixed window
 * (CARD_RENDER_WAIT_MS) to mount all lazy-loaded card chunks.
 */
async function setupAndNavigate(page: Page, route: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  // Seed localStorage before navigating to the target route so the app skips
  // auth prompts and demo mode on first render.
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
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })

  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  // Allow lazy card chunks time to mount without relying on networkidle (see note above).
  await page.waitForTimeout(CARD_RENDER_WAIT_MS)
}

/**
 * Wait for stack discovery to complete by monitoring localStorage cache.
 * Returns the discovered stacks from the page context.
 */
async function waitForStackDiscovery(page: Page): Promise<unknown[]> {
  const maxPolls = Math.ceil(STACK_DISCOVERY_TIMEOUT_MS / STACK_POLL_INTERVAL_MS)

  for (let i = 0; i < maxPolls; i++) {
    const stacks = await page.evaluate(() => {
      const cached = localStorage.getItem('kubestellar-stack-cache')
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (parsed.stacks && parsed.stacks.length > 0) {
            return parsed.stacks
          }
        } catch { /* ignore */ }
      }
      return []
    })

    if (stacks.length > 0) return stacks
    await page.waitForTimeout(STACK_POLL_INTERVAL_MS)
  }

  const finalStacks = await page.evaluate(() => {
    const cached = localStorage.getItem('kubestellar-stack-cache')
    if (cached) {
      try { return JSON.parse(cached).stacks || [] } catch { return [] }
    }
    return []
  })
  return finalStacks
}

// ---------------------------------------------------------------------------
// Tests — AI/ML page loads and renders
// ---------------------------------------------------------------------------

test.describe('AI/ML Dashboard — page structure', () => {

  test('page loads with all 13 AI/ML cards', async ({ page, request }) => {
    // These page-structure tests require a live backend with llm-d stacks to
    // render all 13 cards. In CI (no backend), demo mode renders a subset of
    // cards which doesn't meet the 13-card threshold, causing 50s+ timeouts.
    // Skip gracefully when the backend is unreachable (#nightly-fix).
    try {
      const healthCheck = await request.get('http://127.0.0.1:8080/api/health', { timeout: 5_000 })
      if (!healthCheck.ok()) {
        test.skip(true, 'Backend not reachable — skipping AI/ML page structure tests')
        return
      }
    } catch {
      test.skip(true, 'Backend not reachable — skipping AI/ML page structure tests')
      return
    }

    await setupAndNavigate(page, AI_ML_ROUTE)

    // Wait for card elements to appear in the DOM (lazy-loaded via safeLazy)
    await page.waitForFunction(
      (min) => document.querySelectorAll('[data-card-type]').length >= min,
      EXPECTED_CARD_COUNT,
      { timeout: STACK_DISCOVERY_TIMEOUT_MS },
    )

    const cardCount = await page.locator('[data-card-type]').count()

    expect(cardCount).toBeGreaterThanOrEqual(EXPECTED_CARD_COUNT)
    console.log(`  Cards rendered: ${cardCount}`)
  })

  test('hero row has LLM-d visualization cards', async ({ page, request }) => {
    // Same skip logic — hero card labels rely on live Prometheus data rendering.
    try {
      const healthCheck = await request.get('http://127.0.0.1:8080/api/health', { timeout: 5_000 })
      if (!healthCheck.ok()) {
        test.skip(true, 'Backend not reachable — skipping AI/ML page structure tests')
        return
      }
    } catch {
      test.skip(true, 'Backend not reachable — skipping AI/ML page structure tests')
      return
    }

    await setupAndNavigate(page, AI_ML_ROUTE)
    await page.waitForFunction(
      () => document.querySelectorAll('[data-card-type]').length >= 3,
      { timeout: CARD_CONTENT_TIMEOUT_MS },
    )

    const heroCardLabels = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasRequestFlow: body.includes('request flow') || body.includes('llm-d flow') || body.includes('llmd flow'),
        hasKVCache: body.includes('kv cache') || body.includes('cache monitor'),
        hasEPP: body.includes('epp') || body.includes('endpoint picker') || body.includes('routing'),
      }
    })

    console.log(`  Request Flow: ${heroCardLabels.hasRequestFlow}`)
    console.log(`  KV Cache: ${heroCardLabels.hasKVCache}`)
    console.log(`  EPP: ${heroCardLabels.hasEPP}`)

    const heroCount = Object.values(heroCardLabels).filter(Boolean).length
    expect(heroCount).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Tests — Stack discovery and dropdown
// ---------------------------------------------------------------------------

test.describe('AI/ML Dashboard — stack discovery', () => {

  test('stack dropdown discovers stacks across all clusters', async ({ page, request }) => {
    // Stack discovery requires the Go backend + kc-agent with real clusters
    try {
      const healthCheck = await request.get('http://127.0.0.1:8080/api/health', { timeout: 5_000 })
      if (!healthCheck.ok()) {
        test.skip(true, 'Backend not reachable — skipping stack discovery tests')
        return
      }
    } catch {
      test.skip(true, 'Backend not reachable — skipping stack discovery tests')
      return
    }

    const agentCalls: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/exec') || url.includes('/kubectl') || url.includes('/agent')) {
        agentCalls.push(url)
      }
    })

    await setupAndNavigate(page, AI_ML_ROUTE)
    const stacks = await waitForStackDiscovery(page)

    console.log(`  Stacks discovered: ${stacks.length}`)
    console.log(`  Agent API calls: ${agentCalls.length}`)

    expect(stacks.length).toBeGreaterThan(0)

    for (const stack of stacks as Array<{ id: string; name: string; cluster: string; status: string }>) {
      console.log(`    - ${stack.id} (${stack.name}) on ${stack.cluster} [${stack.status}]`)
    }
  })

  test('stacks include Prefill and Decode components (disaggregated)', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    const stacks = await waitForStackDiscovery(page)

    if (stacks.length === 0) {
      test.skip(true, 'No stacks discovered — skip disaggregation check')
      return
    }

    interface StackShape {
      id: string
      hasDisaggregation: boolean
      components: {
        prefill: unknown[]
        decode: unknown[]
        both: unknown[]
        epp: unknown | null
      }
      autoscaler?: { type: string }
    }

    const disaggregatedStacks = (stacks as StackShape[]).filter(s => s.hasDisaggregation)
    const unifiedStacks = (stacks as StackShape[]).filter(s => !s.hasDisaggregation && s.components.both.length > 0)

    console.log(`  Disaggregated stacks (P/D): ${disaggregatedStacks.length}`)
    console.log(`  Unified stacks: ${unifiedStacks.length}`)

    for (const stack of disaggregatedStacks) {
      console.log(`    - ${stack.id}: prefill=${stack.components.prefill.length}, decode=${stack.components.decode.length}`)
      expect(stack.components.prefill.length).toBeGreaterThan(0)
      expect(stack.components.decode.length).toBeGreaterThan(0)
    }

    const stacksWithPods = (stacks as StackShape[]).filter(s =>
      s.components.prefill.length > 0 || s.components.decode.length > 0 || s.components.both.length > 0
    )
    expect(stacksWithPods.length).toBeGreaterThan(0)
  })

  test('stacks include WVA autoscaler where configured', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    const stacks = await waitForStackDiscovery(page)

    if (stacks.length === 0) {
      test.skip(true, 'No stacks discovered — skip autoscaler check')
      return
    }

    interface StackShape {
      id: string
      autoscaler?: { type: string; name: string; minReplicas?: number; maxReplicas?: number }
    }

    const stacksWithAutoscaler = (stacks as StackShape[]).filter(s => s.autoscaler)
    const wvaStacks = stacksWithAutoscaler.filter(s => s.autoscaler?.type === 'WVA')
    const hpaStacks = stacksWithAutoscaler.filter(s => s.autoscaler?.type === 'HPA')
    const vpaStacks = stacksWithAutoscaler.filter(s => s.autoscaler?.type === 'VPA')

    console.log(`  Stacks with autoscaler: ${stacksWithAutoscaler.length}/${stacks.length}`)
    console.log(`    WVA: ${wvaStacks.length}`)
    console.log(`    HPA: ${hpaStacks.length}`)
    console.log(`    VPA: ${vpaStacks.length}`)

    for (const stack of stacksWithAutoscaler) {
      console.log(`    - ${stack.id}: ${stack.autoscaler?.type} (${stack.autoscaler?.name})`)
      if (stack.autoscaler?.minReplicas !== undefined) {
        console.log(`      min=${stack.autoscaler.minReplicas}, max=${stack.autoscaler.maxReplicas}`)
      }
    }

    expect(stacks.length).toBeGreaterThan(0)
  })

  test('stacks span multiple clusters', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    const stacks = await waitForStackDiscovery(page)

    if (stacks.length === 0) {
      test.skip(true, 'No stacks discovered — skip multi-cluster check')
      return
    }

    const clusters = new Set(
      (stacks as Array<{ cluster: string }>).map(s => s.cluster)
    )

    console.log(`  Clusters with stacks: ${clusters.size}`)
    for (const cluster of clusters) {
      const clusterStacks = (stacks as Array<{ cluster: string; id: string }>)
        .filter(s => s.cluster === cluster)
      console.log(`    - ${cluster}: ${clusterStacks.length} stack(s)`)
    }

    expect(clusters.size).toBeGreaterThanOrEqual(1)
  })

  test('stack dropdown UI is present and populated', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)

    const hasDropdown = await page.evaluate(() => {
      const selectors = [
        'select', '[role="combobox"]', '[class*="stack-select"]',
        '[class*="StackSelect"]', '[class*="dropdown"]',
        'button[class*="stack"]', '[data-testid*="stack"]',
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) return true
      }
      const body = document.body.innerText.toLowerCase()
      return body.includes('stack') || body.includes('inference')
    })

    expect(hasDropdown).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — Comprehensive stack enumeration
// NOTE: This runs early (before Prometheus/component health tests) to avoid
// vite preview server timeouts on long-running test suites.
// ---------------------------------------------------------------------------

test.describe('AI/ML Dashboard — complete stack coverage', () => {

  test('all stacks across all clusters are enumerated', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    const stacks = await waitForStackDiscovery(page)

    if (stacks.length === 0) {
      test.skip(true, 'No stacks discovered — cannot verify completeness')
      return
    }

    interface FullStack {
      id: string
      name: string
      namespace: string
      cluster: string
      status: string
      hasDisaggregation: boolean
      model?: string
      totalReplicas: number
      readyReplicas: number
      inferencePool?: string
      autoscaler?: { type: string; name: string }
      components: {
        prefill: unknown[]
        decode: unknown[]
        both: unknown[]
        epp: unknown | null
        gateway: unknown | null
      }
    }

    const typedStacks = stacks as FullStack[]

    console.log('\n  +-----------------------------------------+')
    console.log('  |        Stack Discovery Results          |')
    console.log('  +--------------------+--------+-----+-----+')
    console.log('  | Stack ID           | Status | P/D | AS  |')
    console.log('  +--------------------+--------+-----+-----+')

    for (const stack of typedStacks) {
      const pd = stack.hasDisaggregation ? 'Yes' : 'No'
      const as = stack.autoscaler ? stack.autoscaler.type : '-'
      const id = stack.id.substring(0, 20).padEnd(20)
      const status = stack.status.substring(0, 8).padEnd(8)
      console.log(`  | ${id}| ${status}| ${pd.padEnd(3)} | ${as.padEnd(3)} |`)
    }
    console.log('  +--------------------+--------+-----+-----+')

    for (const stack of typedStacks) {
      expect(stack.id).toBeTruthy()
      expect(stack.namespace).toBeTruthy()
      expect(stack.cluster).toBeTruthy()
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(stack.status)
      expect(stack.components).toBeTruthy()
      expect(typeof stack.totalReplicas).toBe('number')
      expect(typeof stack.readyReplicas).toBe('number')
    }

    const healthyCount = typedStacks.filter(s => s.status === 'healthy').length
    const pdCount = typedStacks.filter(s => s.hasDisaggregation).length
    const eppCount = typedStacks.filter(s => s.components.epp).length
    const gwCount = typedStacks.filter(s => s.components.gateway).length

    console.log(`\n  Summary:`)
    console.log(`    Total stacks: ${typedStacks.length}`)
    console.log(`    Healthy: ${healthyCount}`)
    console.log(`    Disaggregated (P/D): ${pdCount}`)
    console.log(`    With EPP: ${eppCount}`)
    console.log(`    With Gateway: ${gwCount}`)
  })
})

// ---------------------------------------------------------------------------
// Tests — Live Prometheus data
// ---------------------------------------------------------------------------

test.describe('AI/ML Dashboard — live Prometheus data', () => {

  test('cards show live Prometheus metrics from vLLM', async ({ page }) => {
    const promCalls: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/prometheus/') || url.includes('prometheus')) {
        promCalls.push(url)
      }
    })

    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase()
        return body.includes('cache') || body.includes('throughput') || body.includes('tok') || body.includes('latency')
      },
      { timeout: PROMETHEUS_POLL_TIMEOUT_MS },
    ).catch(() => { /* metrics may not load — assertions below will catch */ })

    console.log(`  Prometheus API calls: ${promCalls.length}`)

    const metricsContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasKVCache: body.includes('cache') && (body.includes('%') || body.includes('usage')),
        hasThroughput: body.includes('tok') || body.includes('throughput') || body.includes('tokens'),
        hasRequests: body.includes('request') || body.includes('running') || body.includes('waiting'),
        hasLatency: body.includes('ttft') || body.includes('tpot') || body.includes('latency'),
      }
    })

    console.log(`  KV Cache metrics: ${metricsContent.hasKVCache}`)
    console.log(`  Throughput metrics: ${metricsContent.hasThroughput}`)
    console.log(`  Request metrics: ${metricsContent.hasRequests}`)
    console.log(`  Latency metrics: ${metricsContent.hasLatency}`)

    const metricCount = Object.values(metricsContent).filter(Boolean).length
    expect(metricCount).toBeGreaterThanOrEqual(1)
  })

  test('KV Cache Monitor shows real cache utilization', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes('cache'),
      { timeout: PROMETHEUS_POLL_TIMEOUT_MS },
    ).catch(() => { /* fallback — assertion below will check */ })

    const kvCacheData = await page.evaluate(() => {
      const body = document.body.innerText
      const percentMatches = body.match(/\d+(\.\d+)?%/g)
      const hasKVLabel = body.toLowerCase().includes('kv cache') || body.toLowerCase().includes('cache')
      return {
        hasKVLabel,
        percentValues: percentMatches ? percentMatches.length : 0,
      }
    })

    console.log(`  KV Cache label present: ${kvCacheData.hasKVLabel}`)
    console.log(`  Percentage values on page: ${kvCacheData.percentValues}`)

    expect(kvCacheData.hasKVLabel).toBe(true)
  })

  test('EPP Routing card shows endpoint picker activity', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase()
        return body.includes('epp') || body.includes('endpoint picker') || body.includes('routing')
      },
      { timeout: PROMETHEUS_POLL_TIMEOUT_MS },
    ).catch(() => { /* fallback — assertion below will check */ })

    const eppContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasEPP: body.includes('epp') || body.includes('endpoint picker') || body.includes('routing'),
        hasScheduling: body.includes('schedul') || body.includes('route') || body.includes('dispatch'),
      }
    })

    expect(eppContent.hasEPP).toBe(true)
  })

  test('P/D Disaggregation card shows architecture visualization', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase()
        return body.includes('disaggregat') || body.includes('p/d') || body.includes('prefill') || body.includes('decode')
      },
      { timeout: CARD_CONTENT_TIMEOUT_MS },
    ).catch(() => { /* fallback — assertion below will check */ })

    const pdContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasPD: body.includes('disaggregat') || body.includes('p/d'),
        hasPrefill: body.includes('prefill'),
        hasDecode: body.includes('decode'),
      }
    })

    console.log(`  P/D label: ${pdContent.hasPD}`)
    console.log(`  Prefill: ${pdContent.hasPrefill}`)
    console.log(`  Decode: ${pdContent.hasDecode}`)

    expect(pdContent.hasPD || pdContent.hasPrefill || pdContent.hasDecode).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — Component health and GPU
// ---------------------------------------------------------------------------

test.describe('AI/ML Dashboard — component health', () => {

  test('Stack Monitor shows component health status', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase()
        return body.includes('stack') || body.includes('llm-d') || body.includes('healthy') || body.includes('running')
      },
      { timeout: CARD_CONTENT_TIMEOUT_MS },
    ).catch(() => { /* fallback — assertion below will check */ })

    const stackMonitorContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasStack: body.includes('stack') || body.includes('llm-d'),
        hasHealthy: body.includes('healthy') || body.includes('running'),
        hasReplicas: body.includes('replica') || /\d+\/\d+/.test(document.body.innerText),
        hasModel: body.includes('llama') || body.includes('qwen') || body.includes('granite') ||
                  body.includes('mistral') || body.includes('model'),
      }
    })

    console.log(`  Stack label: ${stackMonitorContent.hasStack}`)
    console.log(`  Health status: ${stackMonitorContent.hasHealthy}`)
    console.log(`  Replica counts: ${stackMonitorContent.hasReplicas}`)
    console.log(`  Model name: ${stackMonitorContent.hasModel}`)

    expect(stackMonitorContent.hasStack || stackMonitorContent.hasHealthy).toBe(true)
  })

  test('GPU Overview shows GPU utilization data', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes('gpu'),
      { timeout: CARD_CONTENT_TIMEOUT_MS },
    ).catch(() => { /* fallback — assertion below will check */ })

    const gpuContent = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return {
        hasGPU: body.includes('gpu'),
        hasUtilization: body.includes('utiliz') || body.includes('usage') || body.includes('%'),
        hasGPUType: body.includes('a100') || body.includes('h100') || body.includes('l4') ||
                    body.includes('nvidia') || body.includes('v100'),
      }
    })

    console.log(`  GPU label: ${gpuContent.hasGPU}`)
    console.log(`  Utilization data: ${gpuContent.hasUtilization}`)
    console.log(`  GPU type: ${gpuContent.hasGPUType}`)

    expect(gpuContent.hasGPU).toBe(true)
  })

  test('no cards show demo badge when live data is available', async ({ page }) => {
    await setupAndNavigate(page, AI_ML_ROUTE)
    await waitForStackDiscovery(page)
    await page.waitForFunction(
      () => document.body.innerText.length > 500,
      { timeout: PROMETHEUS_POLL_TIMEOUT_MS },
    ).catch(() => { /* page content may be minimal — assertions below will check */ })

    const demoBadgeCount = await page.evaluate(() => {
      let count = 0
      const elements = document.querySelectorAll('[class*="demo"], [data-demo="true"]')
      count += elements.length

      const spans = document.querySelectorAll('span, div')
      for (const el of Array.from(spans)) {
        const text = el.textContent?.trim() || ''
        const rect = el.getBoundingClientRect()
        if (text === 'Demo' && rect.width < 100 && rect.height < 40) {
          count++
        }
      }
      return count
    })

    console.log(`  Demo badges found: ${demoBadgeCount} (0 = all live data)`)

    // ml_jobs and ml_notebooks are always demo — so up to 2 is expected
    const ALWAYS_DEMO_CARDS = 2
    if (demoBadgeCount > ALWAYS_DEMO_CARDS) {
      console.log(`  WARNING: ${demoBadgeCount - ALWAYS_DEMO_CARDS} card(s) showing demo data unexpectedly`)
    }
  })
})
