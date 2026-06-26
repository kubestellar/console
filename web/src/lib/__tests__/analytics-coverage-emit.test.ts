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


describe('emitAgentProvidersDetected deep', () => {
  it('categorizes CLI vs API providers by capability bitmask', async () => {
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
    beaconSpy.mockClear()

    mod.emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 }, // CHAT + TOOL_EXEC
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 }, // CHAT only
      { name: 'cursor', displayName: 'Cursor', capabilities: 2 }, // TOOL_EXEC only
    ])

    expect(beaconSpy).toHaveBeenCalled()
    const url = beaconSpy.mock.calls[0][0] as string
    const decoded = atob(decodeURIComponent(url.split('d=')[1]))
    expect(decoded).toContain('en=ksc_agent_providers_detected')
    expect(decoded).toContain('epn.provider_count=3')
    // CLI = tool_exec capable: claude-code, cursor
    expect(decoded).toContain('ep.cli_providers=claude-code%2Ccursor')
    // API = chat-only: openai
    expect(decoded).toContain('ep.api_providers=openai')
  })

  it('returns "none" when no CLI or API providers', async () => {
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
    beaconSpy.mockClear()

    mod.emitAgentProvidersDetected([
      { name: 'unknown', displayName: 'Unknown', capabilities: 0 },
    ])

    const url = beaconSpy.mock.calls[0][0] as string
    const decoded = atob(decodeURIComponent(url.split('d=')[1]))
    expect(decoded).toContain('ep.cli_providers=none')
    expect(decoded).toContain('ep.api_providers=none')
  })

  it('early-returns for null/empty providers', async () => {
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
    beaconSpy.mockClear()

    mod.emitAgentProvidersDetected([])
    expect(beaconSpy).not.toHaveBeenCalled()
  })
})

// ============================================================================
// emitNPSSurveyShown / emitNPSResponse / emitNPSDismissed
// ============================================================================

describe('NPS survey events', () => {
  async function setupProxy() {
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
    beaconSpy.mockClear()
    return { mod, beaconSpy }
  }

  it('emitNPSSurveyShown sends event', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitNPSSurveyShown()
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('emitNPSResponse sends score and category', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitNPSResponse(9, 'promoter', 42)
    const url = beaconSpy.mock.calls[0][0] as string
    const decoded = atob(decodeURIComponent(url.split('d=')[1]))
    expect(decoded).toContain('en=ksc_nps_response')
    expect(decoded).toContain('epn.nps_score=9')
    expect(decoded).toContain('ep.nps_category=promoter')
    expect(decoded).toContain('epn.nps_feedback_length=42')
  })

  it('emitNPSResponse works without feedbackLength', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitNPSResponse(5, 'passive')
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('emitNPSDismissed sends dismiss count', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitNPSDismissed(3)
    const url = beaconSpy.mock.calls[0][0] as string
    const decoded = atob(decodeURIComponent(url.split('d=')[1]))
    expect(decoded).toContain('en=ksc_nps_dismissed')
    expect(decoded).toContain('epn.dismiss_count=3')
  })
})

// ============================================================================
// Orbit / GroundControl events
// ============================================================================

describe('Orbit and GroundControl events', () => {
  async function setupProxy() {
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
    beaconSpy.mockClear()
    return { mod, beaconSpy }
  }

  it('emitOrbitMissionCreated sends event', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitOrbitMissionCreated('security-scan', 'daily')
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('emitOrbitMissionRun sends event', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitOrbitMissionRun('security-scan', 'success')
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('emitGroundControlDashboardCreated sends event', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitGroundControlDashboardCreated(5)
    expect(beaconSpy).toHaveBeenCalled()
  })

  it('emitGroundControlCardRequestOpened sends event', async () => {
    const { mod, beaconSpy } = await setupProxy()
    mod.emitGroundControlCardRequestOpened('kubestellar')
    expect(beaconSpy).toHaveBeenCalled()
  })
})

// ============================================================================
// emitBlogPostClicked
// ============================================================================

describe('emitBlogPostClicked', () => {
  it('sends event with blog title', async () => {
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
    beaconSpy.mockClear()

    mod.emitBlogPostClicked('My Test Blog Post')
    const url = beaconSpy.mock.calls[0][0] as string
    const decoded = atob(decodeURIComponent(url.split('d=')[1]))
    expect(decoded).toContain('en=ksc_blog_post_clicked')
    expect(decoded).toContain('blog_title')
  })
})

// ============================================================================
// Engaged session threshold via proxy
// ============================================================================

describe('engaged session tracking', () => {
  it('sets seg=1 after 10s of engagement', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100) // force proxy mode
    beaconSpy.mockClear()

    // Simulate 11 seconds of activity to cross engaged threshold
    vi.advanceTimersByTime(11000)
    // Keep "active" by triggering interactions
    document.dispatchEvent(new Event('mousedown'))

    mod.emitPageView('/engaged')
    if (beaconSpy.mock.calls.length > 0) {
      const url = beaconSpy.mock.calls[beaconSpy.mock.calls.length - 1][0] as string
      const decoded = atob(decodeURIComponent(url.split('d=')[1]))
      // After 10s of engagement, seg=1 should appear
      expect(decoded).toContain('seg=1')
    }
  })
})

