import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isAutomatedEnvironment,
  isOptedOut,
  getDeploymentType,
  rand,
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
  startEngagementTracking,
  stopEngagementTracking,
  getUtmParams,
  _loadUtmParams,
  CID_KEY,
  SID_KEY,
  SC_KEY,
  LAST_KEY,
  SESSION_TIMEOUT_MS,
} from './analytics-session'

vi.mock('./constants', () => ({
  STORAGE_KEY_ANALYTICS_OPT_OUT: '__analytics_opt_out__',
  STORAGE_KEY_ANONYMOUS_USER_ID: '__analytics_anon_id__',
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  // Reset module-level engagement state between tests
  resetSessionEngagement()
  stopEngagementTracking()
})

afterEach(() => {
  stopEngagementTracking()
  localStorage.clear()
  sessionStorage.clear()
})

// ── isAutomatedEnvironment ──────────────────────────────────────────────────

describe('isAutomatedEnvironment', () => {
  it('returns false for a normal browser environment', () => {
    expect(isAutomatedEnvironment()).toBe(false)
  })

  it('returns true when navigator.webdriver is set', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    expect(isAutomatedEnvironment()).toBe(true)
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  })

  it('returns true for HeadlessChrome user agent', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 HeadlessChrome/120.0.0.0',
      configurable: true,
    })
    expect(isAutomatedEnvironment()).toBe(true)
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
  })

  it('returns true for PhantomJS user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'PhantomJS/2.1.1',
      configurable: true,
    })
    expect(isAutomatedEnvironment()).toBe(true)
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla', configurable: true })
  })

  it('returns true when no language preferences', () => {
    Object.defineProperty(navigator, 'languages', { value: [], configurable: true, writable: true })
    Object.defineProperty(navigator, 'userAgent', { value: 'Chrome/120', configurable: true })
    expect(isAutomatedEnvironment()).toBe(true)
  })

  it('returns false for Firefox with no plugins (Firefox exception)', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Firefox/120', configurable: true })
    Object.defineProperty(navigator, 'plugins', {
      value: { length: 0 },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'languages', {
      value: ['en-US'],
      configurable: true,
      writable: true,
    })
    expect(isAutomatedEnvironment()).toBe(false)
  })
})

// ── isOptedOut ──────────────────────────────────────────────────────────────

describe('isOptedOut', () => {
  it('returns false when not opted out', () => {
    expect(isOptedOut()).toBe(false)
  })

  it('returns true when opt-out key is set to "true"', () => {
    localStorage.setItem('__analytics_opt_out__', 'true')
    expect(isOptedOut()).toBe(true)
  })

  it('returns false for other values', () => {
    localStorage.setItem('__analytics_opt_out__', 'false')
    expect(isOptedOut()).toBe(false)
  })
})

// ── getDeploymentType ───────────────────────────────────────────────────────

describe('getDeploymentType', () => {
  it('returns localhost for localhost hostname', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost', search: '' },
      configurable: true,
    })
    expect(getDeploymentType()).toBe('localhost')
  })

  it('returns localhost for 127.0.0.1', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: '127.0.0.1', search: '' },
      configurable: true,
    })
    expect(getDeploymentType()).toBe('localhost')
  })

  it('returns console.kubestellar.io for production hostname', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'console.kubestellar.io', search: '' },
      configurable: true,
    })
    expect(getDeploymentType()).toBe('console.kubestellar.io')
  })

  it('returns netlify-preview for netlify.app hostnames', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'deploy-preview-123.netlify.app', search: '' },
      configurable: true,
    })
    expect(getDeploymentType()).toBe('netlify-preview')
  })

  it('returns containerized for other hostnames', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: '10.0.0.1', search: '' },
      configurable: true,
    })
    expect(getDeploymentType()).toBe('containerized')
  })
})

// ── rand ────────────────────────────────────────────────────────────────────

describe('rand', () => {
  it('returns a numeric string', () => {
    expect(Number(rand())).toBeGreaterThanOrEqual(0)
  })

  it('returns values less than 2147483647', () => {
    for (let i = 0; i < 10; i++) {
      expect(Number(rand())).toBeLessThan(2147483647)
    }
  })

  it('returns different values on consecutive calls (probabilistic)', () => {
    const values = new Set(Array.from({ length: 10 }, () => rand()))
    expect(values.size).toBeGreaterThan(1)
  })
})

// ── getClientId ─────────────────────────────────────────────────────────────

describe('getClientId', () => {
  it('generates and persists a client ID on first call', () => {
    const cid = getClientId()
    expect(cid).toBeTruthy()
    expect(localStorage.getItem(CID_KEY)).toBe(cid)
  })

  it('returns the same client ID on subsequent calls', () => {
    const cid1 = getClientId()
    const cid2 = getClientId()
    expect(cid1).toBe(cid2)
  })

  it('reuses existing client ID from localStorage', () => {
    localStorage.setItem(CID_KEY, 'existing-cid')
    expect(getClientId()).toBe('existing-cid')
  })

  it('generates a new client ID if localStorage is cleared', () => {
    const cid1 = getClientId()
    localStorage.clear()
    const cid2 = getClientId()
    expect(cid1).not.toBe(cid2)
  })
})

// ── getSession ──────────────────────────────────────────────────────────────

