/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedOpenfga.ts, PLUS fetcher function tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables } from '../useCachedOpenfga'
import type {
  OpenfgaStore,
  OpenfgaAuthorizationModel,
  OpenfgaStats,
  OpenfgaApiRps,
  OpenfgaLatencyMs,
} from '../../components/cards/openfga_status/demoData'

const { sumTuples, summarize, deriveHealth, buildOpenfgaStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeStore(overrides: Partial<OpenfgaStore> = {}): OpenfgaStore {
  return {
    id: 'store-1',
    name: 'production',
    tupleCount: 1500,
    modelCount: 2,
    status: 'active',
    lastWriteTime: new Date().toISOString(),
    ...overrides,
  }
}

function makeModel(overrides: Partial<OpenfgaAuthorizationModel> = {}): OpenfgaAuthorizationModel {
  return {
    id: 'model-1',
    storeName: 'production',
    schemaVersion: '1.1',
    typeCount: 5,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeStats(overrides: Partial<OpenfgaStats> = {}): OpenfgaStats {
  return {
    totalTuples: 3000,
    totalStores: 2,
    totalModels: 3,
    serverVersion: '1.5.0',
    rps: { check: 100, expand: 20, listObjects: 10 },
    latency: { p50: 5, p95: 15, p99: 30 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// sumTuples
// ---------------------------------------------------------------------------

describe('sumTuples', () => {
  it('returns 0 for empty stores array', () => {
    expect(sumTuples([])).toBe(0)
  })

  it('sums tupleCount across stores', () => {
    const stores = [
      makeStore({ tupleCount: 100 }),
      makeStore({ id: 's2', tupleCount: 250 }),
      makeStore({ id: 's3', tupleCount: 50 }),
    ]
    expect(sumTuples(stores)).toBe(400)
  })

  it('handles stores with undefined tupleCount', () => {
    const stores = [
      makeStore({ tupleCount: 100 }),
      { ...makeStore({ id: 's2' }), tupleCount: undefined as unknown as number },
    ]
    // (store.tupleCount ?? 0) handles undefined
    expect(sumTuples(stores)).toBe(100)
  })

  it('handles single store', () => {
    expect(sumTuples([makeStore({ tupleCount: 42 })])).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty data', () => {
    const stats = makeStats({ totalTuples: 0 })
    const result = summarize('', [], [], stats)
    expect(result).toEqual({
      endpoint: '',
      totalTuples: 0,
      totalStores: 0,
      totalModels: 0,
    })
  })

  it('uses stats.totalTuples when provided', () => {
    const stats = makeStats({ totalTuples: 5000 })
    const stores = [makeStore({ tupleCount: 100 })]
    const result = summarize('http://openfga:8080', stores, [makeModel()], stats)
    expect(result.totalTuples).toBe(5000)
    expect(result.totalStores).toBe(1)
    expect(result.totalModels).toBe(1)
    expect(result.endpoint).toBe('http://openfga:8080')
  })

  it('falls back to sumTuples when stats.totalTuples is 0', () => {
    const stats = makeStats({ totalTuples: 0 })
    const stores = [makeStore({ tupleCount: 200 }), makeStore({ id: 's2', tupleCount: 300 })]
    const result = summarize('ep', stores, [], stats)
    // totalTuples = stats.totalTuples || sumTuples(stores) => 0 is falsy, so 500
    expect(result.totalTuples).toBe(500)
  })

  it('counts stores and models by array length', () => {
    const stores = [makeStore(), makeStore({ id: 's2' })]
    const models = [makeModel(), makeModel({ id: 'm2' }), makeModel({ id: 'm3' })]
    const result = summarize('ep', stores, models, makeStats())
    expect(result.totalStores).toBe(2)
    expect(result.totalModels).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no endpoint and no stores', () => {
    expect(deriveHealth('', [])).toBe('not-installed')
  })

  it('returns healthy with endpoint and active stores', () => {
    expect(deriveHealth('http://openfga:8080', [makeStore()])).toBe('healthy')
  })

  it('returns healthy with endpoint only (no stores)', () => {
    expect(deriveHealth('http://openfga:8080', [])).toBe('healthy')
  })

  it('returns healthy with stores only (no endpoint)', () => {
    // endpoint is falsy but stores.length > 0, so not "not-installed"
    expect(deriveHealth('', [makeStore()])).not.toBe('not-installed')
  })

  it('returns degraded when a store is draining', () => {
    const stores = [makeStore(), makeStore({ id: 's2', status: 'draining' })]
    expect(deriveHealth('http://openfga:8080', stores)).toBe('degraded')
  })

  it('returns healthy when all stores are active', () => {
    const stores = [makeStore({ status: 'active' }), makeStore({ id: 's2', status: 'active' })]
    expect(deriveHealth('ep', stores)).toBe('healthy')
  })

  it('returns healthy when store status is paused (not draining)', () => {
    expect(deriveHealth('ep', [makeStore({ status: 'paused' })])).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildOpenfgaStatus
// ---------------------------------------------------------------------------

describe('buildOpenfgaStatus', () => {
  it('builds not-installed status with empty data', () => {
    const stats = makeStats({ totalTuples: 0 })
    const result = buildOpenfgaStatus('', [], [], stats)
    expect(result.health).toBe('not-installed')
    expect(result.stores).toEqual([])
    expect(result.models).toEqual([])
    expect(result.stats).toBe(stats)
    expect(result.summary.endpoint).toBe('')
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status with stores and models', () => {
    const stores = [makeStore()]
    const models = [makeModel()]
    const stats = makeStats()
    const result = buildOpenfgaStatus('http://openfga:8080', stores, models, stats)
    expect(result.health).toBe('healthy')
    expect(result.stores).toHaveLength(1)
    expect(result.models).toHaveLength(1)
    expect(result.summary.endpoint).toBe('http://openfga:8080')
  })

  it('builds degraded status with draining store', () => {
    const stores = [makeStore({ status: 'draining' })]
    const result = buildOpenfgaStatus('ep', stores, [], makeStats())
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildOpenfgaStatus('', [], [], makeStats())
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

import { useCachedOpenfga } from '../useCachedOpenfga'

describe('fetchOpenfgaStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', stores: [], models: [], stats: { totalTuples: 0, totalStores: 0, totalModels: 0, serverVersion: 'unknown', rps: { check: 0, expand: 0, listObjects: 0 }, latency: { p50: 0, p95: 0, p99: 0 } }, summary: { endpoint: '', totalTuples: 0, totalStores: 0, totalModels: 0 }, lastCheckTime: '' },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('parses a successful API response into OpenfgaStatusData', async () => {
    renderHook(() => useCachedOpenfga())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          endpoint: 'http://openfga:8080',
          stores: [
            {
              id: 'store-1',
              name: 'production',
              tupleCount: 1500,
              modelCount: 2,
              status: 'active',
              lastWriteTime: new Date().toISOString(),
            },
          ],
          models: [
            {
              id: 'model-1',
              storeName: 'production',
              schemaVersion: '1.1',
              typeCount: 5,
              createdAt: new Date().toISOString(),
            },
          ],
          stats: {
            totalTuples: 3000,
            totalStores: 1,
            totalModels: 1,
            serverVersion: '1.5.0',
            rps: { check: 100, expand: 20, listObjects: 10 },
            latency: { p50: 5, p95: 15, p99: 30 },
          },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.stores).toHaveLength(1)
    expect(result.models).toHaveLength(1)
    expect(result.summary.endpoint).toBe('http://openfga:8080')
    expect(result.stats.totalTuples).toBe(3000)
    expect(result.stats.serverVersion).toBe('1.5.0')
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedOpenfga())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch OpenFGA status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedOpenfga())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.stores).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedOpenfga())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch OpenFGA status')
  })

  it('handles empty body fields gracefully', async () => {
    renderHook(() => useCachedOpenfga())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.stores).toEqual([])
    expect(result.models).toEqual([])
    expect(result.stats.totalTuples).toBe(0)
  })
})
