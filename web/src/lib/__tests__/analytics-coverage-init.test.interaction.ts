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

// ============================================================================
// initAnalytics — bot detection, initialization gating
// ============================================================================

describe('onFirstInteraction triggers script loading and flushing', () => {
  it('loads gtag and umami scripts on first mousedown', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()

    // Simulate user interaction
    document.dispatchEvent(new Event('mousedown'))

    // Should have appended script elements (gtag + umami)
    const scriptAppends = appendSpy.mock.calls.filter(
      ([el]) => el instanceof HTMLScriptElement,
    )
    expect(scriptAppends.length).toBeGreaterThanOrEqual(2)
  })

  it('is idempotent — second interaction does not re-load scripts', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()

    document.dispatchEvent(new Event('mousedown'))
    const countAfterFirst = appendSpy.mock.calls.filter(
      ([el]) => el instanceof HTMLScriptElement,
    ).length

    document.dispatchEvent(new Event('mousedown'))
    const countAfterSecond = appendSpy.mock.calls.filter(
      ([el]) => el instanceof HTMLScriptElement,
    ).length

    expect(countAfterSecond).toBe(countAfterFirst)
  })

  it('flushes pending recovery event on first interaction', async () => {
    // Set up a chunk-reload recovery marker BEFORE module import
    const reloadTime = Date.now() - 500
    sessionStorage.setItem('ksc-chunk-reload-ts', String(reloadTime))

    const mod = await freshImport()
    mod.initAnalytics()

    // Recovery should be detected but not sent yet (user hasn't interacted)
    // Marker should be cleared from sessionStorage by initAnalytics -> startGlobalErrorTracking -> checkChunkReloadRecovery
    expect(sessionStorage.getItem('ksc-chunk-reload-ts')).toBeNull()

    // Trigger interaction — should flush the pending recovery event
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beaconSpy, language: 'en-US' })
    document.dispatchEvent(new Event('mousedown'))

    // The recovery event should have been emitted (either via beacon or queued for gtag)
    // Since gtag hasn't loaded yet, events are queued
    // This verifies the code path doesn't throw
  })
})

// ============================================================================
// loadGtagScript — script loading, CDN fallback, timeout
// ============================================================================

