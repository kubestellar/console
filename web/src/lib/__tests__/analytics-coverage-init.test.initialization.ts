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