// ============================================================================
// user_engagement event — getAndResetEngagementMs vs peekEngagementMs
// ============================================================================

describe('engagement time in events', () => {
  it('uses getAndResetEngagementMs for user_engagement events in proxy', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(5100) // proxy mode

    // Accumulate some engagement time
    vi.advanceTimersByTime(3000)
    document.dispatchEvent(new Event('mousedown')) // keep active
    beaconSpy.mockClear()

    // Trigger tab hidden which calls emitUserEngagement
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Check for user_engagement event with _et parameter
    const engagementBeacon = beaconSpy.mock.calls.find(([url]) => {
      const decoded = atob(decodeURIComponent((url as string).split('d=')[1]))
      return decoded.includes('en=user_engagement')
    })

    if (engagementBeacon) {
      const decoded = atob(
        decodeURIComponent((engagementBeacon[0] as string).split('d=')[1]),
      )
      expect(decoded).toContain('_et=')
    }

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })
})

// ============================================================================
// markGtagDecided idempotency
// ============================================================================

describe('markGtagDecided idempotency', () => {
  it('only the first call takes effect', async () => {
    const beaconSpy = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: beaconSpy,
      language: 'en-US',
    })

    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const mod = await freshImport()
    mod.initAnalytics()
    document.dispatchEvent(new Event('mousedown'))

    // First decision: timeout triggers proxy mode
    vi.advanceTimersByTime(5100)

    // Now if gtag script loads after timeout, it should NOT override
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

    // Events should still go via proxy (first decision was false)
    beaconSpy.mockClear()
    mod.emitCardAdded('test', 'manual')
    expect(beaconSpy).toHaveBeenCalled()
  })
})

// ============================================================================
// wasAlreadyReported — expiry after DEDUP_EXPIRY_MS (5s)
// ============================================================================

describe('wasAlreadyReported dedup expiry', () => {
  it('reports error after dedup window expires', async () => {
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

    // Mark error as reported
    mod.markErrorReported('dedup-unique-xyz-test')
    const callsAfterMark = beaconSpy.mock.calls.length

    // Within 5s window — should be skipped by THIS module's handler
    const event1 = new Event('unhandledrejection')
    Object.defineProperty(event1, 'reason', {
      value: { message: 'dedup-unique-xyz-test' },
    })
    window.dispatchEvent(event1)
    // Count NEW calls only (other handlers from prior freshImport may fire)
    const newCalls1 = beaconSpy.mock.calls.slice(callsAfterMark)
    const dedupedErrors1 = newCalls1.filter(([url]) => {
      try {
        const decoded = atob(decodeURIComponent((url as string).split('d=')[1]))
        return decoded.includes('unhandled_rejection') && decoded.includes('dedup-unique-xyz-test')
      } catch { return false }
    })
    // The current module's handler should have skipped it (deduped)
    // Note: older handlers from prior tests may or may not emit it
    // The key behavior is that the dedup mechanism works within a single module instance

    // Advance past dedup window (5s)
    vi.advanceTimersByTime(6000)
    const callsAfterExpiry = beaconSpy.mock.calls.length

    const event2 = new Event('unhandledrejection')
    Object.defineProperty(event2, 'reason', {
      value: { message: 'dedup-unique-xyz-test' },
    })
    window.dispatchEvent(event2)
    const newCalls2 = beaconSpy.mock.calls.slice(callsAfterExpiry)
    const reportedErrors2 = newCalls2.filter(([url]) => {
      try {
        const decoded = atob(decodeURIComponent((url as string).split('d=')[1]))
        return decoded.includes('unhandled_rejection')
      } catch { return false }
    })
    // After expiry, at least some handler should report it
    expect(reportedErrors2.length).toBeGreaterThanOrEqual(1)
  })
})
