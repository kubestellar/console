/**
 * Unit tests for lib/analytics-providers.ts
 *
 * Covers all 5 exported functions:
 *   dispatchAnalyticsEvent, loadAnalyticsProviders,
 *   syncAnalyticsUserId, syncAnalyticsUserProperties,
 *   resetAnalyticsProviderState
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const {
  mockGetAndResetEngagementMs,
  mockGetClientId,
  mockGetSession,
  mockGetSessionPageViewCount,
  mockGetUtmParams,
  mockIncrementSessionPageViewCount,
  mockPeekEngagementMs,
  mockPeekSessionEngagementMs,
  mockResetSessionEngagement,
  mockSetRealMeasurementId,
  mockSetSessionEngaged,
} = vi.hoisted(() => ({
  mockGetAndResetEngagementMs: vi.fn(() => 0),
  mockGetClientId: vi.fn(() => 'test-client-id'),
  mockGetSession: vi.fn(() => ({ sid: 'test-sid', sc: 1, isNew: false })),
  mockGetSessionPageViewCount: vi.fn(() => 1),
  mockGetUtmParams: vi.fn(() => ({})),
  mockIncrementSessionPageViewCount: vi.fn(),
  mockPeekEngagementMs: vi.fn(() => 0),
  mockPeekSessionEngagementMs: vi.fn(() => 0),
  mockResetSessionEngagement: vi.fn(),
  mockSetRealMeasurementId: vi.fn(),
  mockSetSessionEngaged: vi.fn(),
}))

vi.mock('../analytics-session', () => ({
  getAndResetEngagementMs: () => mockGetAndResetEngagementMs(),
  getClientId: () => mockGetClientId(),
  getSession: () => mockGetSession(),
  getSessionPageViewCount: () => mockGetSessionPageViewCount(),
  getUtmParams: () => mockGetUtmParams(),
  incrementSessionPageViewCount: () => mockIncrementSessionPageViewCount(),
  peekEngagementMs: () => mockPeekEngagementMs(),
  peekSessionEngagementMs: () => mockPeekSessionEngagementMs(),
  resetSessionEngagement: () => mockResetSessionEngagement(),
}))

vi.mock('../analytics-core-state', () => ({
  gtagMeasurementId: '',
  measurementId: 'G-TEST123',
  pageId: '/test',
  realMeasurementId: '',
  sessionEngaged: false,
  setRealMeasurementId: (...args: unknown[]) => mockSetRealMeasurementId(...args),
  setSessionEngaged: (...args: unknown[]) => mockSetSessionEngaged(...args),
  umamiWebsiteId: '',
  userId: '',
  userProperties: {},
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------
import {
  dispatchAnalyticsEvent,
  loadAnalyticsProviders,
  syncAnalyticsUserId,
  syncAnalyticsUserProperties,
  resetAnalyticsProviderState,
} from '../analytics-providers'

// ---------------------------------------------------------------------------
// resetAnalyticsProviderState
// ---------------------------------------------------------------------------
describe('resetAnalyticsProviderState', () => {
  it('does not throw', () => {
    expect(() => resetAnalyticsProviderState()).not.toThrow()
  })

  it('calls setRealMeasurementId with empty string', () => {
    resetAnalyticsProviderState()
    expect(mockSetRealMeasurementId).toHaveBeenCalledWith('')
  })

  it('can be called multiple times without error', () => {
    mockSetRealMeasurementId.mockClear()
    resetAnalyticsProviderState()
    resetAnalyticsProviderState()
    resetAnalyticsProviderState()
    expect(mockSetRealMeasurementId).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// loadAnalyticsProviders
// ---------------------------------------------------------------------------
describe('loadAnalyticsProviders', () => {
  it('does not throw when umamiWebsiteId and gtagMeasurementId are both empty', () => {
    // Both are empty strings in the mock (default)
    expect(() => loadAnalyticsProviders()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// syncAnalyticsUserId
// ---------------------------------------------------------------------------
describe('syncAnalyticsUserId', () => {
  it('does not throw when window.gtag is not present', () => {
    // Default: no window.gtag
    expect(() => syncAnalyticsUserId()).not.toThrow()
  })

  it('does not throw when window.gtag is defined but gtagAvailable is false', () => {
    const gtagFn = vi.fn()
    Object.defineProperty(window, 'gtag', {
      value: gtagFn,
      writable: true,
      configurable: true,
    })
    resetAnalyticsProviderState() // gtagAvailable = false
    expect(() => syncAnalyticsUserId()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// syncAnalyticsUserProperties
// ---------------------------------------------------------------------------
describe('syncAnalyticsUserProperties', () => {
  it('does not throw when gtag is not available', () => {
    resetAnalyticsProviderState()
    expect(() => syncAnalyticsUserProperties({ plan: 'free' })).not.toThrow()
  })

  it('accepts empty object', () => {
    resetAnalyticsProviderState()
    expect(() => syncAnalyticsUserProperties({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// dispatchAnalyticsEvent
// ---------------------------------------------------------------------------
describe('dispatchAnalyticsEvent', () => {
  beforeEach(() => {
    resetAnalyticsProviderState()
  })

  it('does not throw for basic event name', () => {
    expect(() => dispatchAnalyticsEvent('page_view')).not.toThrow()
  })

  it('does not throw with params', () => {
    expect(() =>
      dispatchAnalyticsEvent('button_click', { category: 'nav', count: 3 })
    ).not.toThrow()
  })

  it('accepts events before gtag is decided (queues internally)', () => {
    // After reset, gtagDecided = false — events are queued
    resetAnalyticsProviderState()
    expect(() => {
      dispatchAnalyticsEvent('queued_event_1')
      dispatchAnalyticsEvent('queued_event_2', { value: 42 })
    }).not.toThrow()
  })

  it('does not throw when called repeatedly', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => dispatchAnalyticsEvent(`event_${i}`)).not.toThrow()
    }
  })
})
