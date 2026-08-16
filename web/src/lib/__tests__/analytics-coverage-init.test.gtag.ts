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

describe('loadGtagScript behavior', () => {
  it('creates script element with first-party proxy src', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    const scripts = appendSpy.mock.calls
      .filter(([el]) => el instanceof HTMLScriptElement)
      .map(([el]) => (el as HTMLScriptElement).src)

    // Should have the gtag proxy script
    const gtagScript = scripts.find((s) => s.includes('/api/gtag'))
    expect(gtagScript).toBeTruthy()
  })

  it('initializes dataLayer and gtag function', async () => {
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    expect(window.dataLayer).toBeDefined()
    expect(Array.isArray(window.dataLayer)).toBe(true)
    expect(typeof window.gtag).toBe('function')
  })

  it('falls back to CDN on script.onerror', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Find the first-party proxy script and trigger its onerror
    const firstScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/gtag'),
      ) as HTMLScriptElement | undefined

    expect(firstScript).toBeTruthy()
    if (firstScript?.onerror) {
      ;(firstScript.onerror as () => void)()
    }

    // Should have appended a CDN fallback script
    const cdnScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement &&
          srcHasHostname(el, 'www.googletagmanager.com'),
      ) as HTMLScriptElement | undefined

    expect(cdnScript).toBeTruthy()
  })

  it('falls back to CDN when proxy returns HTML (not real gtag)', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    const firstScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/gtag'),
      ) as HTMLScriptElement | undefined

    expect(firstScript).toBeTruthy()

    // Simulate onload without google_tag_manager being set (HTML response)
    // window.google_tag_manager is NOT defined
    if (firstScript?.onload) {
      ;(firstScript.onload as () => void)(new Event('load'))
    }

    // Advance past GTAG_INIT_CHECK_MS (100ms)
    vi.advanceTimersByTime(150)

    // Should have appended CDN fallback
    const cdnScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement &&
          srcHasHostname(el, 'www.googletagmanager.com'),
      )

    expect(cdnScript).toBeTruthy()
  })

  it('marks gtag as available when proxy loads successfully', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Simulate successful gtag.js initialization
    ;(window as Record<string, unknown>).google_tag_manager = {}

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

    // After gtag decided=true+available, events should go through sendViaGtag
    // Test by emitting an event — should call window.gtag
    const gtagFn = vi.fn()
    window.gtag = gtagFn
    mod.emitPageView('/test')
    expect(gtagFn).toHaveBeenCalled()
  })

  it('CDN fallback onerror marks gtag as unavailable', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Trigger first-party onerror
    const firstScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/gtag'),
      ) as HTMLScriptElement | undefined

    if (firstScript?.onerror) {
      ;(firstScript.onerror as () => void)()
    }

    // Now trigger CDN onerror
    const cdnScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement &&
          srcHasHostname(el, 'www.googletagmanager.com'),
      ) as HTMLScriptElement | undefined

    if (cdnScript?.onerror) {
      ;(cdnScript.onerror as () => void)()
    }

    // Now events should go via proxy (sendBeacon)
    mod.emitPageView('/test')
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('timeout falls back to proxy when gtag.js takes too long', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Advance past GTAG_LOAD_TIMEOUT_MS (5000ms) without script loading
    vi.advanceTimersByTime(5100)

    // Events should now go via proxy
    mod.emitPageView('/test')
    expect(beaconSpy).toHaveBeenCalled()
  })
})

// ============================================================================
// loadUmamiScript — script creation
// ============================================================================

