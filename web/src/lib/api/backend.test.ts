/**
 * Coverage for lib/api/backend.ts — targets four exports that are not
 * exercised by lib/api.test.ts:
 *   - markBackendFailure
 *   - markBackendSuccess
 *   - extractRequestPath
 *   - shouldTreatAsBackendOutage
 *
 * (checkBackendAvailability / checkOAuthConfigured{,WithRetry} /
 *  isBackendUnavailable are already covered by lib/api.test.ts via
 *  the api.ts re-exports.)
 *
 * The global setup mocks '../lib/api' but does NOT mock './api/backend',
 * so importing directly from './backend' hits the real module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../backendHealthEvents', () => ({
  reportBackendAvailable: vi.fn(),
  reportBackendUnavailable: vi.fn(),
  shouldMarkBackendUnavailable: vi.fn((status: number) => status === 502 || status === 503 || status === 504),
}))

vi.mock('../errors/handleError', () => ({
  reportAppError: vi.fn(),
}))

import {
  markBackendFailure,
  markBackendSuccess,
  extractRequestPath,
  shouldTreatAsBackendOutage,
  isBackendUnavailable,
  resetBackendStateForTests,
} from './backend'
import {
  reportBackendAvailable,
  reportBackendUnavailable,
  shouldMarkBackendUnavailable,
} from '../backendHealthEvents'

const BACKEND_STATUS_KEY = 'kc-backend-status'

const mockReportAvailable = reportBackendAvailable as ReturnType<typeof vi.fn>
const mockReportUnavailable = reportBackendUnavailable as ReturnType<typeof vi.fn>
const mockShouldMark = shouldMarkBackendUnavailable as ReturnType<typeof vi.fn>

beforeEach(() => {
  resetBackendStateForTests()
  localStorage.removeItem(BACKEND_STATUS_KEY)
  mockReportAvailable.mockClear()
  mockReportUnavailable.mockClear()
  mockShouldMark.mockClear()
})

// ── markBackendFailure ─────────────────────────────────────────────

describe('markBackendFailure', () => {
  it('flips isBackendUnavailable() to true and reports http failure with status', () => {
    expect(isBackendUnavailable()).toBe(false)

    markBackendFailure(503)

    expect(isBackendUnavailable()).toBe(true)
    expect(mockReportUnavailable).toHaveBeenCalledTimes(1)
    expect(mockReportUnavailable).toHaveBeenCalledWith('http', 503)
  })

  it('reports http failure with undefined status when omitted', () => {
    markBackendFailure()

    expect(mockReportUnavailable).toHaveBeenCalledWith('http', undefined)
  })

  it('clears the persisted backend status cache so a fresh page load does not inherit "down" state', () => {
    localStorage.setItem(
      BACKEND_STATUS_KEY,
      JSON.stringify({ available: true, timestamp: Date.now() }),
    )
    expect(localStorage.getItem(BACKEND_STATUS_KEY)).not.toBeNull()

    markBackendFailure(502)

    expect(localStorage.getItem(BACKEND_STATUS_KEY)).toBeNull()
  })

  it('does not throw when localStorage.removeItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    try {
      expect(() => markBackendFailure(504)).not.toThrow()
      expect(isBackendUnavailable()).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})

// ── markBackendSuccess ─────────────────────────────────────────────

describe('markBackendSuccess', () => {
  it('flips backend state to available and reports http success', () => {
    // Start from a known-bad state so we can observe the flip.
    markBackendFailure(503)
    expect(isBackendUnavailable()).toBe(true)
    mockReportAvailable.mockClear()

    markBackendSuccess(200)

    expect(isBackendUnavailable()).toBe(false)
    expect(mockReportAvailable).toHaveBeenCalledTimes(1)
    expect(mockReportAvailable).toHaveBeenCalledWith('http', 200)
  })

  it('reports http success with undefined status when omitted', () => {
    markBackendSuccess()

    expect(mockReportAvailable).toHaveBeenCalledWith('http', undefined)
  })

  it('persists {available: true, timestamp} to localStorage', () => {
    const before = Date.now()
    markBackendSuccess(200)
    const after = Date.now()

    const raw = localStorage.getItem(BACKEND_STATUS_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.available).toBe(true)
    expect(typeof parsed.timestamp).toBe('number')
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before)
    expect(parsed.timestamp).toBeLessThanOrEqual(after)
  })

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      expect(() => markBackendSuccess(200)).not.toThrow()
      expect(isBackendUnavailable()).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })
})

// ── extractRequestPath ─────────────────────────────────────────────

describe('extractRequestPath', () => {
  it('returns pathname for an absolute string URL', () => {
    expect(extractRequestPath('https://example.com/api/health')).toBe('/api/health')
  })

  it('resolves relative string paths against window.location.origin', () => {
    expect(extractRequestPath('/api/kagent/pods')).toBe('/api/kagent/pods')
    expect(extractRequestPath('api/kagent/pods')).toBe('/api/kagent/pods')
  })

  it('strips query string and hash from the returned pathname', () => {
    expect(extractRequestPath('/api/clusters?x=1&y=2#section')).toBe('/api/clusters')
  })

  it('accepts a URL instance', () => {
    const url = new URL('https://example.com/api/kagenti-provider/models?verbose=1')
    expect(extractRequestPath(url)).toBe('/api/kagenti-provider/models')
  })

  it('accepts a Request-like object and reads its url property', () => {
    const request = { url: 'https://example.com/api/session' } as Request
    expect(extractRequestPath(request)).toBe('/api/session')
  })

  it('falls back to the raw input when the URL cannot be parsed', () => {
    // A truly unparseable string — the ':' with nothing after triggers the URL parser to throw.
    const bogus = 'http://[::bogus'
    expect(extractRequestPath(bogus)).toBe(bogus)
  })
})

// ── shouldTreatAsBackendOutage ─────────────────────────────────────

describe('shouldTreatAsBackendOutage', () => {
  it('returns false for statuses that are not backend-unavailable statuses (regardless of path)', () => {
    expect(shouldTreatAsBackendOutage('/api/clusters', 500)).toBe(false)
    expect(shouldTreatAsBackendOutage('/api/clusters', 404)).toBe(false)
    expect(shouldTreatAsBackendOutage('/api/clusters', 200)).toBe(false)
  })

  it('returns true for a 5xx backend-outage status on a non-exempt path', () => {
    expect(shouldTreatAsBackendOutage('/api/clusters', 503)).toBe(true)
    expect(shouldTreatAsBackendOutage('/api/health', 502)).toBe(true)
    expect(shouldTreatAsBackendOutage('/api/health', 504)).toBe(true)
  })

  it('returns false when the path starts with an exempt prefix', () => {
    // /api/kagent/ and /api/kagenti-provider/ are exempt — a 5xx from those
    // proxied external services must NOT flip the whole app into "backend down".
    expect(shouldTreatAsBackendOutage('/api/kagent/pods', 503)).toBe(false)
    expect(shouldTreatAsBackendOutage('/api/kagent/', 502)).toBe(false)
    expect(shouldTreatAsBackendOutage('/api/kagenti-provider/models', 504)).toBe(false)
  })

  it('exempt-prefix match is prefix-only, not substring — foreign paths still count as outages', () => {
    // Substring "kagent" appears but the exempt prefix is /api/kagent/ (trailing slash).
    expect(shouldTreatAsBackendOutage('/api/kagentic-lookalike/x', 503)).toBe(true)
  })

  it('resolves the exempt-prefix check against the normalized pathname', () => {
    expect(
      shouldTreatAsBackendOutage(new URL('https://example.com/api/kagent/health'), 503),
    ).toBe(false)
    expect(
      shouldTreatAsBackendOutage(new URL('https://example.com/api/clusters'), 503),
    ).toBe(true)
  })
})
