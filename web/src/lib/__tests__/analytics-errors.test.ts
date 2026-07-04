import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  __testables,
  markErrorReported,
  getRecentBrowserErrors,
  getRecentFailedApiCalls,
  _resetCapturedErrors,
  _resetCapturedApiCalls,
  _resetErrorThrottles,
  resetAnalyticsErrorState,
} from '../analytics-errors'

const {
  inferErrorType,
  inferComponentName,
  isBrowserExtensionNoise,
  isBareNetworkNoise,
  isErrorThrottled,
  wasAlreadyReported,
} = __testables

beforeEach(() => {
  resetAnalyticsErrorState()
})

// ---------------------------------------------------------------------------
// inferErrorType
// ---------------------------------------------------------------------------
describe('inferErrorType', () => {
  it('returns error.name when present and not generic "Error"', () => {
    const err = new TypeError('bad input')
    expect(inferErrorType('bad input', err)).toBe('TypeError')
  })

  it('returns "Unknown" for generic Error name', () => {
    const err = new Error('something broke')
    expect(inferErrorType('something broke', err)).toBe('Unknown')
  })

  it('extracts error type from "TypeNameError: detail" prefix in message', () => {
    expect(inferErrorType('ReferenceError: x is not defined')).toBe('ReferenceError')
  })

  it('returns "NetworkError" for network error fragments', () => {
    expect(inferErrorType('Failed to fetch')).toBe('NetworkError')
    expect(inferErrorType('net::ERR_CONNECTION_REFUSED')).toBe('NetworkError')
    expect(inferErrorType('Load failed')).toBe('NetworkError')
  })

  it('returns "Unknown" for unrecognized messages without error object', () => {
    expect(inferErrorType('something went wrong')).toBe('Unknown')
  })

  it('truncates long error names to max length', () => {
    const err = { name: 'A'.repeat(100) }
    const result = inferErrorType('detail', err)
    expect(result.length).toBeLessThanOrEqual(40)
  })

  it('prefers error.name over message prefix', () => {
    const err = { name: 'CustomError' }
    expect(inferErrorType('TypeError: nope', err)).toBe('CustomError')
  })
})

// ---------------------------------------------------------------------------
// inferComponentName
// ---------------------------------------------------------------------------
describe('inferComponentName', () => {
  it('returns cardId when provided', () => {
    expect(inferComponentName('my-card')).toBe('my-card')
  })

  it('extracts component name from React component stack', () => {
    const stack = '\n    in MyComponent (at App.tsx:10)\n    in App'
    expect(inferComponentName(undefined, stack)).toBe('MyComponent')
  })

  it('extracts file basename from error stack trace', () => {
    const err = { stack: 'Error\n    at Object.<anonymous> (/src/components/Dashboard.tsx:42:5)' }
    expect(inferComponentName(undefined, undefined, err)).toBe('Dashboard')
  })

  it('falls back to pathname segment', () => {
    expect(inferComponentName(undefined, undefined, undefined, '/settings/profile')).toBe('settings')
  })

  it('returns "dashboard" for root pathname', () => {
    expect(inferComponentName(undefined, undefined, undefined, '/')).toBe('dashboard')
  })

  it('returns "unknown" when no info available', () => {
    expect(inferComponentName()).toBe('unknown')
  })

  it('truncates long cardId to max length', () => {
    const longId = 'x'.repeat(100)
    const result = inferComponentName(longId)
    expect(result.length).toBeLessThanOrEqual(60)
  })

  it('prefers cardId over all other sources', () => {
    const stack = '\n    in OtherComponent'
    expect(inferComponentName('my-card', stack, { stack: 'at File.tsx:1' }, '/page')).toBe('my-card')
  })
})

