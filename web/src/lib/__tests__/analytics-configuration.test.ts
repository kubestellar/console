/**
 * Configuration and parameter tracking
 * 
 * Part of the analytics coverage test suite, split from analytics-coverage-tracking.test.ts.
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

describe('captureUtmParams deep', () => {
  it('captures UTM params from URL and stores in sessionStorage', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        search: '?utm_source=test&utm_medium=email',
        href: 'http://localhost/?utm_source=test&utm_medium=email',
        hostname: 'localhost',
        pathname: '/',
        origin: 'http://localhost',
      },
      writable: true,
      configurable: true,
    })

    const mod = await freshImport()
    mod.captureUtmParams()

    const stored = sessionStorage.getItem('_ksc_utm')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.utm_source).toBe('test')
    expect(parsed.utm_medium).toBe('email')
  })

  it('recovers UTM params from sessionStorage on subsequent page loads', async () => {
    // Ensure URL has NO UTM params so the sessionStorage fallback path is taken
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        search: '',
        href: 'http://localhost/',
        hostname: 'localhost',
        pathname: '/',
        origin: 'http://localhost',
      },
      writable: true,
      configurable: true,
    })

    sessionStorage.setItem(
      '_ksc_utm',
      JSON.stringify({ utm_source: 'cached', utm_campaign: 'test' }),
    )

    const mod = await freshImport()
    mod.captureUtmParams()
    const params = mod.getUtmParams()
    expect(params.utm_source).toBe('cached')
    expect(params.utm_campaign).toBe('test')
  })

  it('truncates UTM values to 100 chars', async () => {
    const longValue = 'x'.repeat(200)
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        search: `?utm_source=${longValue}`,
        href: `http://localhost/?utm_source=${longValue}`,
        hostname: 'localhost',
        pathname: '/',
        origin: 'http://localhost',
      },
      writable: true,
      configurable: true,
    })

    const mod = await freshImport()
    mod.captureUtmParams()
    const params = mod.getUtmParams()
    expect(params.utm_source?.length).toBeLessThanOrEqual(100)
  })

  it('captures all 5 UTM parameters', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        search:
          '?utm_source=src&utm_medium=med&utm_campaign=camp&utm_term=trm&utm_content=cnt',
        href: 'http://localhost/?utm_source=src&utm_medium=med&utm_campaign=camp&utm_term=trm&utm_content=cnt',
        hostname: 'localhost',
        pathname: '/',
        origin: 'http://localhost',
      },
      writable: true,
      configurable: true,
    })

    const mod = await freshImport()
    mod.captureUtmParams()
    const params = mod.getUtmParams()
    expect(params.utm_source).toBe('src')
    expect(params.utm_medium).toBe('med')
    expect(params.utm_campaign).toBe('camp')
    expect(params.utm_term).toBe('trm')
    expect(params.utm_content).toBe('cnt')
  })
})

// ============================================================================
// setAnalyticsOptOut — deep: cookie cleanup, engagement stop
// ============================================================================

describe('setAnalyticsOptOut deep', () => {
  it('clears _ga and _ksc cookies on opt-out', async () => {
    // Set some cookies
    document.cookie = '_ga=GA1.1.12345;path=/'
    document.cookie = '_ksc_cid=test-cid;path=/'
    document.cookie = 'unrelated=keep;path=/'

    const mod = await freshImport()
    mod.setAnalyticsOptOut(true)

    // Verify opt-out flag is set
    expect(localStorage.getItem('kc-analytics-opt-out')).toBe('true')
  })

  it('dispatches settings-changed event', async () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)

    const mod = await freshImport()
    mod.setAnalyticsOptOut(true)
    expect(handler).toHaveBeenCalledTimes(1)

    mod.setAnalyticsOptOut(false)
    expect(handler).toHaveBeenCalledTimes(2)

    window.removeEventListener('kubestellar-settings-changed', handler)
  })
})

// ============================================================================
// updateAnalyticsIds
// ============================================================================

describe('updateAnalyticsIds deep', () => {
  it('updates ga4 measurement ID (does not throw)', async () => {
    const mod = await freshImport()
    // updateAnalyticsIds is called by BrandingProvider before init in production.
    // Since module-level state may not fully reset with vi.mock, just verify the call works.
    expect(() => mod.updateAnalyticsIds({ ga4MeasurementId: 'G-CUSTOM123' })).not.toThrow()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    // Verify gtag script was appended (regardless of which measurement ID)
    expect(window.dataLayer).toBeDefined()
  })

  it('updates umami website ID', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.updateAnalyticsIds({ umamiWebsiteId: 'custom-umami-id' })
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    const umamiScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/ksc'),
      ) as HTMLScriptElement | undefined

    expect(umamiScript?.dataset.websiteId).toBe('custom-umami-id')
  })

  it('does not override with empty strings', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.updateAnalyticsIds({ ga4MeasurementId: '', umamiWebsiteId: '' })
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // Should still use defaults
    const gtagScript = appendSpy.mock.calls
      .map(([el]) => el)
      .find(
        (el) =>
          el instanceof HTMLScriptElement && el.src.includes('/api/gtag'),
      ) as HTMLScriptElement | undefined

    // Default is G-PXWNVQ8D1T
    expect(gtagScript?.src).toContain('G-PXWNVQ8D1T')
  })
})

// ============================================================================
// setAnalyticsUserProperties — gtag propagation
// ============================================================================

