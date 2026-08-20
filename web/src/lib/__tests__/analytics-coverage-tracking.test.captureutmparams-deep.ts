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
