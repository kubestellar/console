import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: vi.fn(() => false),
}))

const mod = await import('../useNightlyE2EData')
const {
  loadCachedData,
  saveCachedData,
  getAuthHeaders,
  REFRESH_IDLE_MS,
  REFRESH_ACTIVE_MS,
  LS_CACHE_KEY,
} = mod.__testables

beforeEach(() => {
  localStorage.clear()
})

describe('loadCachedData', () => {
  it('returns empty guides when localStorage is empty', () => {
    const result = loadCachedData()
    expect(result.guides).toEqual([])
    expect(result.isDemo).toBe(false)
  })

  it('returns stored data when valid', () => {
    const data = { guides: [{ name: 'test', status: 'passed' }], isDemo: false }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(data))
    const result = loadCachedData()
    expect(result.guides).toHaveLength(1)
  })

  it('returns empty on corrupted JSON', () => {
    localStorage.setItem(LS_CACHE_KEY, 'bad{json')
    const result = loadCachedData()
    expect(result.guides).toEqual([])
  })

  it('rejects demo data from cache', () => {
    const data = { guides: [{ name: 'test' }], isDemo: true }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(data))
    const result = loadCachedData()
    expect(result.guides).toEqual([])
  })

  it('rejects empty guides array', () => {
    const data = { guides: [], isDemo: false }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(data))
    const result = loadCachedData()
    expect(result.guides).toEqual([])
  })
})

describe('saveCachedData', () => {
  it('persists data to localStorage', () => {
    const data = { guides: [{ name: 'g1' }], isDemo: false }
    saveCachedData(data as never)
    const stored = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || '{}')
    expect(stored.guides).toHaveLength(1)
  })
})

describe('getAuthHeaders', () => {
  it('returns empty object when no token', () => {
    expect(getAuthHeaders()).toEqual({})
  })

  it('returns Authorization header when token exists', () => {
    localStorage.setItem('kc-auth-token', 'jwt-xyz')
    const headers = getAuthHeaders()
    expect(headers.Authorization).toBe('Bearer jwt-xyz')
  })
})

describe('constants', () => {
  it('REFRESH_IDLE_MS is 5 minutes', () => {
    expect(REFRESH_IDLE_MS).toBe(300_000)
  })

  it('REFRESH_ACTIVE_MS is 2 minutes', () => {
    expect(REFRESH_ACTIVE_MS).toBe(120_000)
  })

  it('REFRESH_ACTIVE_MS is less than REFRESH_IDLE_MS', () => {
    expect(REFRESH_ACTIVE_MS).toBeLessThan(REFRESH_IDLE_MS)
  })

  it('LS_CACHE_KEY is a non-empty string', () => {
    expect(typeof LS_CACHE_KEY).toBe('string')
    expect(LS_CACHE_KEY.length).toBeGreaterThan(0)
  })
})
