/**
 * useNamespaceFetch Tests
 *
 * Tests pure helper functions (buildFallbackNamespaces, getCachedNamespacesForCluster)
 * and the hook behavior (loading states, caching, auto-refresh, error handling).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuthFetch = vi.fn()

vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:9090',
}))

vi.mock('../../../lib/constants/network', () => ({
  NAMESPACE_ABORT_TIMEOUT_MS: 5000,
  isLocalAgentSuppressed: () => false,
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  clusterCacheRef: {
    clusters: [
      { name: 'cached-cluster', context: 'cached-ctx', namespaces: ['ns-a', 'ns-b'] },
    ],
  },
}))

// Import after mocks
import { useNamespaceFetch, namespaceCache } from '../useNamespaceFetch'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeOkResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  }
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'mock error' }),
  }
}

// ── Tests: Pure functions ──────────────────────────────────────────────────

describe('useNamespaceFetch - pure helpers', () => {
  beforeEach(() => {
    namespaceCache.clear()
  })

  it('getCachedNamespacesForCluster returns empty when cache is empty and no cluster match', async () => {
    const { getCachedNamespacesForCluster } = await import('../useNamespaceFetch')
    const result = getCachedNamespacesForCluster('nonexistent-cluster')
    expect(result).toEqual([])
  })

  it('getCachedNamespacesForCluster returns cached data when present', async () => {
    namespaceCache.set('my-cluster', [
      { name: 'ns1', cluster: 'my-cluster', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
    ])
    const { getCachedNamespacesForCluster } = await import('../useNamespaceFetch')
    const result = getCachedNamespacesForCluster('my-cluster')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ns1')
  })

  it('getCachedNamespacesForCluster falls back to clusterCacheRef', async () => {
    const { getCachedNamespacesForCluster } = await import('../useNamespaceFetch')
    const result = getCachedNamespacesForCluster('cached-cluster')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('ns-a')
    expect(result[1].name).toBe('ns-b')
  })
})

// ── Tests: Hook behavior ───────────────────────────────────────────────────

describe('useNamespaceFetch - hook', () => {
  const mockShowToast = vi.fn()
  const mockT = (key: string, opts?: string | Record<string, unknown>) => {
    if (typeof opts === 'string') return opts
    if (opts && typeof opts === 'object' && 'defaultValue' in opts) return opts.defaultValue as string
    return key
  }

  const defaultParams = {
    allClusterNames: ['cluster-1'],
    clusters: [{ name: 'cluster-1', context: 'ctx-1', reachable: true }],
    deduplicatedClusters: [{ name: 'cluster-1', context: 'ctx-1' }],
    showToast: mockShowToast,
    t: mockT as never,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    namespaceCache.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts with loading=false and empty namespaces', () => {
    mockAuthFetch.mockImplementation(() => new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useNamespaceFetch({
      ...defaultParams,
      clusters: [], // no clusters = no fetch
      allClusterNames: [],
    }))

    expect(result.current.loading).toBe(false)
    expect(result.current.allNamespaces).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sets loading=true during fetch', async () => {
    let resolveRequest: (value: unknown) => void
    mockAuthFetch.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const { result } = renderHook(() => useNamespaceFetch(defaultParams))

    // After the effect fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(true)

    // Resolve the fetch
    await act(async () => {
      resolveRequest!(makeOkResponse({
        namespaces: [{ name: 'ns1', status: 'Active' }],
      }))
      await vi.advanceTimersByTimeAsync(0)
    })
  })

  it('populates namespaces on successful agent fetch', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse({
      namespaces: [
        { name: 'production', status: 'Active', createdAt: '2024-06-01T00:00:00Z' },
        { name: 'staging', status: 'Active' },
      ],
    }))

    const { result } = renderHook(() => useNamespaceFetch(defaultParams))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.allNamespaces.length).toBeGreaterThanOrEqual(2)
    const names = result.current.allNamespaces.map(n => n.name)
    expect(names).toContain('production')
    expect(names).toContain('staging')
  })

  it('sets error on auth failure (403)', async () => {
    mockAuthFetch.mockResolvedValue(makeErrorResponse(403))

    const { result } = renderHook(() => useNamespaceFetch(defaultParams))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should have some error since all clusters failed with auth
    expect(result.current.error).toBeTruthy()
  })

  it('auto-refreshes every 30 seconds', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse({ namespaces: [] }))

    renderHook(() => useNamespaceFetch(defaultParams))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const callCountAfterInitial = mockAuthFetch.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(callCountAfterInitial)
  })

  it('skips offline clusters', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse({ namespaces: [] }))

    const params = {
      ...defaultParams,
      allClusterNames: ['online-cluster', 'offline-cluster'],
      clusters: [
        { name: 'online-cluster', context: 'ctx-online', reachable: true },
        { name: 'offline-cluster', context: 'ctx-offline', reachable: false },
      ],
      deduplicatedClusters: [
        { name: 'online-cluster', context: 'ctx-online' },
        { name: 'offline-cluster', context: 'ctx-offline' },
      ],
    }

    renderHook(() => useNamespaceFetch(params))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => {
      // Should only fetch for online cluster
      const calls = mockAuthFetch.mock.calls
      const urls = calls.map(c => c[0] as string)
      expect(urls.some(u => u.includes('ctx-offline'))).toBe(false)
    })
  })

  it('uses cache on subsequent renders without force', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse({
      namespaces: [{ name: 'cached-ns', status: 'Active' }],
    }))

    const { result, rerender } = renderHook(() => useNamespaceFetch(defaultParams))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const callsAfterFirst = mockAuthFetch.mock.calls.length

    // Re-render with same params — should use cache
    rerender()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // No additional fetch calls (only the interval would trigger new ones)
    expect(mockAuthFetch.mock.calls.length).toBe(callsAfterFirst)
  })

  it('returns lastUpdated timestamp after fetch completes', async () => {
    mockAuthFetch.mockResolvedValue(makeOkResponse({ namespaces: [] }))

    const { result } = renderHook(() => useNamespaceFetch(defaultParams))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => {
      expect(result.current.lastUpdated).toBeInstanceOf(Date)
    })
  })
})