// ---------------------------------------------------------------------------
// isBrowserExtensionNoise
// ---------------------------------------------------------------------------
describe('isBrowserExtensionNoise', () => {
  it('returns true for MetaMask messages', () => {
    expect(isBrowserExtensionNoise('MetaMask - RPC Error', null)).toBe(true)
  })

  it('returns true for ethereum/web3 messages', () => {
    expect(isBrowserExtensionNoise('ethereum provider error', null)).toBe(true)
    expect(isBrowserExtensionNoise('web3 not found', null)).toBe(true)
  })

  it('returns true for solana messages', () => {
    expect(isBrowserExtensionNoise('solana wallet error', null)).toBe(true)
  })

  it('returns true for connection errors from extensions', () => {
    expect(isBrowserExtensionNoise('Could not establish connection. Receiving end does not exist', null)).toBe(true)
  })

  it('returns true for chrome-extension stack traces', () => {
    const reason = { stack: 'at chrome-extension://abc123/content.js:1:1' }
    expect(isBrowserExtensionNoise('generic error', reason)).toBe(true)
  })

  it('returns true for moz-extension stack traces', () => {
    const reason = { stack: 'at moz-extension://def456/inject.js:2:3' }
    expect(isBrowserExtensionNoise('generic error', reason)).toBe(true)
  })

  it('returns true for safari-extension stack traces', () => {
    const reason = { stack: 'at safari-extension://ghi/script.js:1:1' }
    expect(isBrowserExtensionNoise('generic error', reason)).toBe(true)
  })

  it('returns false for application errors', () => {
    expect(isBrowserExtensionNoise('TypeError: Cannot read property x', null)).toBe(false)
    expect(isBrowserExtensionNoise('generic error', { stack: 'at /src/app.ts:5:3' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isBareNetworkNoise
// ---------------------------------------------------------------------------
describe('isBareNetworkNoise', () => {
  it('returns true for bare "Failed to fetch"', () => {
    expect(isBareNetworkNoise('Failed to fetch')).toBe(true)
  })

  it('returns true for NetworkError without chunk indicators', () => {
    expect(isBareNetworkNoise('NetworkError when attempting to fetch resource')).toBe(true)
  })

  it('returns false when message contains chunk load indicator', () => {
    expect(isBareNetworkNoise('Failed to fetch dynamically imported module')).toBe(false)
  })

  it('returns false when message contains "Loading chunk"', () => {
    expect(isBareNetworkNoise('Failed to fetch Loading chunk abc.js')).toBe(false)
  })

  it('returns false for non-network messages', () => {
    expect(isBareNetworkNoise('TypeError: x is not a function')).toBe(false)
  })

  it('returns true for net::ERR_ without chunk indicators', () => {
    expect(isBareNetworkNoise('net::ERR_INTERNET_DISCONNECTED')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// wasAlreadyReported / markErrorReported
// ---------------------------------------------------------------------------
describe('wasAlreadyReported / markErrorReported', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for unseen messages', () => {
    expect(wasAlreadyReported('new error')).toBe(false)
  })

  it('returns true after markErrorReported', () => {
    markErrorReported('seen error')
    expect(wasAlreadyReported('seen error')).toBe(true)
  })

  it('expires after dedup window (5s)', () => {
    markErrorReported('temporary error')
    vi.advanceTimersByTime(6_000)
    expect(wasAlreadyReported('temporary error')).toBe(false)
  })

  it('truncates long messages for dedup key', () => {
    const longMsg = 'x'.repeat(200)
    markErrorReported(longMsg)
    // Should still match with the same prefix
    expect(wasAlreadyReported(longMsg)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isErrorThrottled
// ---------------------------------------------------------------------------
describe('isErrorThrottled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false on first call for a category/page', () => {
    expect(isErrorThrottled('render', '/dashboard')).toBe(false)
  })

  it('returns true on immediate repeat for same category/page', () => {
    isErrorThrottled('render', '/dashboard')
    expect(isErrorThrottled('render', '/dashboard')).toBe(true)
  })

  it('allows different categories on same page', () => {
    expect(isErrorThrottled('render', '/dashboard')).toBe(false)
    expect(isErrorThrottled('network', '/dashboard')).toBe(false)
  })

  it('allows same category on different pages', () => {
    expect(isErrorThrottled('render', '/dashboard')).toBe(false)
    expect(isErrorThrottled('render', '/settings')).toBe(false)
  })

  it('un-throttles after 5 minutes', () => {
    isErrorThrottled('render', '/dashboard')
    vi.advanceTimersByTime(300_001)
    expect(isErrorThrottled('render', '/dashboard')).toBe(false)
  })

  it('throttles after MAX_ERRORS_PER_PAGE_SESSION (50) for a page', () => {
    for (let i = 0; i < 50; i++) {
      isErrorThrottled(`cat-${i}`, '/flood-page')
    }
    expect(isErrorThrottled('new-cat', '/flood-page')).toBe(true)
  })

  it('distinguishes by cardId', () => {
    expect(isErrorThrottled('render', '/dashboard', 'card-a')).toBe(false)
    expect(isErrorThrottled('render', '/dashboard', 'card-b')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Ring buffers: getRecentBrowserErrors / getRecentFailedApiCalls
// ---------------------------------------------------------------------------
describe('getRecentBrowserErrors', () => {
  it('returns empty array initially', () => {
    expect(getRecentBrowserErrors()).toEqual([])
  })

  it('returns a copy (not a reference)', () => {
    const a = getRecentBrowserErrors()
    const b = getRecentBrowserErrors()
    expect(a).not.toBe(b)
  })
})

describe('getRecentFailedApiCalls', () => {
  it('returns empty array initially', () => {
    expect(getRecentFailedApiCalls()).toEqual([])
  })

  it('returns a copy (not a reference)', () => {
    const a = getRecentFailedApiCalls()
    const b = getRecentFailedApiCalls()
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// resetAnalyticsErrorState
// ---------------------------------------------------------------------------
describe('resetAnalyticsErrorState', () => {
  it('clears all state without throwing', () => {
    markErrorReported('test')
    expect(() => resetAnalyticsErrorState()).not.toThrow()
    expect(wasAlreadyReported('test')).toBe(false)
  })
})
