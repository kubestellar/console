import { describe, it, expect, beforeEach, vi } from 'vitest'

// Module-level state is shared — reset between tests via the exported helper.
import {
  getDeploymentType,
  isOptedOut,
  getClientId,
  getSession,
  hashUserId,
  getOrCreateAnonymousId,
  markActive,
  peekEngagementMs,
  peekSessionEngagementMs,
  getAndResetEngagementMs,
  resetSessionEngagement,
  incrementSessionPageViewCount,
  getSessionPageViewCount,
  _loadUtmParams,
  getUtmParams,
  CID_KEY,
  SID_KEY,
  SC_KEY,
  LAST_KEY,
  SESSION_TIMEOUT_MS,
} from '../analytics-session'

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetSessionEngagement()
  vi.useRealTimers()
})

// ── getDeploymentType ─────────────────────────────────────────────

describe('getDeploymentType', () => {
  it('returns console.kubestellar.io for production host', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'console.kubestellar.io', search: '' },
      writable: true,
    })
    expect(getDeploymentType()).toBe('console.kubestellar.io')
  })

  it('returns netlify-preview for netlify.app hostnames', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'deploy-preview-42--kubestellar.netlify.app', search: '' },
      writable: true,
    })
    expect(getDeploymentType()).toBe('netlify-preview')
  })

  it('returns localhost for localhost', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: '' },
      writable: true,
    })
    expect(getDeploymentType()).toBe('localhost')
  })

  it('returns localhost for 127.0.0.1', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: '127.0.0.1', search: '' },
      writable: true,
    })
    expect(getDeploymentType()).toBe('localhost')
  })

  it('returns containerized for other hostnames', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'my-cluster.internal', search: '' },
      writable: true,
    })
    expect(getDeploymentType()).toBe('containerized')
  })
})

// ── isOptedOut ────────────────────────────────────────────────────

describe('isOptedOut', () => {
  it('returns false when opt-out key is absent', () => {
    expect(isOptedOut()).toBe(false)
  })

  it('returns true when opt-out key is "true"', () => {
    localStorage.setItem('kc-analytics-opt-out', 'true')
    expect(isOptedOut()).toBe(true)
  })

  it('returns false when opt-out key is "false"', () => {
    localStorage.setItem('kc-analytics-opt-out', 'false')
    expect(isOptedOut()).toBe(false)
  })
})

// ── getClientId ───────────────────────────────────────────────────

describe('getClientId', () => {
  it('returns a non-empty string', () => {
    expect(getClientId()).toBeTruthy()
  })

  it('persists the same id on subsequent calls', () => {
    const first = getClientId()
    const second = getClientId()
    expect(first).toBe(second)
  })

  it('stores the id under CID_KEY', () => {
    const id = getClientId()
    expect(localStorage.getItem(CID_KEY)).toBe(id)
  })

  it('creates a new id when storage is cleared', () => {
    const first = getClientId()
    localStorage.clear()
    const second = getClientId()
    expect(first).not.toBe(second)
  })
})

// ── getSession ────────────────────────────────────────────────────

describe('getSession', () => {
  it('returns a session with sid, sc and isNew flag', () => {
    const result = getSession()
    expect(result).toHaveProperty('sid')
    expect(result).toHaveProperty('sc')
    expect(result).toHaveProperty('isNew')
  })

  it('marks session as new on first call', () => {
    const { isNew } = getSession()
    expect(isNew).toBe(true)
  })

  it('reuses session on immediate second call', () => {
    const first = getSession()
    const second = getSession()
    expect(second.sid).toBe(first.sid)
    expect(second.isNew).toBe(false)
  })

  it('starts a new session after timeout', () => {
    vi.useFakeTimers()
    const first = getSession()
    // Advance past SESSION_TIMEOUT_MS
    vi.advanceTimersByTime(SESSION_TIMEOUT_MS + 1000)
    const second = getSession()
    expect(second.isNew).toBe(true)
    expect(second.sc).toBeGreaterThan(first.sc)
  })

  it('increments session count across sessions', () => {
    vi.useFakeTimers()
    getSession() // sc = 1
    vi.advanceTimersByTime(SESSION_TIMEOUT_MS + 1000)
    const second = getSession() // sc = 2
    expect(second.sc).toBe(2)
  })

  it('stores sid under SID_KEY', () => {
    const { sid } = getSession()
    expect(localStorage.getItem(SID_KEY)).toBe(sid)
  })
})

// ── hashUserId ────────────────────────────────────────────────────

describe('hashUserId', () => {
  it('returns a hex string', async () => {
    const result = await hashUserId('user123')
    expect(result).toMatch(/^[0-9a-f]+$/)
  })

  it('returns consistent output for the same input', async () => {
    const a = await hashUserId('same-user')
    const b = await hashUserId('same-user')
    expect(a).toBe(b)
  })

  it('returns different hashes for different inputs', async () => {
    const a = await hashUserId('user-a')
    const b = await hashUserId('user-b')
    expect(a).not.toBe(b)
  })
})

