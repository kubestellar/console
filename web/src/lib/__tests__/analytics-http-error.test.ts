import { describe, it, expect, beforeEach } from 'vitest'
import { emitHttpError, __testables, _resetErrorThrottles } from '../analytics-core'

const { isErrorThrottled } = __testables

beforeEach(() => {
  _resetErrorThrottles()
})

describe('emitHttpError', () => {
  it('does not throw for a normal HTTP error', () => {
    expect(() => emitHttpError(404, '/api/clusters')).not.toThrow()
  })

  it('does not throw when called with a detail string', () => {
    expect(() => emitHttpError(500, '/api/pods', 'Internal Server Error')).not.toThrow()
  })

  it('does not throw when status is a string', () => {
    expect(() => emitHttpError('401', '/api/auth')).not.toThrow()
  })

  it('strips query string before recording throttle key', () => {
    const page = window.location.pathname
    emitHttpError(404, '/api/foo?count_only=true&page=1')
    // The throttle key should use the path-only form, not the raw endpoint
    expect(isErrorThrottled('http_404_/api/foo', page)).toBe(true)
    expect(isErrorThrottled('http_404_/api/foo?count_only=true&page=1', page)).toBe(false)
  })

  it('records separate throttle keys for different endpoints with same status', () => {
    const page = window.location.pathname
    emitHttpError(404, '/api/pods')
    // /api/pods is now throttled for 404 but /api/namespaces is not
    expect(isErrorThrottled('http_404_/api/pods', page)).toBe(true)
    expect(isErrorThrottled('http_404_/api/namespaces', page)).toBe(false)
  })

  it('throttles repeated calls for the same endpoint and status', () => {
    const page = window.location.pathname
    // First call registers the emission
    emitHttpError(503, '/api/health')
    // Second call should be throttled (isErrorThrottled returns true → emitHttpError skips send)
    expect(isErrorThrottled('http_503_/api/health', page)).toBe(true)
  })

  it('allows same endpoint with a different status code through independently', () => {
    const page = window.location.pathname
    emitHttpError(404, '/api/users')
    // Same path but different status — should not be throttled
    expect(isErrorThrottled('http_500_/api/users', page)).toBe(false)
  })
})
