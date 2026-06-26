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

describe('initAnalytics with fresh module state', () => {
  it('sets initialized=true and registers interaction listeners', async () => {
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    // Should have registered interaction gate events
    const interactionCalls = addSpy.mock.calls.filter(
      ([evt]) =>
        evt === 'mousedown' ||
        evt === 'keydown' ||
        evt === 'scroll' ||
        evt === 'touchstart' ||
        evt === 'click',
    )
    expect(interactionCalls.length).toBeGreaterThanOrEqual(5)
  })

  it('skips initialization in WebDriver environment', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: true,
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      plugins: { length: 2 },
      languages: ['en-US'],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    // Should NOT register interaction listeners if automated
    const interactionCalls = addSpy.mock.calls.filter(
      ([evt]) => evt === 'mousedown' || evt === 'click',
    )
    expect(interactionCalls.length).toBe(0)
  })

  it('skips initialization in HeadlessChrome environment', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      userAgent: 'Mozilla/5.0 HeadlessChrome/120.0',
      plugins: { length: 2 },
      languages: ['en-US'],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    expect(interactionCalls.length).toBe(0)
  })

  it('skips initialization in PhantomJS environment', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      userAgent: 'Mozilla/5.0 PhantomJS/2.1',
      plugins: { length: 2 },
      languages: ['en-US'],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    expect(interactionCalls.length).toBe(0)
  })

  it('skips initialization when no plugins (non-Firefox)', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      plugins: { length: 0 },
      languages: ['en-US'],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    expect(interactionCalls.length).toBe(0)
  })

  it('does NOT skip Firefox with no plugins', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      userAgent: 'Mozilla/5.0 Firefox/120.0',
      plugins: { length: 0 },
      languages: ['en-US'],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    expect(interactionCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('skips initialization when no languages', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      plugins: { length: 2 },
      languages: [],
      language: 'en-US',
      sendBeacon: vi.fn(),
    })
    const mod = await freshImport()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics()
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    expect(interactionCalls.length).toBe(0)
  })

  it('is idempotent — second call is a no-op', async () => {
    const mod = await freshImport()
    mod.initAnalytics()
    const addSpy = vi.spyOn(document, 'addEventListener')
    mod.initAnalytics() // second call
    const interactionCalls = addSpy.mock.calls.filter(([evt]) => evt === 'mousedown')
    // Second call should NOT register additional listeners
    expect(interactionCalls.length).toBe(0)
  })

  it('registers beforeunload and global error tracking', async () => {
    const windowAddSpy = vi.spyOn(window, 'addEventListener')
    const mod = await freshImport()
    mod.initAnalytics()
    const beforeUnloadCalls = windowAddSpy.mock.calls.filter(([evt]) => evt === 'beforeunload')
    expect(beforeUnloadCalls.length).toBeGreaterThanOrEqual(1)
    const errorCalls = windowAddSpy.mock.calls.filter(([evt]) => evt === 'error')
    expect(errorCalls.length).toBeGreaterThanOrEqual(1)
    const rejectionCalls = windowAddSpy.mock.calls.filter(
      ([evt]) => evt === 'unhandledrejection',
    )
    expect(rejectionCalls.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// onFirstInteraction — script loading, event flushing, pending recovery
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

describe('loadUmamiScript', () => {
  it('creates umami script with correct attributes', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    const umamiScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/ksc'),
      ) as HTMLScriptElement | undefined

    expect(umamiScript).toBeTruthy()
    expect(umamiScript?.defer).toBe(true)
    expect(umamiScript?.dataset.websiteId).toBeTruthy()
    expect(umamiScript?.dataset.hostUrl).toBe(window.location.origin)
  })
})

// ============================================================================
// sendToUmami — fire-and-forget
// ============================================================================

describe('sendToUmami', () => {
  it('calls umami.track when available', async () => {
    const trackFn = vi.fn()
    ;(window as Record<string, unknown>).umami = { track: trackFn }

    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Force gtag decided so events aren't just queued
    vi.advanceTimersByTime(5100)

    mod.emitPageView('/umami-test')
    expect(trackFn).toHaveBeenCalledWith(
      'page_view',
      expect.objectContaining({ page_path: '/umami-test' }),
    )
  })

  it('does not throw when umami is undefined', async () => {
    delete (window as Record<string, unknown>).umami

    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100)

    expect(() => mod.emitPageView('/test')).not.toThrow()
  })

  it('does not throw when umami.track throws', async () => {
    ;(window as Record<string, unknown>).umami = {
      track: () => {
        throw new Error('Umami failure')
      },
    }

    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100)

    expect(() => mod.emitPageView('/test')).not.toThrow()
  })
})

// ============================================================================
// send() gating — not initialized, opted out, not interacted
// ============================================================================

describe('send() gating', () => {
  it('drops events when not initialized', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    // Do NOT call initAnalytics
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
  })

  it('drops events when opted out', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100)

    // Clear beacon calls from initialization events (page_view, conversion_step)
    beaconSpy.mockClear()

    localStorage.setItem('kc-analytics-opt-out', 'true')
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
  })

  it('drops events before user interaction', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    // Do NOT dispatch interaction event
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
  })

  it('queues events while waiting for gtag decision', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Emit events while gtag is still loading (before timeout)
    mod.emitCardAdded('pods', 'manual')
    mod.emitCardRemoved('nodes')

    // Events should NOT have been sent via beacon yet (queued)
    // The initial page_view + conversion from onFirstInteraction are also queued
    // but no beacon calls since gtag hasn't decided
    const beaconCallsBefore = beaconSpy.mock.calls.length

    // Now let gtag timeout to flush queue via proxy
    vi.advanceTimersByTime(5100)

    // Queue should have been flushed via beacon
    expect(beaconSpy.mock.calls.length).toBeGreaterThan(beaconCallsBefore)
  })
})

// ============================================================================
// sendViaProxy — parameter encoding, UTM, engagement time
// ============================================================================

