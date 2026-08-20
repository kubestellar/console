/**
 * Coverage tests for analytics.ts — targets ~229 uncovered lines.
 *
 * Uses vi.resetModules() + dynamic import to get fresh module state for each
 * test group, allowing us to exercise initialization, gtag loading, engagement
 * tracking, error handlers, and proxy/gtag send paths with clean state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Returns true if the element's src URL has the given hostname — uses
 * new URL() instead of includes() to prevent CodeQL
 * js/incomplete-url-substring-sanitization false positives (#9119).
 */
function srcHasHostname(el: Element, hostname: string): boolean {
  const src = (el as HTMLScriptElement).src
  if (!src) return false
  try {
    return new URL(src).hostname.toLowerCase() === hostname.toLowerCase()
  } catch {
    return false
  }
}

// ── Shared mock setup ──────────────────────────────────────────────

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_ANALYTICS_OPT_OUT: 'kc-analytics-opt-out',
    STORAGE_KEY_ANONYMOUS_USER_ID: 'kc-anonymous-user-id',
  }
})

vi.mock('../chunkErrors', () => ({
  CHUNK_RELOAD_TS_KEY: 'ksc-chunk-reload-ts',
  isChunkLoadMessage: (msg: string) =>
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed'),
}))

let mockIsDemoMode = false
let mockIsNetlifyDeployment = false

vi.mock('../demoMode', () => ({
  isDemoMode: () => mockIsDemoMode,
  get isNetlifyDeployment() {
    return mockIsNetlifyDeployment
  },
}))

// ── Helper: fresh import ──────────────────────────────────────────

type AnalyticsModule = typeof import('../analytics')

async function freshImport(): Promise<AnalyticsModule> {
  vi.resetModules()
  return (await import('../analytics')) as AnalyticsModule
}

// ── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockIsDemoMode = false
  mockIsNetlifyDeployment = false
  vi.useFakeTimers({ shouldAdvanceTime: false })

  // Provide baseline DOM APIs that analytics.ts expects
  vi.stubGlobal('navigator', {
    ...navigator,
    webdriver: false,
    userAgent: 'Mozilla/5.0 Chrome/120.0',
    plugins: { length: 2 },
    languages: ['en-US'],
    language: 'en-US',
    sendBeacon: vi.fn(() => true),
  })

  // Clean up any gtag globals from prior tests
  delete (window as Record<string, unknown>).dataLayer
  delete (window as Record<string, unknown>).gtag
  delete (window as Record<string, unknown>).google_tag_manager
  delete (window as Record<string, unknown>).umami
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})


describe('flushPendingEvents', () => {
  it('flushes queued events via gtag when available', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Events are queued while gtag decision pending
    // The onFirstInteraction already fires page_view + conversion_step

    // Simulate successful gtag load to flush via gtag
    ;(window as Record<string, unknown>).google_tag_manager = {}
    const gtagSpy = vi.fn()
    window.gtag = gtagSpy

    const firstScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/gtag'),
      ) as HTMLScriptElement | undefined

    if (firstScript?.onload) {
      ;(firstScript.onload as () => void)(new Event('load'))
    }
    vi.advanceTimersByTime(150)

    // Queued events from onFirstInteraction should have been flushed via gtag
    const eventCalls = gtagSpy.mock.calls.filter(([type]) => type === 'event')
    expect(eventCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('flushes queued events via proxy when gtag unavailable', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    beaconSpy.mockClear()

    // Let gtag timeout
    vi.advanceTimersByTime(5100)

    // Queued events from onFirstInteraction should have been flushed via beacon
    expect(beaconSpy).toHaveBeenCalled()
  })
})

// ============================================================================
// Engagement tracking — markActive, checkEngagement, visibility change
// ============================================================================

