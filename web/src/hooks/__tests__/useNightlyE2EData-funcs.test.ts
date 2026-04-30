import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __testables } from '../useNightlyE2EData'

const {
  loadCachedData,
  saveCachedData,
  getAuthHeaders,
  REFRESH_IDLE_MS,
  REFRESH_ACTIVE_MS,
  LS_CACHE_KEY,
} = __testables

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('constants', () => {
  it('REFRESH_IDLE_MS is 5 minutes', () => {
    const FIVE_MINUTES_MS = 300_000
    expect(REFRESH_IDLE_MS).toBe(FIVE_MINUTES_MS)
  })

  it('REFRESH_ACTIVE_MS is 2 minutes', () => {
    const TWO_MINUTES_MS = 120_000
    expect(REFRESH_ACTIVE_MS).toBe(TWO_MINUTES_MS)
  })

  it('REFRESH_ACTIVE_MS is less than REFRESH_IDLE_MS', () => {
    expect(REFRESH_ACTIVE_MS).toBeLessThan(REFRESH_IDLE_MS)
  })

  it('LS_CACHE_KEY is a non-empty string', () => {
    expect(typeof LS_CACHE_KEY).toBe('string')
    expect(LS_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('LS_CACHE_KEY equals nightly-e2e-cache', () => {
    expect(LS_CACHE_KEY).toBe('nightly-e2e-cache')
  })
})

describe('loadCachedData', () => {
  it('returns empty guides when localStorage has no data', () => {
    const result = loadCachedData()
    expect(result).toEqual({ guides: [], isDemo: false })
  })

  it('returns cached data when localStorage has valid live data', () => {
    const cached = {
      guides: [{ guide: 'test-guide', runs: [] }],
      isDemo: false,
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cached))
    const result = loadCachedData()
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0].guide).toBe('test-guide')
    expect(result.isDemo).toBe(false)
  })

  it('returns empty guides when cached data has isDemo=true', () => {
    const cached = {
      guides: [{ guide: 'demo-guide', runs: [] }],
      isDemo: true,
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cached))
    const result = loadCachedData()
    expect(result).toEqual({ guides: [], isDemo: false })
  })

  it('returns empty guides when cached data has empty guides array', () => {
    const cached = { guides: [], isDemo: false }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cached))
    const result = loadCachedData()
    expect(result).toEqual({ guides: [], isDemo: false })
  })

  it('returns empty guides when localStorage has invalid JSON', () => {
    localStorage.setItem(LS_CACHE_KEY, '{not valid json')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadCachedData()
    expect(result).toEqual({ guides: [], isDemo: false })
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns empty guides when cached data has no guides property', () => {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ isDemo: false }))
    const result = loadCachedData()
    expect(result).toEqual({ guides: [], isDemo: false })
  })

  it('returns data with multiple guides', () => {
    const cached = {
      guides: [
        { guide: 'guide-a', runs: [{ id: 1 }] },
        { guide: 'guide-b', runs: [{ id: 2 }] },
      ],
      isDemo: false,
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cached))
    const result = loadCachedData()
    expect(result.guides).toHaveLength(2)
  })
})

describe('saveCachedData', () => {
  it('saves data to localStorage under the cache key', () => {
    const data = {
      guides: [{ guide: 'saved-guide', runs: [] }],
      isDemo: false,
    }
    saveCachedData(data)
    const stored = localStorage.getItem(LS_CACHE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual(data)
  })

  it('overwrites previously cached data', () => {
    const first = { guides: [{ guide: 'first' }], isDemo: false }
    const second = { guides: [{ guide: 'second' }], isDemo: false }
    saveCachedData(first as any)
    saveCachedData(second as any)
    const stored = JSON.parse(localStorage.getItem(LS_CACHE_KEY)!)
    expect(stored.guides[0].guide).toBe('second')
  })

  it('saves empty guides array without error', () => {
    const data = { guides: [], isDemo: false }
    saveCachedData(data)
    const stored = JSON.parse(localStorage.getItem(LS_CACHE_KEY)!)
    expect(stored.guides).toEqual([])
  })

  it('saves data with isDemo=true', () => {
    const data = { guides: [{ guide: 'demo' }], isDemo: true } as any
    saveCachedData(data)
    const stored = JSON.parse(localStorage.getItem(LS_CACHE_KEY)!)
    expect(stored.isDemo).toBe(true)
  })
})

describe('getAuthHeaders', () => {
  it('returns empty object when no token in localStorage', () => {
    const headers = getAuthHeaders()
    expect(headers).toEqual({})
  })

  it('returns Authorization header when token exists', () => {
    localStorage.setItem('token', 'my-jwt-token')
    const headers = getAuthHeaders()
    expect(headers).toEqual({ Authorization: 'Bearer my-jwt-token' })
  })

  it('includes Bearer prefix in Authorization header', () => {
    localStorage.setItem('token', 'abc123')
    const headers = getAuthHeaders()
    expect(headers.Authorization).toMatch(/^Bearer /)
  })

  it('returns empty object after token is removed', () => {
    localStorage.setItem('token', 'temp-token')
    localStorage.removeItem('token')
    const headers = getAuthHeaders()
    expect(headers).toEqual({})
  })

  it('uses the current token value', () => {
    localStorage.setItem('token', 'first-token')
    expect(getAuthHeaders().Authorization).toBe('Bearer first-token')
    localStorage.setItem('token', 'second-token')
    expect(getAuthHeaders().Authorization).toBe('Bearer second-token')
  })
})
