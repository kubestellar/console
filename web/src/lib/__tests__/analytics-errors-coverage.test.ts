/**
 * Direct coverage tests for analytics-errors.ts
 *
 * Targets uncovered paths:
 * - inferErrorType: object.name, regex, NetworkError fragments, fallback
 * - inferComponentName: cardId, componentStack, stack, pathname, fallback
 * - markErrorReported / wasAlreadyReported: dedup window
 * - isBrowserExtensionNoise: extension strings and stack origins
 * - emitHttpError: demo mode, timeout/abort filters, auth filters, throttle
 * - emitError: throttle, rate limit, field mapping
 * - emitChunkReloadRecoveryFailed: sends ksc_chunk_reload_recovery
 * - startGlobalErrorTracking / stopGlobalErrorTracking: event listener lifecycle
 * - console.error / console.warn interception
 * - unhandledrejection: clipboard noise, extension noise, bare network noise,
 *     chunk reload, AbortError, auth errors, 50x fetch, fallthrough
 * - error event handler: Script error skip, extension filename, various noise filters
 * - getRecentBrowserErrors / getRecentFailedApiCalls: ring buffer
 * - _resetCapturedErrors / _resetCapturedApiCalls / _resetErrorThrottles
 * - resetAnalyticsErrorState
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────

let mockIsDemoMode = false
let mockIsNetlifyDeployment = false

vi.mock('../demoMode', () => ({
  get isDemoMode() { return () => mockIsDemoMode },
  get isNetlifyDeployment() { return mockIsNetlifyDeployment },
}))

const sentEvents: Array<{ name: string; params: unknown }> = []

vi.mock('../analytics-dispatch', () => ({
  send: (name: string, params: unknown) => {
    sentEvents.push({ name, params })
  },
}))

vi.mock('../analytics-core-state', () => ({
  initialized: true,
  userHasInteracted: true,
  setPendingRecoveryEvent: vi.fn(),
}))

vi.mock('../chunkErrors', () => ({
  CHUNK_RELOAD_TS_KEY: 'ksc-chunk-reload-ts',
  isChunkLoadMessage: (msg: string) =>
    msg.includes('Loading chunk') || msg.includes('dynamically imported module'),
}))

// ── Helpers ────────────────────────────────────────────────────────

type ErrorsModule = typeof import('../analytics-errors')

async function freshImport(): Promise<ErrorsModule> {
  vi.resetModules()
  return import('../analytics-errors') as Promise<ErrorsModule>
}

// ── Setup / teardown ───────────────────────────────────────────────

beforeEach(() => {
  mockIsDemoMode = false
  mockIsNetlifyDeployment = false
  sentEvents.length = 0
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ============================================================================
// __testables: inferErrorType
// ============================================================================

describe('inferErrorType', () => {
  it('returns error.name when it is a non-generic named type', async () => {
    const { __testables } = await freshImport()
    const err = { name: 'TypeError' }
    expect(__testables.inferErrorType('some detail', err)).toBe('TypeError')
  })

  it('falls through when error.name is "Error"', async () => {
    const { __testables } = await freshImport()
    const err = { name: 'Error' }
    expect(__testables.inferErrorType('SomeError: details', err)).toBe('SomeError')
  })

  it('extracts type from ErrorName: prefix in detail string', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferErrorType('NetworkError: request failed')).toBe('NetworkError')
  })

  it('returns NetworkError for "Failed to fetch" fragment', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferErrorType('Failed to fetch /api/pods')).toBe('NetworkError')
  })

  it('returns NetworkError for net::ERR_ fragment', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferErrorType('net::ERR_CONNECTION_REFUSED')).toBe('NetworkError')
  })

  it('returns Unknown for unrecognized detail', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferErrorType('something random happened')).toBe('Unknown')
  })

  it('returns Unknown when error has no name property', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferErrorType('blah', {})).toBe('Unknown')
  })

  it('truncates error.name to ERROR_TYPE_MAX_LEN (40)', async () => {
    const { __testables } = await freshImport()
    const longName = 'A'.repeat(60) + 'Error'
    expect(__testables.inferErrorType('', { name: longName }).length).toBeLessThanOrEqual(40)
  })
})

// ============================================================================
// __testables: inferComponentName
// ============================================================================

describe('inferComponentName', () => {
  it('returns cardId when provided', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferComponentName('my-card-id')).toBe('my-card-id')
  })

  it('extracts component name from React componentStack', async () => {
    const { __testables } = await freshImport()
    const stack = '\n  in MyComponent\n  in App'
    expect(__testables.inferComponentName(undefined, stack)).toBe('MyComponent')
  })

  it('extracts filename from error.stack when no componentStack', async () => {
    const { __testables } = await freshImport()
    const err = { stack: 'Error\n    at /src/lib/myUtils.ts:42:10' }
    expect(__testables.inferComponentName(undefined, undefined, err)).toBe('myUtils')
  })

  it('uses first path segment from pathname as fallback', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferComponentName(undefined, undefined, undefined, '/clusters/overview')).toBe('clusters')
  })

  it('maps root "/" pathname to "dashboard"', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferComponentName(undefined, undefined, undefined, '/')).toBe('dashboard')
  })

  it('returns "unknown" when no information available', async () => {
    const { __testables } = await freshImport()
    expect(__testables.inferComponentName()).toBe('unknown')
  })
})

// ============================================================================
// __testables: isBrowserExtensionNoise
// ============================================================================

describe('isBrowserExtensionNoise', () => {
  it('returns true for MetaMask message', async () => {
    const { __testables } = await freshImport()
    expect(__testables.isBrowserExtensionNoise('MetaMask detected an issue', null)).toBe(true)
  })

  it('returns true for ethereum in message', async () => {
    const { __testables } = await freshImport()
    expect(__testables.isBrowserExtensionNoise('window.ethereum is not defined', null)).toBe(true)
  })

  it('returns true for chrome-extension:// in stack', async () => {
    const { __testables } = await freshImport()
    const reason = { stack: 'at chrome-extension://abc/content.js:1:1' }
    expect(__testables.isBrowserExtensionNoise('error', reason)).toBe(true)
  })

  it('returns true for moz-extension:// in stack', async () => {
    const { __testables } = await freshImport()
    const reason = { stack: 'at moz-extension://xyz/bg.js:5:10' }
    expect(__testables.isBrowserExtensionNoise('error', reason)).toBe(true)
  })

  it('returns false for normal app errors', async () => {
    const { __testables } = await freshImport()
    expect(__testables.isBrowserExtensionNoise('Cannot read property of null', null)).toBe(false)
  })
})

// ============================================================================
// markErrorReported / wasAlreadyReported
// ============================================================================

describe('markErrorReported + wasAlreadyReported', () => {
  it('marks then recognises already-reported within dedup window', async () => {
    const mod = await freshImport()
    const msg = 'TestError: something bad'
    expect(mod.__testables.wasAlreadyReported(msg)).toBe(false)
    mod.markErrorReported(msg)
    expect(mod.__testables.wasAlreadyReported(msg)).toBe(true)
  })

  it('expires after dedup window passes', async () => {
    vi.useFakeTimers()
    const mod = await freshImport()
    const msg = 'ExpiredError: old news'
    mod.markErrorReported(msg)
    expect(mod.__testables.wasAlreadyReported(msg)).toBe(true)
    vi.advanceTimersByTime(6_000) // past 5s DEDUP_EXPIRY_MS
    expect(mod.__testables.wasAlreadyReported(msg)).toBe(false)
    vi.useRealTimers()
  })
})

// ============================================================================
// getRecentBrowserErrors / _resetCapturedErrors
// ============================================================================

describe('getRecentBrowserErrors + _resetCapturedErrors', () => {
  it('starts empty', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    expect(mod.getRecentBrowserErrors()).toEqual([])
  })

  it('populates after startGlobalErrorTracking captures console.error', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    console.error('test captured error message')
    const errors = mod.getRecentBrowserErrors()
    expect(errors.some(e => e.message.includes('test captured error message'))).toBe(true)
    mod.stopGlobalErrorTracking()
  })

  it('clears with _resetCapturedErrors', async () => {
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    console.error('will be cleared')
    mod.stopGlobalErrorTracking()
    mod._resetCapturedErrors()
    expect(mod.getRecentBrowserErrors()).toEqual([])
  })
})

// ============================================================================
// getRecentFailedApiCalls / _resetCapturedApiCalls
// ============================================================================

describe('getRecentFailedApiCalls + _resetCapturedApiCalls', () => {
  it('starts empty after reset', async () => {
    const mod = await freshImport()
    mod._resetCapturedApiCalls()
    expect(mod.getRecentFailedApiCalls()).toEqual([])
  })

  it('records api calls via emitHttpError', async () => {
    const mod = await freshImport()
    mod._resetCapturedApiCalls()
    mod._resetErrorThrottles()
    mod.emitHttpError('500', '/api/clusters')
    const calls = mod.getRecentFailedApiCalls()
    expect(calls.length).toBeGreaterThan(0)
  })

  it('clears with _resetCapturedApiCalls', async () => {
    const mod = await freshImport()
    mod.emitHttpError('404', '/api/pods')
    mod._resetCapturedApiCalls()
    expect(mod.getRecentFailedApiCalls()).toEqual([])
  })
})

// ============================================================================
// emitHttpError
// ============================================================================

describe('emitHttpError', () => {
  it('does not send in demo mode', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mockIsDemoMode = true
    mod.emitHttpError('500', '/api/test')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })

  it('skips timeout errors', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('timeout', 'request timed out')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })

  it('skips AbortError details', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('0', 'AbortError: request aborted')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })

  it('skips 401 auth errors', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('401', 'Unauthorized')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })

  it('skips 403 auth errors', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('403', 'Forbidden')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })

  it('sends ksc_http_error for real 500 errors', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('500', '/api/clusters failed')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeTruthy()
  })

  it('throttles repeated identical errors', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitHttpError('500', '/api/pods')
    sentEvents.length = 0
    mod.emitHttpError('500', '/api/pods')
    expect(sentEvents.find(e => e.name === 'ksc_http_error')).toBeUndefined()
  })
})

// ============================================================================
// emitError
// ============================================================================

describe('emitError', () => {
  it('sends ksc_error with correct fields', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitError('render_crash', 'Component exploded', 'my-card')
    const evt = sentEvents.find(e => e.name === 'ksc_error')
    expect(evt).toBeTruthy()
    expect((evt!.params as Record<string, unknown>).error_code).toBe('render_crash')
    expect((evt!.params as Record<string, unknown>).card_id).toBe('my-card')
  })

  it('throttles repeated calls for same category + page', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitError('render_crash', 'first')
    sentEvents.length = 0
    mod.emitError('render_crash', 'second')
    // Throttled — same category+page combo
    expect(sentEvents.find(e => e.name === 'ksc_error')).toBeUndefined()
  })

  it('allows different categories through independently', async () => {
    const mod = await freshImport()
    mod._resetErrorThrottles()
    mod.emitError('cat_a', 'first error')
    mod.emitError('cat_b', 'second error')
    expect(sentEvents.filter(e => e.name === 'ksc_error').length).toBe(2)
  })
})

// ============================================================================
// emitChunkReloadRecoveryFailed
// ============================================================================

describe('emitChunkReloadRecoveryFailed', () => {
  it('sends ksc_chunk_reload_recovery with failed result', async () => {
    const mod = await freshImport()
    mod.emitChunkReloadRecoveryFailed('chunk 123 failed to load')
    const evt = sentEvents.find(e => e.name === 'ksc_chunk_reload_recovery')
    expect(evt).toBeTruthy()
    expect((evt!.params as Record<string, unknown>).recovery_result).toBe('failed')
  })
})

// ============================================================================
// resetAnalyticsErrorState
// ============================================================================

describe('resetAnalyticsErrorState', () => {
  it('clears errors, api calls, and throttles', async () => {
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    console.error('some error')
    mod.emitHttpError('500', '/api/test')
    mod.stopGlobalErrorTracking()
    mod.resetAnalyticsErrorState()
    expect(mod.getRecentBrowserErrors()).toEqual([])
    expect(mod.getRecentFailedApiCalls()).toEqual([])
  })
})

// ============================================================================
// startGlobalErrorTracking / stopGlobalErrorTracking
// ============================================================================

describe('startGlobalErrorTracking + stopGlobalErrorTracking', () => {
  it('registers unhandledrejection listener', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    expect(addSpy.mock.calls.some(([evt]) => evt === 'unhandledrejection')).toBe(true)
    mod.stopGlobalErrorTracking()
  })

  it('registers error listener', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    expect(addSpy.mock.calls.some(([evt]) => evt === 'error')).toBe(true)
    mod.stopGlobalErrorTracking()
  })

  it('removes listeners on stop', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    mod.stopGlobalErrorTracking()
    expect(removeSpy.mock.calls.some(([evt]) => evt === 'unhandledrejection')).toBe(true)
    expect(removeSpy.mock.calls.some(([evt]) => evt === 'error')).toBe(true)
  })

  it('restores console on stop', async () => {
    const orig = console.error
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    expect(console.error).not.toBe(orig)
    mod.stopGlobalErrorTracking()
    expect(console.error).toBe(orig)
  })

  it('deregisters previous handlers before re-registering on second call', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const mod = await freshImport()
    mod.startGlobalErrorTracking()
    removeSpy.mockClear()
    mod.startGlobalErrorTracking()
    expect(removeSpy.mock.calls.some(([evt]) => evt === 'unhandledrejection')).toBe(true)
    mod.stopGlobalErrorTracking()
  })
})

// ============================================================================
// unhandledrejection handler — noise filters
// ============================================================================

describe('unhandledrejection noise filters', () => {
  it('ignores clipboard errors', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod._resetErrorThrottles()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { message: 'writeText failed in clipboard API' },
    }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('ignores AbortError rejections', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    const abortErr = { message: 'signal is aborted', name: 'AbortError' }
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: abortErr,
    }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('ignores bare network noise (Failed to fetch)', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { message: 'Failed to fetch' },
    }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('captures unhandled rejections that pass all filters', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod._resetErrorThrottles()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { message: 'Something truly unexpected happened in user code' },
    }))
    mod.stopGlobalErrorTracking()
    const errs = mod.getRecentBrowserErrors()
    expect(errs.some(e => e.message.includes('Something truly unexpected'))).toBe(true)
  })

  it('handles auth errors via emitHttpError in rejections', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod._resetErrorThrottles()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: { message: 'UnauthenticatedError: not logged in', name: 'UnauthenticatedError' },
    }))
    mod.stopGlobalErrorTracking()
    const apiCalls = mod.getRecentFailedApiCalls()
    expect(apiCalls.some(c => c.endpoint.includes('auth') || c.detail?.includes('Unauthenticated'))).toBe(true)
  })
})

// ============================================================================
// error event handler — noise filters
// ============================================================================

describe('error event handler noise filters', () => {
  it('ignores "Script error." messages', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('ignores empty messages', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new ErrorEvent('error', { message: '' }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('ignores errors from extension filenames', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'extension error',
      filename: 'chrome-extension://abc/content.js',
    }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('ignores ResizeObserver loop errors', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'ResizeObserver loop limit exceeded',
    }))
    mod.stopGlobalErrorTracking()
    expect(mod.getRecentBrowserErrors().length).toBe(0)
  })

  it('captures genuine runtime errors', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod._resetErrorThrottles()
    mod.startGlobalErrorTracking()
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Cannot read properties of null (reading "foo")',
    }))
    mod.stopGlobalErrorTracking()
    const errs = mod.getRecentBrowserErrors()
    expect(errs.some(e => e.message.includes('Cannot read properties'))).toBe(true)
  })
})

// ============================================================================
// console.warn interception
// ============================================================================

describe('console.warn interception', () => {
  it('captures console.warn after startGlobalErrorTracking', async () => {
    const mod = await freshImport()
    mod._resetCapturedErrors()
    mod.startGlobalErrorTracking()
    console.warn('deprecation warning from test')
    mod.stopGlobalErrorTracking()
    const errs = mod.getRecentBrowserErrors()
    expect(errs.some(e => e.level === 'warn' && e.message.includes('deprecation warning'))).toBe(true)
  })
})