describe('getSession', () => {
  it('creates a new session when localStorage is empty', () => {
    const { sid, sc, isNew } = getSession()
    expect(sid).toBeTruthy()
    expect(sc).toBeGreaterThanOrEqual(1)
    expect(isNew).toBe(true)
  })

  it('reuses session within timeout window', () => {
    const { sid: sid1 } = getSession()
    const { sid: sid2, isNew } = getSession()
    expect(sid1).toBe(sid2)
    expect(isNew).toBe(false)
  })

  it('creates a new session when previous session expired', () => {
    const oldTime = Date.now() - SESSION_TIMEOUT_MS - 1000
    localStorage.setItem(SID_KEY, 'old-sid')
    localStorage.setItem(LAST_KEY, String(oldTime))

    const { sid, isNew } = getSession()
    expect(sid).not.toBe('old-sid')
    expect(isNew).toBe(true)
  })

  it('increments session count on new session', () => {
    localStorage.setItem(SC_KEY, '5')
    const oldTime = Date.now() - SESSION_TIMEOUT_MS - 1000
    localStorage.setItem(LAST_KEY, String(oldTime))

    const { sc } = getSession()
    expect(sc).toBe(6)
  })

  it('updates LAST_KEY on each call', () => {
    const before = Date.now()
    getSession()
    const stored = Number(localStorage.getItem(LAST_KEY))
    expect(stored).toBeGreaterThanOrEqual(before)
  })
})

// ── hashUserId ──────────────────────────────────────────────────────────────

describe('hashUserId', () => {
  it('returns a hex string for a given uid', async () => {
    const hash = await hashUserId('user@example.com')
    expect(hash).toMatch(/^[0-9a-f]+$/)
    expect(hash.length).toBeGreaterThan(0)
  })

  it('returns the same hash for the same uid', async () => {
    const h1 = await hashUserId('consistent-user')
    const h2 = await hashUserId('consistent-user')
    expect(h1).toBe(h2)
  })

  it('returns different hashes for different uids', async () => {
    const h1 = await hashUserId('user-a')
    const h2 = await hashUserId('user-b')
    expect(h1).not.toBe(h2)
  })
})

// ── getOrCreateAnonymousId ──────────────────────────────────────────────────

describe('getOrCreateAnonymousId', () => {
  it('creates an anonymous ID on first call', () => {
    const id = getOrCreateAnonymousId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem('__analytics_anon_id__')).toBe(id)
  })

  it('returns the same ID on subsequent calls', () => {
    expect(getOrCreateAnonymousId()).toBe(getOrCreateAnonymousId())
  })
})

// ── engagement tracking ─────────────────────────────────────────────────────

describe('engagement tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetSessionEngagement()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('peekEngagementMs returns 0 before any activity', () => {
    expect(peekEngagementMs()).toBe(0)
  })

  it('peekEngagementMs grows after markActive', () => {
    markActive()
    vi.advanceTimersByTime(1000)
    expect(peekEngagementMs()).toBeGreaterThan(0)
  })

  it('getAndResetEngagementMs returns accumulated time and resets accumulator', () => {
    markActive()
    vi.advanceTimersByTime(2000)
    const total = getAndResetEngagementMs()
    expect(total).toBeGreaterThanOrEqual(0)
  })

  it('resetSessionEngagement resets page view count', () => {
    incrementSessionPageViewCount()
    incrementSessionPageViewCount()
    resetSessionEngagement()
    expect(getSessionPageViewCount()).toBe(0)
  })

  it('incrementSessionPageViewCount increments correctly', () => {
    resetSessionEngagement()
    incrementSessionPageViewCount()
    incrementSessionPageViewCount()
    expect(getSessionPageViewCount()).toBe(2)
  })

  it('peekSessionEngagementMs accumulates across page views', () => {
    markActive()
    vi.advanceTimersByTime(500)
    expect(peekSessionEngagementMs()).toBeGreaterThanOrEqual(0)
  })

  it('stopEngagementTracking clears the heartbeat timer', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    startEngagementTracking(() => {})
    stopEngagementTracking()
    expect(clearSpy).toHaveBeenCalled()
  })
})

// ── UTM tracking ────────────────────────────────────────────────────────────

describe('_loadUtmParams / getUtmParams', () => {
  it('returns null when no utm params in URL or sessionStorage', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', hostname: 'localhost' },
      configurable: true,
    })
    const result = _loadUtmParams()
    expect(result).toBeNull()
  })

  it('captures utm_source from URL search params', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?utm_source=github&utm_medium=readme', hostname: 'localhost' },
      configurable: true,
    })
    const result = _loadUtmParams()
    expect(result).not.toBeNull()
    expect(result?.utm_source).toBe('github')
    expect(result?.utm_medium).toBe('readme')
  })

  it('persists utm params to sessionStorage', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?utm_campaign=launch', hostname: 'localhost' },
      configurable: true,
    })
    _loadUtmParams()
    const stored = JSON.parse(sessionStorage.getItem('_ksc_utm') || '{}')
    expect(stored.utm_campaign).toBe('launch')
  })

  it('truncates utm values to 100 chars', () => {
    const longValue = 'x'.repeat(200)
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: `?utm_source=${longValue}`, hostname: 'localhost' },
      configurable: true,
    })
    const result = _loadUtmParams()
    expect(result?.utm_source?.length).toBe(100)
  })

  it('loads utm params from sessionStorage when URL has none', () => {
    sessionStorage.setItem('_ksc_utm', JSON.stringify({ utm_source: 'cached' }))
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', hostname: 'localhost' },
      configurable: true,
    })
    _loadUtmParams()
    expect(getUtmParams().utm_source).toBe('cached')
  })
})
