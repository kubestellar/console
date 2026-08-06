/**
 * Unit coverage for analytics-engine.ts.
 *
 * The engine module glues together `analytics-core-state`, `analytics-session`,
 * `analytics-dispatch`, `analytics-providers`, and `analytics-errors`. Tests
 * verify the public behaviour of each exported function by mocking the
 * dependency modules and asserting on their observable side effects (mock
 * calls, state mutations).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before the mocked-module imports.
// ---------------------------------------------------------------------------
const {
  mockIsDemoMode,
  mockLoadUtmParams,
  mockGetDeploymentType,
  mockGetOrCreateAnonymousId,
  mockHashUserId,
  mockIsAutomatedEnvironment,
  mockRand,
  mockStartEngagementTracking,
  mockSend,
  mockEmitUserEngagement,
  mockStartGlobalErrorTracking,
  mockResetAnalyticsErrorState,
  mockLoadAnalyticsProviders,
  mockResetAnalyticsProviderState,
  mockSyncAnalyticsUserId,
  mockSyncAnalyticsUserProperties,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockLoadUtmParams: vi.fn(() => null as Record<string, string> | null),
  mockGetDeploymentType: vi.fn(() => 'hosted'),
  mockGetOrCreateAnonymousId: vi.fn(() => 'anon-abc'),
  mockHashUserId: vi.fn(async (uid: string) => `hashed:${uid}`),
  mockIsAutomatedEnvironment: vi.fn(() => false),
  mockRand: vi.fn(() => '42'),
  mockStartEngagementTracking: vi.fn(),
  mockSend: vi.fn(),
  mockEmitUserEngagement: vi.fn(),
  mockStartGlobalErrorTracking: vi.fn(),
  mockResetAnalyticsErrorState: vi.fn(),
  mockLoadAnalyticsProviders: vi.fn(),
  mockResetAnalyticsProviderState: vi.fn(),
  mockSyncAnalyticsUserId: vi.fn(),
  mockSyncAnalyticsUserProperties: vi.fn(),
}))

vi.mock('./demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('./analytics-session', () => ({
  _loadUtmParams: () => mockLoadUtmParams(),
  getDeploymentType: () => mockGetDeploymentType(),
  getOrCreateAnonymousId: () => mockGetOrCreateAnonymousId(),
  hashUserId: (uid: string) => mockHashUserId(uid),
  isAutomatedEnvironment: () => mockIsAutomatedEnvironment(),
  rand: () => mockRand(),
  startEngagementTracking: (fn: () => void) => mockStartEngagementTracking(fn),
}))

vi.mock('./analytics-dispatch', () => ({
  send: (name: string, params?: unknown) => mockSend(name, params),
  emitUserEngagement: () => mockEmitUserEngagement(),
}))

vi.mock('./analytics-errors', () => ({
  startGlobalErrorTracking: () => mockStartGlobalErrorTracking(),
  resetAnalyticsErrorState: () => mockResetAnalyticsErrorState(),
}))

vi.mock('./analytics-providers', () => ({
  loadAnalyticsProviders: () => mockLoadAnalyticsProviders(),
  resetAnalyticsProviderState: () => mockResetAnalyticsProviderState(),
  syncAnalyticsUserId: () => mockSyncAnalyticsUserId(),
  syncAnalyticsUserProperties: (props: Record<string, string>) =>
    mockSyncAnalyticsUserProperties(props),
}))

// ---------------------------------------------------------------------------
// Imports under test — must come after the vi.mock() calls above.
// ---------------------------------------------------------------------------
import {
  _resetAnalyticsState,
  captureUtmParams,
  emitPageView,
  initAnalytics,
  setAnalyticsUserId,
  setAnalyticsUserProperties,
  updateAnalyticsIds,
} from './analytics-engine'
import {
  DEFAULT_GTAG_MEASUREMENT_ID,
  DEFAULT_UMAMI_WEBSITE_ID,
  gtagMeasurementId,
  initialized,
  umamiWebsiteId,
  userProperties,
} from './analytics-core-state'

// ---------------------------------------------------------------------------
// Shared reset — put every mock back to defaults between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  _resetAnalyticsState()
  mockIsDemoMode.mockReset().mockReturnValue(false)
  mockLoadUtmParams.mockReset().mockReturnValue(null)
  mockGetDeploymentType.mockReset().mockReturnValue('hosted')
  mockGetOrCreateAnonymousId.mockReset().mockReturnValue('anon-abc')
  mockHashUserId.mockReset().mockImplementation(async (uid: string) => `hashed:${uid}`)
  mockIsAutomatedEnvironment.mockReset().mockReturnValue(false)
  mockRand.mockReset().mockReturnValue('42')
  mockStartEngagementTracking.mockReset()
  mockSend.mockReset()
  mockEmitUserEngagement.mockReset()
  mockStartGlobalErrorTracking.mockReset()
  mockResetAnalyticsErrorState.mockReset()
  mockLoadAnalyticsProviders.mockReset()
  mockResetAnalyticsProviderState.mockReset()
  mockSyncAnalyticsUserId.mockReset()
  mockSyncAnalyticsUserProperties.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// updateAnalyticsIds
// ---------------------------------------------------------------------------
describe('updateAnalyticsIds', () => {
  it('applies the ga4 override', () => {
    updateAnalyticsIds({ ga4MeasurementId: 'G-NEW' })
    expect(gtagMeasurementId).toBe('G-NEW')
  })

  it('applies the umami override', () => {
    updateAnalyticsIds({ umamiWebsiteId: 'umami-xyz' })
    expect(umamiWebsiteId).toBe('umami-xyz')
  })

  it('applies both overrides in one call', () => {
    updateAnalyticsIds({ ga4MeasurementId: 'G-BOTH', umamiWebsiteId: 'umami-both' })
    expect(gtagMeasurementId).toBe('G-BOTH')
    expect(umamiWebsiteId).toBe('umami-both')
  })

  it('is a no-op when neither id is provided', () => {
    updateAnalyticsIds({})
    expect(gtagMeasurementId).toBe(DEFAULT_GTAG_MEASUREMENT_ID)
    expect(umamiWebsiteId).toBe(DEFAULT_UMAMI_WEBSITE_ID)
  })

  it('ignores empty-string values (treated as falsy)', () => {
    updateAnalyticsIds({ ga4MeasurementId: '', umamiWebsiteId: '' })
    expect(gtagMeasurementId).toBe(DEFAULT_GTAG_MEASUREMENT_ID)
    expect(umamiWebsiteId).toBe(DEFAULT_UMAMI_WEBSITE_ID)
  })
})

// ---------------------------------------------------------------------------
// captureUtmParams
// ---------------------------------------------------------------------------
describe('captureUtmParams', () => {
  it('emits ksc_utm_landing when UTM params are present', () => {
    mockLoadUtmParams.mockReturnValue({ utm_source: 'twitter', utm_campaign: 'launch' })
    captureUtmParams()
    expect(mockSend).toHaveBeenCalledWith('ksc_utm_landing', {
      utm_source: 'twitter',
      utm_campaign: 'launch',
    })
  })

  it('does nothing when no UTM params are captured', () => {
    mockLoadUtmParams.mockReturnValue(null)
    captureUtmParams()
    expect(mockSend).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// initAnalytics
// ---------------------------------------------------------------------------
describe('initAnalytics', () => {
  it('bails out early inside an automated environment', () => {
    mockIsAutomatedEnvironment.mockReturnValue(true)
    initAnalytics()
    expect(initialized).toBe(false)
    expect(mockStartGlobalErrorTracking).not.toHaveBeenCalled()
  })

  it('initialises core state and installs listeners in a real environment', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const windowAddSpy = vi.spyOn(window, 'addEventListener')
    initAnalytics()
    expect(initialized).toBe(true)
    expect(mockStartGlobalErrorTracking).toHaveBeenCalledTimes(1)
    expect(windowAddSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    // At least one interaction-gate listener should be registered.
    const interactionEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    const registered = addSpy.mock.calls.map(c => c[0] as string)
    for (const evt of interactionEvents) {
      expect(registered).toContain(evt)
    }
  })

  it('replaces user properties with deployment metadata and (when available) timezone', () => {
    mockGetDeploymentType.mockReturnValue('self-hosted')
    initAnalytics()
    expect(userProperties.deployment_type).toBe('self-hosted')
    expect(userProperties.demo_mode).toBe('false')
    // Timezone may or may not exist depending on the environment. When it does
    // it should be a non-empty string.
    if ('timezone' in userProperties) {
      expect(typeof userProperties.timezone).toBe('string')
      expect(userProperties.timezone.length).toBeGreaterThan(0)
    }
  })

  it('records demo_mode="true" when isDemoMode() is true', () => {
    mockIsDemoMode.mockReturnValue(true)
    initAnalytics()
    expect(userProperties.demo_mode).toBe('true')
  })

  it('is idempotent — second call is a no-op once initialized', () => {
    initAnalytics()
    const providerCallsBefore = mockStartGlobalErrorTracking.mock.calls.length
    initAnalytics()
    expect(mockStartGlobalErrorTracking.mock.calls.length).toBe(providerCallsBefore)
  })

  it('captures UTM params and forwards them as ksc_utm_landing', () => {
    mockLoadUtmParams.mockReturnValue({ utm_source: 'newsletter' })
    initAnalytics()
    expect(mockSend).toHaveBeenCalledWith('ksc_utm_landing', { utm_source: 'newsletter' })
  })

  it('tolerates Intl throwing when resolving the timezone', () => {
    const original = Intl.DateTimeFormat
    // Force resolvedOptions to throw so the try/catch swallows it.
    // @ts-expect-error — deliberately break Intl for this test.
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => { throw new Error('boom') } }
    }
    try {
      expect(() => initAnalytics()).not.toThrow()
      expect(userProperties.deployment_type).toBe('hosted')
      expect(userProperties.timezone).toBeUndefined()
    } finally {
      Intl.DateTimeFormat = original
    }
  })
})

// ---------------------------------------------------------------------------
// setAnalyticsUserId
// ---------------------------------------------------------------------------
describe('setAnalyticsUserId', () => {
  it('hashes and syncs a real user id', async () => {
    await setAnalyticsUserId('alice@example.com')
    expect(mockHashUserId).toHaveBeenCalledWith('alice@example.com')
    expect(mockSyncAnalyticsUserId).toHaveBeenCalledTimes(1)
  })

  it('substitutes the anonymous id when the caller passes an empty uid', async () => {
    await setAnalyticsUserId('')
    expect(mockGetOrCreateAnonymousId).toHaveBeenCalledTimes(1)
    expect(mockHashUserId).toHaveBeenCalledWith('anon-abc')
  })

  it('substitutes the anonymous id for the sentinel "demo-user"', async () => {
    await setAnalyticsUserId('demo-user')
    expect(mockGetOrCreateAnonymousId).toHaveBeenCalledTimes(1)
    expect(mockHashUserId).toHaveBeenCalledWith('anon-abc')
  })
})

// ---------------------------------------------------------------------------
// setAnalyticsUserProperties
// ---------------------------------------------------------------------------
describe('setAnalyticsUserProperties', () => {
  it('merges into shared state and forwards to providers', () => {
    setAnalyticsUserProperties({ role: 'admin' })
    expect(userProperties.role).toBe('admin')
    expect(mockSyncAnalyticsUserProperties).toHaveBeenCalledWith({ role: 'admin' })
  })

  it('preserves existing keys across successive calls', () => {
    setAnalyticsUserProperties({ role: 'admin' })
    setAnalyticsUserProperties({ team: 'platform' })
    expect(userProperties.role).toBe('admin')
    expect(userProperties.team).toBe('platform')
  })

  it('overwrites the value for a repeated key', () => {
    setAnalyticsUserProperties({ role: 'admin' })
    setAnalyticsUserProperties({ role: 'viewer' })
    expect(userProperties.role).toBe('viewer')
  })
})

// ---------------------------------------------------------------------------
// emitPageView
// ---------------------------------------------------------------------------
describe('emitPageView', () => {
  it('flushes engagement before sending the page_view event', () => {
    const order: string[] = []
    mockEmitUserEngagement.mockImplementation(() => { order.push('engagement') })
    mockSend.mockImplementation((name: string) => { order.push(`send:${name}`) })
    emitPageView('/dashboard')
    expect(order[0]).toBe('engagement')
    expect(order[1]).toBe('send:page_view')
  })

  it('sends the page path and demo_mode flag', () => {
    mockIsDemoMode.mockReturnValue(true)
    emitPageView('/settings')
    expect(mockSend).toHaveBeenCalledWith('page_view', {
      page_path: '/settings',
      ksc_demo_mode: 'true',
    })
  })

  it('reports demo_mode="false" when demo mode is off', () => {
    mockIsDemoMode.mockReturnValue(false)
    emitPageView('/')
    expect(mockSend).toHaveBeenCalledWith('page_view', {
      page_path: '/',
      ksc_demo_mode: 'false',
    })
  })
})

// ---------------------------------------------------------------------------
// _resetAnalyticsState
// ---------------------------------------------------------------------------
describe('_resetAnalyticsState', () => {
  it('resets core, provider, and error state', () => {
    updateAnalyticsIds({ ga4MeasurementId: 'G-DIRTY', umamiWebsiteId: 'dirty' })
    setAnalyticsUserProperties({ role: 'admin' })

    _resetAnalyticsState()

    expect(gtagMeasurementId).toBe(DEFAULT_GTAG_MEASUREMENT_ID)
    expect(umamiWebsiteId).toBe(DEFAULT_UMAMI_WEBSITE_ID)
    expect(userProperties).toEqual({})
    expect(mockResetAnalyticsProviderState).toHaveBeenCalledTimes(1)
    expect(mockResetAnalyticsErrorState).toHaveBeenCalledTimes(1)
  })
})
