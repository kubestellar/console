import { describe, it, expect, beforeEach } from 'vitest'
import { emitHttpError, __testables, _resetErrorThrottles } from '../analytics-core'

const { isErrorThrottled } = __testables

beforeEach(() => {
  _resetErrorThrottles()
})

describe('emitHttpError', () => {
  it('does not throw for a normal HTTP error', () => {
    expect(() => emitHttpError('404', '/api/clusters')).not.toThrow()
  })

  it('does not throw when called with a detail string', () => {
    expect(() => emitHttpError('500', '/api/pods')).not.toThrow()
  })

  it('does not throw when status is a string', () => {
    expect(() => emitHttpError('401', '/api/auth')).not.toThrow()
  })

  it('isErrorThrottled uses full category string as key', () => {
    const page = window.location.pathname
    // First call records; second call with same key is throttled
    expect(isErrorThrottled('http_404_/api/foo', page)).toBe(false)
    expect(isErrorThrottled('http_404_/api/foo', page)).toBe(true)
    // A different category string is not throttled
    expect(isErrorThrottled('http_404_/api/foo?query=1', page)).toBe(false)
  })

  it('records separate throttle keys for different categories', () => {
    const page = window.location.pathname
    // Record for /api/pods
    expect(isErrorThrottled('http_404_/api/pods', page)).toBe(false)
    // Different category — not throttled
    expect(isErrorThrottled('http_404_/api/namespaces', page)).toBe(false)
    // Same category as first — throttled
    expect(isErrorThrottled('http_404_/api/pods', page)).toBe(true)
  })

  it('throttles repeated calls for the same category and page', () => {
    const page = window.location.pathname
    // First call registers the emission (returns false = not throttled)
    expect(isErrorThrottled('http_503_/api/health', page)).toBe(false)
    // Second call with same key is throttled
    expect(isErrorThrottled('http_503_/api/health', page)).toBe(true)
  })

  it('allows same category with a different status code through independently', () => {
    const page = window.location.pathname
    expect(isErrorThrottled('http_404_/api/users', page)).toBe(false)
    // Same path but different status — should not be throttled
    expect(isErrorThrottled('http_500_/api/users', page)).toBe(false)
  })
})
