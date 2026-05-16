import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock all external dependencies so the module loads cleanly
// ---------------------------------------------------------------------------

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
  isNetlifyDeployment: false,
}))

vi.mock('../chunkErrors', () => ({
  CHUNK_RELOAD_TS_KEY: 'kc-chunk-reload-ts',
  isChunkLoadMessage: vi.fn(() => false),
}))

vi.mock('../constants', () => ({
  STORAGE_KEY_ANALYTICS_OPT_OUT: 'kc-analytics-opt-out',
}))

vi.mock('../analytics-session', () => ({
  isAutomatedEnvironment: vi.fn(() => false),
  isOptedOut: vi.fn(() => false),
  getDeploymentType: vi.fn(() => 'development'),
  getClientId: vi.fn(() => 'test-client-id'),
  getSession: vi.fn(() => ({ sid: 'test-sid', sc: 'start', seq: 1, pages: 1, engaged: false })),
  peekEngagementMs: vi.fn(() => 0),
  peekSessionEngagementMs: vi.fn(() => 0),
  getAndResetEngagementMs: vi.fn(() => 0),
  resetSessionEngagement: vi.fn(),
  incrementSessionPageViewCount: vi.fn(),
  getSessionPageViewCount: vi.fn(() => 1),
  startEngagementTracking: vi.fn(),
  stopEngagementTracking: vi.fn(),
  hashUserId: vi.fn((id: string) => `hashed-${id}`),
  getOrCreateAnonymousId: vi.fn(() => 'anon-id'),
  _loadUtmParams: vi.fn(),
  getUtmParams: vi.fn(() => ({})),
  rand: vi.fn(() => 'rand123'),
  CID_KEY: 'kc-cid',
  SID_KEY: 'kc-sid',
  SC_KEY: 'kc-sc',
  LAST_KEY: 'kc-last',
}))

import {
  __testables,
  _resetCapturedApiCalls,
  _resetCapturedErrors,
  _resetErrorThrottles,
  _resetAnalyticsState,
  emitError,
  emitHttpError,
  emitPageView,
  getRecentBrowserErrors,
  getRecentFailedApiCalls,
  initAnalytics,
  markErrorReported,
  startGlobalErrorTracking,
  stopGlobalErrorTracking,
} from '../analytics-core'

const {
  inferErrorType,
  inferComponentName,
  isBrowserExtensionNoise,
  isBareNetworkNoise,
  isErrorThrottled,
  wasAlreadyReported,
} = __testables

beforeEach(() => {
  stopGlobalErrorTracking()
  _resetCapturedApiCalls()
  _resetCapturedErrors()
  _resetErrorThrottles()
  _resetAnalyticsState()
  ;(window as Window & { umami?: { track?: ReturnType<typeof vi.fn> } }).umami = undefined
})

// ---------------------------------------------------------------------------
// inferErrorType
// ---------------------------------------------------------------------------

describe('inferErrorType', () => {
  it('extracts error.name from Error object', () => {
    const err = new TypeError('something broke')
    expect(inferErrorType('something broke', err)).toBe('TypeError')
  })

  it('ignores generic "Error" name', () => {
    const err = new Error('something')
    expect(inferErrorType('something', err)).toBe('Unknown')
  })

  it('extracts error type from message prefix pattern', () => {
    expect(inferErrorType('SyntaxError: unexpected token')).toBe('SyntaxError')
  })

  it('detects network errors from message fragments', () => {
    expect(inferErrorType('Failed to fetch resource')).toBe('NetworkError')
    expect(inferErrorType('net::ERR_CONNECTION_REFUSED')).toBe('NetworkError')
    expect(inferErrorType('Load failed')).toBe('NetworkError')
  })

  it('returns Unknown for unrecognized messages', () => {
    expect(inferErrorType('something went wrong')).toBe('Unknown')
  })

  it('truncates long error names', () => {
    const err = { name: 'A'.repeat(100) }
    const result = inferErrorType('msg', err)
    expect(result.length).toBeLessThanOrEqual(40)
  })
})

// ---------------------------------------------------------------------------
// inferComponentName
// ---------------------------------------------------------------------------

describe('inferComponentName', () => {
  it('uses cardId when provided', () => {
    expect(inferComponentName('gpu_overview')).toBe('gpu_overview')
  })

  it('extracts component from React componentStack', () => {
    const stack = '\n    in MyComponent (created by App)\n    in div'
    expect(inferComponentName(undefined, stack)).toBe('MyComponent')
  })

  it('extracts filename from error stack (Chromium format)', () => {
    const err = { stack: 'Error\n    at fn (https://host/path/Dashboard.tsx:12:3)' }
    expect(inferComponentName(undefined, undefined, err)).toBe('Dashboard')
  })

  it('returns "unknown" when no info available', () => {
    expect(inferComponentName()).toBe('unknown')
  })

  it('truncates long cardIds', () => {
    const long = 'x'.repeat(200)
    expect(inferComponentName(long)!.length).toBeLessThanOrEqual(60)
  })
})

// ---------------------------------------------------------------------------
// isBrowserExtensionNoise
// ---------------------------------------------------------------------------

