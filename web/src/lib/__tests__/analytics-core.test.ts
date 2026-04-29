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
  _resetErrorThrottles,
  _resetAnalyticsState,
  markErrorReported,
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
  _resetErrorThrottles()
  _resetAnalyticsState()
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
