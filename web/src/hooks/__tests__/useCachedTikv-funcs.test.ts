/**
 * Tests for the pure helper functions and fetcher function exported via
 * __testables / useCache capture from useCachedTikv.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../lib/api', () => ({ authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))
vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { useCachedTikv, __testables } from '../useCachedTikv'

const {
  isTikvPod,
  parseIntOrZero,
  deriveStoreState,
  parseVersion,
  podToStore,
  summarize,
  buildStatus,
} = __testables

// ---------------------------------------------------------------------------
// isTikvPod
// ---------------------------------------------------------------------------

describe('isTikvPod', () => {
  it('matches by app.kubernetes.io/component label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/component': 'tikv' } } }
    expect(isTikvPod(pod)).toBe(true)
  })

  it('matches by app.kubernetes.io/name label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/name': 'tikv' } } }
    expect(isTikvPod(pod)).toBe(true)
  })

  it('matches by app label', () => {
    const pod = { name: 'pod1', metadata: { labels: { app: 'tikv' } } }
    expect(isTikvPod(pod)).toBe(true)
  })

  it('matches by pod name prefix tikv-', () => {
    expect(isTikvPod({ name: 'tikv-0' })).toBe(true)
  })

  it('matches by pod name containing -tikv-', () => {
    expect(isTikvPod({ name: 'cluster-tikv-0' })).toBe(true)
  })

  it('returns false for unrelated pods', () => {
    expect(isTikvPod({ name: 'nginx-abc' })).toBe(false)
    expect(isTikvPod({ name: 'pd-0' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseIntOrZero
// ---------------------------------------------------------------------------

describe('parseIntOrZero', () => {
  it('parses valid integer string', () => {
    expect(parseIntOrZero('42')).toBe(42)
  })

  it('returns 0 for undefined', () => {
    expect(parseIntOrZero(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseIntOrZero('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseIntOrZero('abc')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveStoreState
// ---------------------------------------------------------------------------

describe('deriveStoreState', () => {
  it('returns Up when Running and all containers ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }] } }
    expect(deriveStoreState(pod)).toBe('Up')
  })

  it('returns Down when Running but not all containers ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: false }] } }
    expect(deriveStoreState(pod)).toBe('Down')
  })

  it('returns Offline for Pending phase', () => {
    const pod = { name: 'p', status: { phase: 'Pending' } }
    expect(deriveStoreState(pod)).toBe('Offline')
  })

  it('returns Down for Failed phase', () => {
    const pod = { name: 'p', status: { phase: 'Failed' } }
    expect(deriveStoreState(pod)).toBe('Down')
  })

  it('returns Down for unknown phase', () => {
    const pod = { name: 'p', status: { phase: 'Succeeded' } }
    expect(deriveStoreState(pod)).toBe('Down')
  })
})

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------

describe('parseVersion', () => {
  it('extracts version from tikv container image', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'tikv', image: 'pingcap/tikv:v7.1.0' }] },
    }
    expect(parseVersion(pod)).toBe('v7.1.0')
  })

  it('strips digest before extracting version', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'tikv', image: 'tikv:v6.5.0@sha256:abc123' }] },
    }
    expect(parseVersion(pod)).toBe('v6.5.0')
  })

  it('returns empty string when no containers', () => {
    expect(parseVersion({ name: 'p' })).toBe('')
  })

  it('returns empty string for image without tag', () => {
    const pod = { name: 'p', status: { containerStatuses: [{ name: 'tikv', image: 'tikv' }] } }
    expect(parseVersion(pod)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// podToStore
// ---------------------------------------------------------------------------

describe('podToStore', () => {
  it('maps a pod with annotations to a TikvStore', () => {
    const pod = {
      name: 'tikv-0',
      namespace: 'tikv',
      status: {
        phase: 'Running',
        podIP: '10.0.0.1',
        containerStatuses: [{ name: 'tikv', ready: true, image: 'tikv:v7.1.0' }],
      },
      metadata: {
        labels: {},
        annotations: {
          'tikv.kubestellar.io/store-id': '5',
          'tikv.kubestellar.io/region-count': '100',
          'tikv.kubestellar.io/leader-count': '50',
        },
      },
    }
    const store = podToStore(pod, 1)
    expect(store.storeId).toBe(5)
    expect(store.address).toBe('10.0.0.1:20160')
    expect(store.state).toBe('Up')
    expect(store.regionCount).toBe(100)
    expect(store.leaderCount).toBe(50)
  })

  it('uses fallback store ID when annotation is missing', () => {
    const pod = { name: 'tikv-0', status: { phase: 'Running', containerStatuses: [] } }
    const store = podToStore(pod, 3)
    expect(store.storeId).toBe(3)
  })

  it('uses pod name as address when podIP is missing', () => {
    const pod = { name: 'tikv-0', status: { phase: 'Running', containerStatuses: [] } }
    const store = podToStore(pod, 1)
    expect(store.address).toBe('tikv-0')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty stores', () => {
    const result = summarize([])
    expect(result.totalStores).toBe(0)
    expect(result.upStores).toBe(0)
    expect(result.downStores).toBe(0)
  })

  it('counts up and down stores', () => {
    const stores = [
      { storeId: 1, address: '', state: 'Up' as const, version: '', regionCount: 10, leaderCount: 5, capacityBytes: 0, availableBytes: 0 },
      { storeId: 2, address: '', state: 'Down' as const, version: '', regionCount: 20, leaderCount: 10, capacityBytes: 0, availableBytes: 0 },
    ]
    const result = summarize(stores)
    expect(result.totalStores).toBe(2)
    expect(result.upStores).toBe(1)
    expect(result.downStores).toBe(1)
    expect(result.totalRegions).toBe(30)
    expect(result.totalLeaders).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus', () => {
  it('returns not-installed for empty stores', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.stores).toEqual([])
  })

  it('returns healthy when all stores are Up', () => {
    const stores = [
      { storeId: 1, address: '', state: 'Up' as const, version: '', regionCount: 0, leaderCount: 0, capacityBytes: 0, availableBytes: 0 },
    ]
    const result = buildStatus(stores)
    expect(result.health).toBe('healthy')
  })

  it('returns degraded when some stores are Down', () => {
    const stores = [
      { storeId: 1, address: '', state: 'Up' as const, version: '', regionCount: 0, leaderCount: 0, capacityBytes: 0, availableBytes: 0 },
      { storeId: 2, address: '', state: 'Down' as const, version: '', regionCount: 0, leaderCount: 0, capacityBytes: 0, availableBytes: 0 },
    ]
    const result = buildStatus(stores)
    expect(result.health).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchTikvStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedTikv())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const tikvPod = {
      name: 'tikv-0',
      namespace: 'tikv',
      status: {
        phase: 'Running',
        podIP: '10.0.0.1',
        containerStatuses: [{ name: 'tikv', ready: true, image: 'tikv:v7.1.0' }],
      },
      metadata: {
        labels: { 'app.kubernetes.io/component': 'tikv' },
        annotations: {},
      },
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [tikvPod] }),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; stores: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.stores).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; stores: unknown[] }
    expect(result.health).toBe('not-installed')
    expect(result.stores).toEqual([])
  })

  it('returns not-installed for 503 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('throws on non-404/501/503 error status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })

  it('returns not-installed when JSON parse fails', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })
})
