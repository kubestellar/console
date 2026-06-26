/**
 * Direct coverage tests for analytics-engine.ts
 *
 * Targets:
 * - updateAnalyticsIds: ga4MeasurementId, umamiWebsiteId, partial updates
 * - captureUtmParams: sends ksc_utm_landing when params present, no-op otherwise
 * - initAnalytics: gating (no measurementId, already initialized, automated env),
 *   successful init flow (setInitialized, interaction listeners, etc.)
 * - setAnalyticsUserId: hashes real uid vs anonymous fallback for demo-user
 * - setAnalyticsUserProperties: merges props and syncs
 * - emitPageView: flushes engagement, advances pageId, sends page_view
 * - _resetAnalyticsState: resets core, provider, error state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Shared controllable state ──────────────────────────────────────

let mockInitialized = false
let mockUserHasInteracted = false
let mockAnalyticsScriptsLoaded = false
let mockGtagMeasurementId = ''
let mockUmamiWebsiteId = ''
let mockIsDemoMode = false
let mockIsAutomatedEnv = false
let mockUtmParams: Record<string, string> | null = null

const mockSetInitialized = vi.fn((v: boolean) => { mockInitialized = v })
const mockSetUserHasInteracted = vi.fn((v: boolean) => { mockUserHasInteracted = v })
const mockSetAnalyticsScriptsLoaded = vi.fn((v: boolean) => { mockAnalyticsScriptsLoaded = v })
const mockSetGtagMeasurementId = vi.fn((v: string) => { mockGtagMeasurementId = v })
const mockSetUmamiWebsiteId = vi.fn((v: string) => { mockUmamiWebsiteId = v })
const mockSetMeasurementId = vi.fn()
const mockSetPageId = vi.fn()
const mockSetUserId = vi.fn()
const mockReplaceUserProperties = vi.fn()
const mockMergeUserProperties = vi.fn()
const mockResetAnalyticsCoreState = vi.fn()
const mockConsumeRecoveryEvent = vi.fn().mockReturnValue(null)
const MOCK_INTERACTION_GATE_EVENTS = ['mousedown', 'keydown', 'scroll']
const MOCK_DEFAULT_PROXY_MEASUREMENT_ID = 'G-PROXY-TEST'

vi.mock('../analytics-core-state', () => ({
  get initialized() { return mockInitialized },
  get userHasInteracted() { return mockUserHasInteracted },
  get analyticsScriptsLoaded() { return mockAnalyticsScriptsLoaded },
  get gtagMeasurementId() { return mockGtagMeasurementId },
  get umamiWebsiteId() { return mockUmamiWebsiteId },
  INTERACTION_GATE_EVENTS: MOCK_INTERACTION_GATE_EVENTS,
  DEFAULT_PROXY_MEASUREMENT_ID: MOCK_DEFAULT_PROXY_MEASUREMENT_ID,
  setInitialized: (...args: unknown[]) => mockSetInitialized(...args as [boolean]),
  setUserHasInteracted: (...args: unknown[]) => mockSetUserHasInteracted(...args as [boolean]),
  setAnalyticsScriptsLoaded: (...args: unknown[]) => mockSetAnalyticsScriptsLoaded(...args as [boolean]),
  setGtagMeasurementId: (...args: unknown[]) => mockSetGtagMeasurementId(...args as [string]),
  setUmamiWebsiteId: (...args: unknown[]) => mockSetUmamiWebsiteId(...args as [string]),
  setMeasurementId: (...args: unknown[]) => mockSetMeasurementId(...args),
  setPageId: (...args: unknown[]) => mockSetPageId(...args),
  setUserId: (...args: unknown[]) => mockSetUserId(...args),
  replaceUserProperties: (...args: unknown[]) => mockReplaceUserProperties(...args),
  mergeUserProperties: (...args: unknown[]) => mockMergeUserProperties(...args),
  resetAnalyticsCoreState: () => mockResetAnalyticsCoreState(),
  consumePendingRecoveryEvent: () => mockConsumeRecoveryEvent(),
  syncAnalyticsUserId: vi.fn(),
  syncAnalyticsUserProperties: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  get isDemoMode() { return () => mockIsDemoMode },
}))

vi.mock('../analytics-session', () => ({
  isAutomatedEnvironment: () => mockIsAutomatedEnv,
  _loadUtmParams: () => mockUtmParams,
  getDeploymentType: () => 'cloud',
  getOrCreateAnonymousId: () => 'anon-id-123',
  hashUserId: (uid: string) => Promise.resolve(`hashed:${uid}`),
  rand: () => 'rand-page-id',
  startEngagementTracking: vi.fn(),
}))

const sentEvents: Array<{ name: string; params?: unknown }> = []
const mockEmitUserEngagement = vi.fn()

vi.mock('../analytics-dispatch', () => ({
  send: (name: string, params?: unknown) => { sentEvents.push({ name, params }) },
  emitUserEngagement: () => mockEmitUserEngagement(),
}))

vi.mock('../analytics-errors', () => ({
  startGlobalErrorTracking: vi.fn(),
  resetAnalyticsErrorState: vi.fn(),
}))

const mockLoadProviders = vi.fn()
const mockResetProviderState = vi.fn()
const mockSyncUserId = vi.fn()
const mockSyncUserProperties = vi.fn()

vi.mock('../analytics-providers', () => ({
  loadAnalyticsProviders: () => mockLoadProviders(),
  resetAnalyticsProviderState: () => mockResetProviderState(),
  syncAnalyticsUserId: () => mockSyncUserId(),
  syncAnalyticsUserProperties: (...args: unknown[]) => mockSyncUserProperties(...args),
}))

// ── Helpers ────────────────────────────────────────────────────────

type EngineModule = typeof import('../analytics-engine')

async function freshImport(): Promise<EngineModule> {
  vi.resetModules()
  return import('../analytics-engine') as Promise<EngineModule>
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockInitialized = false
  mockUserHasInteracted = false
  mockAnalyticsScriptsLoaded = false
  mockGtagMeasurementId = ''
  mockUmamiWebsiteId = ''
  mockIsDemoMode = false
  mockIsAutomatedEnv = false
  mockUtmParams = null
  sentEvents.length = 0
  vi.clearAllMocks()
  mockConsumeRecoveryEvent.mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// updateAnalyticsIds
// ============================================================================

describe('updateAnalyticsIds', () => {
  it('sets ga4MeasurementId when provided', async () => {
    const { updateAnalyticsIds } = await freshImport()
    updateAnalyticsIds({ ga4MeasurementId: 'G-12345' })
    expect(mockSetGtagMeasurementId).toHaveBeenCalledWith('G-12345')
  })

  it('sets umamiWebsiteId when provided', async () => {
    const { updateAnalyticsIds } = await freshImport()
    updateAnalyticsIds({ umamiWebsiteId: 'umami-abc' })
    expect(mockSetUmamiWebsiteId).toHaveBeenCalledWith('umami-abc')
  })

  it('is a no-op for absent ids', async () => {
    const { updateAnalyticsIds } = await freshImport()
    updateAnalyticsIds({})
    expect(mockSetGtagMeasurementId).not.toHaveBeenCalled()
    expect(mockSetUmamiWebsiteId).not.toHaveBeenCalled()
  })
})

// ============================================================================
// captureUtmParams
// ============================================================================

describe('captureUtmParams', () => {
  it('sends ksc_utm_landing when UTM params are present', async () => {
    mockUtmParams = { utm_source: 'github', utm_medium: 'readme' }
    mockInitialized = true
    mockUserHasInteracted = true
    const { captureUtmParams } = await freshImport()
    captureUtmParams()
    expect(sentEvents.find(e => e.name === 'ksc_utm_landing')).toBeTruthy()
  })

  it('is a no-op when no UTM params', async () => {
    mockUtmParams = null
    const { captureUtmParams } = await freshImport()
    captureUtmParams()
    expect(sentEvents.find(e => e.name === 'ksc_utm_landing')).toBeUndefined()
  })
})

// ============================================================================
// initAnalytics
// ============================================================================

describe('initAnalytics', () => {
  it('calls setMeasurementId and setInitialized on fresh init', async () => {
    mockInitialized = false
    mockIsAutomatedEnv = false
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(mockSetMeasurementId).toHaveBeenCalled()
    expect(mockSetInitialized).toHaveBeenCalledWith(true)
  })

  it('skips when already initialized', async () => {
    mockInitialized = true
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(mockSetInitialized).not.toHaveBeenCalled()
  })

  it('skips in automated environment (CI/WebDriver)', async () => {
    mockIsAutomatedEnv = true
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(mockSetInitialized).not.toHaveBeenCalled()
  })

  it('registers interaction gate event listeners', async () => {
    mockInitialized = false
    const addSpy = vi.spyOn(document, 'addEventListener')
    const { initAnalytics } = await freshImport()
    initAnalytics()
    const registeredEvents = addSpy.mock.calls.map(([evt]) => evt)
    for (const evt of MOCK_INTERACTION_GATE_EVENTS) {
      expect(registeredEvents).toContain(evt)
    }
  })

  it('calls replaceUserProperties with deployment type and demo_mode', async () => {
    mockInitialized = false
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(mockReplaceUserProperties).toHaveBeenCalledWith(
      expect.objectContaining({ deployment_type: 'cloud', demo_mode: 'false' })
    )
  })

  it('reflects demo mode in user properties', async () => {
    mockInitialized = false
    mockIsDemoMode = true
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(mockReplaceUserProperties).toHaveBeenCalledWith(
      expect.objectContaining({ demo_mode: 'true' })
    )
  })

  it('registers beforeunload listener for engagement flush', async () => {
    mockInitialized = false
    const addSpy = vi.spyOn(window, 'addEventListener')
    const { initAnalytics } = await freshImport()
    initAnalytics()
    expect(addSpy.mock.calls.some(([evt]) => evt === 'beforeunload')).toBe(true)
  })
})

// ============================================================================
// setAnalyticsUserId
// ============================================================================

describe('setAnalyticsUserId', () => {
  it('hashes real user ID', async () => {
    const { setAnalyticsUserId } = await freshImport()
    await setAnalyticsUserId('real-user@example.com')
    expect(mockSetUserId).toHaveBeenCalledWith('hashed:real-user@example.com')
  })

  it('substitutes anonymous ID when uid is "demo-user"', async () => {
    const { setAnalyticsUserId } = await freshImport()
    await setAnalyticsUserId('demo-user')
    expect(mockSetUserId).toHaveBeenCalledWith('hashed:anon-id-123')
  })

  it('substitutes anonymous ID when uid is empty string', async () => {
    const { setAnalyticsUserId } = await freshImport()
    await setAnalyticsUserId('')
    expect(mockSetUserId).toHaveBeenCalledWith('hashed:anon-id-123')
  })
})

// ============================================================================
// setAnalyticsUserProperties
// ============================================================================

describe('setAnalyticsUserProperties', () => {
  it('merges properties and syncs with providers', async () => {
    const { setAnalyticsUserProperties } = await freshImport()
    setAnalyticsUserProperties({ cluster_count: '3', role: 'admin' })
    expect(mockMergeUserProperties).toHaveBeenCalledWith({ cluster_count: '3', role: 'admin' })
    expect(mockSyncUserProperties).toHaveBeenCalled()
  })
})

// ============================================================================
// emitPageView
// ============================================================================

describe('emitPageView', () => {
  it('flushes engagement, advances pageId, and sends page_view', async () => {
    mockInitialized = true
    mockUserHasInteracted = true
    const { emitPageView } = await freshImport()
    emitPageView('/clusters')
    expect(mockEmitUserEngagement).toHaveBeenCalledOnce()
    expect(mockSetPageId).toHaveBeenCalled()
    const evt = sentEvents.find(e => e.name === 'page_view')
    expect(evt).toBeTruthy()
    expect((evt!.params as Record<string, unknown>).page_path).toBe('/clusters')
  })

  it('includes ksc_demo_mode flag', async () => {
    mockIsDemoMode = true
    mockInitialized = true
    mockUserHasInteracted = true
    const { emitPageView } = await freshImport()
    emitPageView('/dashboard')
    const evt = sentEvents.find(e => e.name === 'page_view')
    expect((evt!.params as Record<string, unknown>).ksc_demo_mode).toBe('true')
  })
})

// ============================================================================
// _resetAnalyticsState
// ============================================================================

describe('_resetAnalyticsState', () => {
  it('resets core, provider, and error state', async () => {
    const { _resetAnalyticsState } = await freshImport()
    _resetAnalyticsState()
    expect(mockResetAnalyticsCoreState).toHaveBeenCalledOnce()
    expect(mockResetProviderState).toHaveBeenCalledOnce()
  })
})