describe('isBrowserExtensionNoise', () => {
  it('detects MetaMask errors', () => {
    expect(isBrowserExtensionNoise('MetaMask: something failed', undefined)).toBe(true)
  })

  it('detects ethereum errors', () => {
    expect(isBrowserExtensionNoise('ethereum provider not found', undefined)).toBe(true)
  })

  it('detects chrome-extension stack frames', () => {
    const reason = { stack: 'Error\n    at chrome-extension://abc/script.js:1:1' }
    expect(isBrowserExtensionNoise('unknown', reason)).toBe(true)
  })

  it('detects moz-extension stack frames', () => {
    const reason = { stack: 'Error\n    at moz-extension://abc/script.js:1:1' }
    expect(isBrowserExtensionNoise('unknown', reason)).toBe(true)
  })

  it('returns false for app errors', () => {
    expect(isBrowserExtensionNoise('Cannot read property x', { stack: 'at App.tsx:1' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isBareNetworkNoise
// ---------------------------------------------------------------------------

describe('isBareNetworkNoise', () => {
  it('filters bare "Failed to fetch"', () => {
    expect(isBareNetworkNoise('Failed to fetch')).toBe(true)
  })

  it('filters bare "NetworkError"', () => {
    expect(isBareNetworkNoise('NetworkError when attempting to fetch resource')).toBe(true)
  })

  it('does NOT filter chunk-load failures containing strict chunk indicators', () => {
    expect(isBareNetworkNoise('Failed to fetch dynamically imported module: /assets/Foo.js')).toBe(false)
  })

  it('returns false for non-network messages', () => {
    expect(isBareNetworkNoise('TypeError: Cannot read property')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isErrorThrottled
// ---------------------------------------------------------------------------

describe('isErrorThrottled', () => {
  it('allows the first error emission', () => {
    expect(isErrorThrottled('runtime', '/dashboard')).toBe(false)
  })

  it('throttles duplicate category+page within window', () => {
    isErrorThrottled('runtime', '/dashboard')
    expect(isErrorThrottled('runtime', '/dashboard')).toBe(true)
  })

  it('allows different categories on same page', () => {
    isErrorThrottled('runtime', '/dashboard')
    expect(isErrorThrottled('card_render', '/dashboard')).toBe(false)
  })

  it('allows same category on different pages', () => {
    isErrorThrottled('runtime', '/dashboard')
    expect(isErrorThrottled('runtime', '/clusters')).toBe(false)
  })

  it('distinguishes by cardId', () => {
    isErrorThrottled('card_render', '/dashboard', 'gpu_overview')
    expect(isErrorThrottled('card_render', '/dashboard', 'cluster_health')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// markErrorReported / wasAlreadyReported
// ---------------------------------------------------------------------------

describe('markErrorReported / wasAlreadyReported', () => {
  it('marks and detects reported errors', () => {
    markErrorReported('test error message')
    expect(wasAlreadyReported('test error message')).toBe(true)
  })

  it('returns false for unreported errors', () => {
    expect(wasAlreadyReported('never seen this')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// public emitters / buffers
// ---------------------------------------------------------------------------

describe('emitPageView', () => {
  it('emits page_view after init + first user interaction', () => {
    const track = vi.fn()
    ;(window as Window & { umami?: { track?: ReturnType<typeof vi.fn> } }).umami = { track }

    initAnalytics()
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    emitPageView('/clusters')

    expect(track).toHaveBeenCalledWith(
      'page_view',
      expect.objectContaining({ page_path: '/clusters', ksc_demo_mode: 'false' }),
    )
  })
})

describe('emitHttpError / failed API ring buffer', () => {
  it('records failed API calls for feedback payloads', () => {
    emitHttpError('500', 'upstream 500 while fetching clusters')
    const calls = getRecentFailedApiCalls()
    expect(calls.length).toBe(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      status: '500',
      endpoint: window.location.pathname,
    }))
  })

  it('truncates long API error detail to 500 chars', () => {
    emitHttpError('502', 'x'.repeat(700))
    const calls = getRecentFailedApiCalls()
    expect(calls[0].detail?.length).toBe(500)
  })
})

describe('emitError', () => {
  it('emits ksc_error with inferred dimensions', () => {
    const track = vi.fn()
    ;(window as Window & { umami?: { track?: ReturnType<typeof vi.fn> } }).umami = { track }

    initAnalytics()
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    emitError('runtime', 'TypeError: boom', 'gpu_overview', {
      error: new TypeError('boom'),
      componentStack: '\n    in GpuCard (created by App)',
      pathname: '/clusters',
    })

    expect(track).toHaveBeenCalledWith(
      'ksc_error',
      expect.objectContaining({
        error_code: 'runtime',
        error_type: 'TypeError',
        component_name: 'gpu_overview',
        card_id: 'gpu_overview',
        card_type: 'gpu_overview',
      }),
    )
  })
})

describe('startGlobalErrorTracking / getRecentBrowserErrors', () => {
  it('captures console.error and console.warn entries', () => {
    startGlobalErrorTracking()
    console.error('console error sample')
    console.warn('console warn sample')

    const entries = getRecentBrowserErrors()
    expect(entries.some((e) => e.source === 'console.error' && e.message.includes('console error sample'))).toBe(true)
    expect(entries.some((e) => e.source === 'console.warn' && e.message.includes('console warn sample'))).toBe(true)
  })

  it('returns a copy of the ring buffer', () => {
    startGlobalErrorTracking()
    console.error('copy-check')

    const snapshot = getRecentBrowserErrors()
    snapshot.length = 0

    expect(getRecentBrowserErrors().length).toBeGreaterThan(0)
  })
})