// ── getOrCreateAnonymousId ────────────────────────────────────────

describe('getOrCreateAnonymousId', () => {
  it('returns a non-empty string', () => {
    expect(getOrCreateAnonymousId()).toBeTruthy()
  })

  it('returns the same id on repeated calls', () => {
    const first = getOrCreateAnonymousId()
    const second = getOrCreateAnonymousId()
    expect(first).toBe(second)
  })

  it('generates a new id after storage is cleared', () => {
    const first = getOrCreateAnonymousId()
    localStorage.clear()
    const second = getOrCreateAnonymousId()
    expect(first).not.toBe(second)
  })
})

// ── Engagement tracking ───────────────────────────────────────────

describe('engagement tracking (module state)', () => {
  it('peekEngagementMs returns 0 before any activity', () => {
    expect(peekEngagementMs()).toBe(0)
  })

  it('peekEngagementMs grows after markActive + time passes', () => {
    vi.useFakeTimers()
    markActive()
    vi.advanceTimersByTime(5000)
    expect(peekEngagementMs()).toBeGreaterThanOrEqual(5000)
  })

  it('getAndResetEngagementMs returns accumulated time and resets per-page accumulator', () => {
    vi.useFakeTimers()
    markActive()
    vi.advanceTimersByTime(3000)
    const val = getAndResetEngagementMs()
    expect(val).toBeGreaterThanOrEqual(3000)
    // After reset, peek should be near 0 (user still active, so starts fresh)
    const afterReset = peekEngagementMs()
    expect(afterReset).toBeLessThan(val)
  })

  it('peekSessionEngagementMs accumulates across resets', () => {
    vi.useFakeTimers()
    markActive()
    vi.advanceTimersByTime(2000)
    getAndResetEngagementMs() // drains per-page, adds to session
    vi.advanceTimersByTime(2000)
    expect(peekSessionEngagementMs()).toBeGreaterThanOrEqual(4000)
  })

  it('resetSessionEngagement zeroes all counters', () => {
    vi.useFakeTimers()
    markActive()
    vi.advanceTimersByTime(5000)
    getAndResetEngagementMs()
    resetSessionEngagement()
    expect(peekEngagementMs()).toBe(0)
    expect(peekSessionEngagementMs()).toBe(0)
    expect(getSessionPageViewCount()).toBe(0)
  })
})

// ── Session page view count ───────────────────────────────────────

describe('session page view count', () => {
  it('starts at 0', () => {
    expect(getSessionPageViewCount()).toBe(0)
  })

  it('increments with incrementSessionPageViewCount', () => {
    incrementSessionPageViewCount()
    incrementSessionPageViewCount()
    expect(getSessionPageViewCount()).toBe(2)
  })

  it('resets to 0 after resetSessionEngagement', () => {
    incrementSessionPageViewCount()
    resetSessionEngagement()
    expect(getSessionPageViewCount()).toBe(0)
  })
})

// ── _loadUtmParams ────────────────────────────────────────────────

describe('_loadUtmParams', () => {
  it('returns null when no UTM params in URL or storage', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: '' },
      writable: true,
    })
    const result = _loadUtmParams()
    expect(result).toBeNull()
  })

  it('captures UTM params from URL search string', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'localhost',
        search: '?utm_source=github&utm_medium=referral&utm_campaign=test',
      },
      writable: true,
    })
    const result = _loadUtmParams()
    expect(result).not.toBeNull()
    expect(result?.utm_source).toBe('github')
    expect(result?.utm_medium).toBe('referral')
    expect(result?.utm_campaign).toBe('test')
  })

  it('truncates UTM values longer than 100 chars', () => {
    const long = 'x'.repeat(200)
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: `?utm_source=${long}` },
      writable: true,
    })
    const result = _loadUtmParams()
    expect(result?.utm_source?.length).toBe(100)
  })

  it('falls back to sessionStorage when URL has no UTM params', () => {
    const stored = { utm_source: 'cached', utm_medium: 'email' }
    sessionStorage.setItem('_ksc_utm', JSON.stringify(stored))
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: '' },
      writable: true,
    })
    _loadUtmParams()
    const params = getUtmParams()
    expect(params.utm_source).toBe('cached')
    expect(params.utm_medium).toBe('email')
  })

  it('persists UTM params to sessionStorage when captured from URL', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: '?utm_source=docs' },
      writable: true,
    })
    _loadUtmParams()
    const stored = JSON.parse(sessionStorage.getItem('_ksc_utm') || '{}')
    expect(stored.utm_source).toBe('docs')
  })
})
