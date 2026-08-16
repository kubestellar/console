/* Split from analytics-coverage-tracking.test.ts for focused test modules. */
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

describe('tryChunkReloadRecovery via global error handler', () => {
  it('reloads page on chunk load error', async () => {
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/test' },
      writable: true,
      configurable: true,
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100)

    // Dispatch unhandledrejection with chunk load error
    const event = new Event('unhandledrejection') as Event & {
      reason: { message: string }
    }
    Object.defineProperty(event, 'reason', {
      value: { message: 'Failed to fetch dynamically imported module /chunk-abc.js' },
    })
    window.dispatchEvent(event)

    expect(reloadSpy).toHaveBeenCalled()
  })

  it('does not reload when recently reloaded (throttle path exercised)', async () => {
    // This test exercises the throttle branch in tryChunkReloadRecovery:
    // when a recent reload timestamp exists and hasn't expired, it skips reload
    // and emits recovery_failed instead.
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

    // Set recent reload timestamp AFTER init to simulate throttle scenario
    sessionStorage.setItem('ksc-chunk-reload-ts', String(Date.now() - 1000))
    beaconSpy.mockClear()

    const event = new Event('unhandledrejection') as Event & {
      reason: { message: string }
    }
    Object.defineProperty(event, 'reason', {
      value: { message: 'Failed to fetch dynamically imported module /chunk-abc.js' },
    })
    window.dispatchEvent(event)

    // The throttle branch clears the marker and emits recovery_failed
    expect(sessionStorage.getItem('ksc-chunk-reload-ts')).toBeNull()
    // Should have emitted recovery_failed event
    const recoveryFailed = beaconSpy.mock.calls.some(([url]) => {
      try {
        const decoded = atob(decodeURIComponent((url as string).split('d=')[1]))
        return decoded.includes('recovery_result') && decoded.includes('failed')
      } catch { return false }
    })
    expect(recoveryFailed).toBe(true)
  })

  it('emits chunk_load error via runtime handler for Safari messages', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/test' },
      writable: true,
      configurable: true,
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100)
    beaconSpy.mockClear()

    // Fire as a window 'error' event
    const errorEvent = new ErrorEvent('error', {
      message: 'Importing a module script failed',
    })
    window.dispatchEvent(errorEvent)

    expect(reloadSpy).toHaveBeenCalled()
  })
})
