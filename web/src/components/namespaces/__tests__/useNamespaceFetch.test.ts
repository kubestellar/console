import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNamespaceFetch, namespaceCache, getCachedNamespacesForCluster } from '../useNamespaceFetch'
import { authFetch } from '../../../lib/api'
import { clusterCacheRef } from '../../../hooks/mcp/shared'

/**
 * useNamespaceFetch Hook Tests
 * 
 * Tests namespace fetching logic, caching behavior, progressive loading,
 * error handling (auth failures, timeouts, network errors), auto-refresh,
 * and fallback to pod-based namespace extraction.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  clusterCacheRef: {
    clusters: [],
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'object' && fallback.defaultValue) {
        return fallback.defaultValue
      }
      return typeof fallback === 'string' ? fallback : key
    },
  }),
}))

// ── Test Data ──────────────────────────────────────────────────────────────

const mockClusters = [
  { name: 'cluster-1', context: 'ctx-1', reachable: true },
  { name: 'cluster-2', context: 'ctx-2', reachable: true },
]

const mockDeduplicatedClusters = [
  { name: 'cluster-1', context: 'ctx-1' },
  { name: 'cluster-2', context: 'ctx-2' },
]

const mockNamespaces = [
  { name: 'default', cluster: 'cluster-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
  { name: 'kube-system', cluster: 'cluster-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
]

const mockShowToast = vi.fn()
const mockT = (key: string) => key

// ── Helper Functions ───────────────────────────────────────────────────────

function createMockResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useNamespaceFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    namespaceCache.clear()
    clusterCacheRef.clusters = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('fetches namespaces from backend API', async () => {
    vi.mocked(authFetch).mockImplementation((url) => {
      if (url.includes('/api/namespaces')) {
        return createMockResponse(mockNamespaces)
      }
      return createMockResponse({ namespaces: [] }, 404)
    })

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.allNamespaces.length).toBeGreaterThan(0)
    expect(namespaceCache.has('cluster-1')).toBe(true)
  })

  it('uses cached namespaces on subsequent calls', async () => {
    namespaceCache.set('cluster-1', mockNamespaces)

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.allNamespaces.length).toBe(2)
    })

    expect(authFetch).not.toHaveBeenCalled()
  })

  it('handles authorization failures (403)', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      createMockResponse({ error: 'Forbidden' }, 403)
    )

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
    expect(result.current.clusterStatuses['cluster-1']).toBe('accessDenied')
  })

  it('handles network failures and marks cluster unavailable', async () => {
    vi.mocked(authFetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.clusterStatuses['cluster-1']).toBe('unavailable')
  })

  it('falls back to pod-based namespace extraction on agent failure', async () => {
    const mockPods = {
      pods: [
        { namespace: 'app-1' },
        { namespace: 'app-2' },
        { namespace: 'app-1' }, // duplicate
      ],
    }

    vi.mocked(authFetch).mockImplementation((url) => {
      if (url.includes('/api/namespaces')) {
        return createMockResponse({ error: 'Not found' }, 404)
      }
      if (url.includes('/pods')) {
        return createMockResponse(mockPods)
      }
      return createMockResponse({}, 500)
    })

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.allNamespaces.some(ns => ns.name === 'app-1')).toBe(true)
    expect(result.current.allNamespaces.some(ns => ns.name === 'app-2')).toBe(true)
  })

  it('auto-refreshes namespaces at interval', async () => {
    vi.mocked(authFetch).mockResolvedValue(createMockResponse(mockNamespaces))

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const initialLastUpdated = result.current.lastUpdated

    await act(async () => {
      vi.advanceTimersByTime(30000) // AUTO_REFRESH_INTERVAL_MS
    })

    await waitFor(() => {
      expect(result.current.lastUpdated).not.toBe(initialLastUpdated)
    })
  })

  it('skips offline clusters during fetch', async () => {
    const offlineClusters = [
      { name: 'cluster-1', context: 'ctx-1', reachable: false },
      { name: 'cluster-2', context: 'ctx-2', reachable: true },
    ]

    vi.mocked(authFetch).mockResolvedValue(createMockResponse(mockNamespaces))

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1', 'cluster-2'],
        clusters: offlineClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should only fetch cluster-2
    expect(vi.mocked(authFetch).mock.calls.some(call => 
      call[0].toString().includes('cluster-2')
    )).toBe(true)
  })

  it('tracks loading state per cluster', async () => {
    vi.mocked(authFetch).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(createMockResponse(mockNamespaces)), 100))
    )

    const { result } = renderHook(() =>
      useNamespaceFetch({
        allClusterNames: ['cluster-1', 'cluster-2'],
        clusters: mockClusters,
        deduplicatedClusters: mockDeduplicatedClusters,
        showToast: mockShowToast,
        t: mockT,
      })
    )

    expect(result.current.loadingClusters.size).toBeGreaterThan(0)

    await waitFor(() => {
      expect(result.current.loadingClusters.size).toBe(0)
    })
  })

  it('exports getCachedNamespacesForCluster utility', () => {
    namespaceCache.set('cluster-1', mockNamespaces)
    const cached = getCachedNamespacesForCluster('cluster-1')
    expect(cached).toEqual(mockNamespaces)
  })

  it('falls back to clusterCacheRef when cache is empty', () => {
    clusterCacheRef.clusters = [
      { name: 'cluster-1', context: 'ctx-1', namespaces: ['default', 'kube-system'] },
    ]

    const cached = getCachedNamespacesForCluster('cluster-1')
    expect(cached.length).toBe(2)
    expect(cached[0].name).toBe('default')
  })
})
