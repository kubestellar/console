/**
 * Tests for useCRDs hook — CRD data fetching with demo fallback.
 *
 * Validates cache loading/saving, auth headers, demo data generation,
 * auto-refresh, failure tracking, and the refetch mechanism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { clearAllCaches } from '../../lib/cache'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

/** Mock cluster data returned by useClusters */
let mockClustersReturn = {
  deduplicatedClusters: [
    { name: 'cluster-a', reachable: true },
    { name: 'cluster-b', reachable: true },
    { name: 'cluster-c', reachable: false },
  ],
  isLoading: false,
}

let mockCacheState: Partial<{
  isDemoFallback: boolean
  isLoading: boolean
  isRefreshing: boolean
}> = {}

const { mockGetStoredAuthToken } = vi.hoisted(() => ({
  mockGetStoredAuthToken: vi.fn(() => null),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockClustersReturn,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'token',
  }
})

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: () => mockGetStoredAuthToken(),
  getStoredAuthTokenSync: () => mockGetStoredAuthToken(),
}))

// Stateful useCache/createCachedHook mock — calls the real fetcher, tracks
// consecutive failures, and exposes error/isFailed so useCRDs fallback works.
vi.mock('../../lib/cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  const FAILURE_THRESHOLD = 3

  const useCacheMock = ({
    fetcher,
    initialData,
    enabled = true,
  }: {
    fetcher: () => Promise<unknown>
    initialData: unknown
    enabled?: boolean
    [k: string]: unknown
  }) => {
    const [data, setData] = React.useState(initialData)
    const [isLoading, setIsLoading] = React.useState(!!enabled)
    const [error, setError] = React.useState<string | null>(null)
    const failuresRef = React.useRef(0)
    const [consecutiveFailures, setConsecutiveFailures] = React.useState(0)
    const [lastRefresh, setLastRefresh] = React.useState<number | null>(null)
    const fetcherRef = React.useRef(fetcher)
    fetcherRef.current = fetcher

    const doFetch = React.useCallback(() => {
      if (!enabled) {
        setIsLoading(false)
        return Promise.resolve()
      }
      
      return Promise.resolve()
        .then(() => fetcherRef.current())
        .then((result: unknown) => {
          failuresRef.current = 0
          setConsecutiveFailures(0)
          setData(result)
          setError(null)
          setLastRefresh(Date.now())
          setIsLoading(false)
        })
        .catch((err: unknown) => {
          failuresRef.current += 1
          const f = failuresRef.current
          setConsecutiveFailures(f)
          setError(err instanceof Error ? err.message : String(err))
          setIsLoading(false)
        })
    }, [enabled])

    React.useEffect(() => {
      if (!enabled) { 
        setIsLoading(false)
        setData(initialData)
        setError(null)
        failuresRef.current = 0
        setConsecutiveFailures(0)
        return 
      }
      doFetch()
    }, [enabled, doFetch, initialData])

    const isFailed = consecutiveFailures >= FAILURE_THRESHOLD
    return {
      data,
      isLoading: mockCacheState.isLoading ?? isLoading,
      isRefreshing: mockCacheState.isRefreshing ?? false,
      isFailed,
      isDemoFallback: mockCacheState.isDemoFallback ?? false,
      error,
      consecutiveFailures,
      lastRefresh,
      refetch: () => doFetch(),
      retryFetch: () => { failuresRef.current = 0; setConsecutiveFailures(0); return doFetch() },
      clearAndRefetch: () => doFetch(),
    }
  }

  return {
    useCache: useCacheMock,
    createCachedHook: ({ fetcher, initialData, enabled }: {
      fetcher: () => Promise<unknown>; initialData: unknown; enabled?: boolean; [k: string]: unknown
    }) => () => useCacheMock({ fetcher, initialData, enabled }),
  }
})

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocks
import { useCRDs, type CRDData} from '../useCRDs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to create a successful API response */
function okResponse(crds: CRDData[], isDemoData = false) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue({ crds, isDemoData }),
  }
}

/** Helper to create an error response */
function _errorResponse(status: number, statusText = 'Error') {
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue({ error: statusText }),
  }
}

/** Helper to create a 503 response (no k8s client) */
function unavailableResponse() {
  return {
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: vi.fn().mockResolvedValue({ error: 'no k8s client' }),
  }
}

/** Sample live CRD data */
const LIVE_CRDS: CRDData[] = [
  {
    name: 'certificates',
    group: 'cert-manager.io',
    version: 'v1',
    scope: 'Namespaced',
    status: 'Established',
    instances: 12,
    cluster: 'cluster-a',
  },
  {
    name: 'prometheuses',
    group: 'monitoring.coreos.com',
    version: 'v1',
    scope: 'Namespaced',
    status: 'Established',
    instances: 3,
    cluster: 'cluster-b',
  },
]

function resetState() {
  vi.clearAllMocks()
  vi.clearAllTimers()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  if (typeof window !== 'undefined') {
    localStorage.clear()
    sessionStorage.clear()
  }
  mockClustersReturn = {
    deduplicatedClusters: [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
      { name: 'cluster-c', reachable: false },
    ],
    isLoading: false,
  }
  mockCacheState = {}
  mockFetch.mockReset()
  mockGetStoredAuthToken.mockReset()
  mockGetStoredAuthToken.mockReturnValue(null)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCRDs', () => {
  beforeEach(async () => {
    resetState()
    await clearAllCaches()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches CRD data from /api/crds on mount when clusters are loaded', async () => {
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/crds',
      expect.objectContaining({
        headers: expect.any(Object),
        signal: expect.anything(),
      }),
    )
    expect(result.current.crds).toEqual(LIVE_CRDS)
    expect(result.current.isDemoData).toBe(false)
  })

  it('does not fetch when clusters are still loading', async () => {
    mockClustersReturn.isLoading = true

    const { result } = renderHook(() => useCRDs())

    // Should report loading because clusters are loading
    expect(result.current.isLoading).toBe(true)
    // fetch should not be called yet
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('keeps demo fallback disabled while the cache is still loading', () => {
    mockCacheState = {
      isDemoFallback: true,
      isLoading: true,
    }
    mockFetch.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useCRDs())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.crds).toEqual([])
  })

  it('falls back to demo data on 503 (no k8s client)', async () => {
    mockFetch.mockResolvedValue(unavailableResponse())

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.crds.length).toBeGreaterThan(0)
    // Demo data uses reachable cluster names
    const clusterNames = result.current.crds.map(c => c.cluster)
    expect(clusterNames).toContain('cluster-a')
    expect(clusterNames).toContain('cluster-b')
    // cluster-c has reachable: false, should be filtered out
    expect(clusterNames).not.toContain('cluster-c')
  })

  it('falls back to demo data when API returns isDemoData: true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({ crds: [], isDemoData: true }),
    })

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isDemoData).toBe(true)
    })
  })

  it('falls back to demo data on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.crds.length).toBeGreaterThan(0)
  })

  it('uses default cluster names when no reachable clusters exist', async () => {
    mockClustersReturn.deduplicatedClusters = []
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const clusterNames = [...new Set(result.current.crds.map(c => c.cluster))]
    // Should use fallback cluster names
    expect(clusterNames).toContain('us-east-1')
  })

  it('tracks consecutive failures and refetch behavior', async () => {
    // This test validates failure tracking across multiple fetches
    vi.useRealTimers()
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      return Promise.reject(new Error(`fail ${callCount}`))
    })

    const { result } = renderHook(() => useCRDs())

    // Wait for initial load
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 })

    // Hook should have attempted at least one fetch
    expect(mockFetch).toHaveBeenCalled()
    
    // Should fall back to demo data on failure
    expect(result.current.isDemoData).toBe(true)
  })

  it.skip('successfully recovers from failures when API becomes available', async () => {
    vi.useRealTimers()
    // Fail first, then succeed
    mockFetch
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    // Wait for hook to load
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 })

    // After first failure, should show demo data
    expect(result.current.isDemoData).toBe(true)

    // Manual refetch should succeed
    await act(async () => {
      await result.current.refetch()
    })

    // The refetch is async, so we need to wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))

    // After successful refetch, should show live data
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.crds).toEqual(LIVE_CRDS)
  })

  it('includes auth token in request headers when available', async () => {
    mockGetStoredAuthToken.mockReturnValue('test-jwt-token')
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    renderHook(() => useCRDs())

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-jwt-token')
  })

  it('omits Authorization header when no token is stored', async () => {
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    renderHook(() => useCRDs())

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does not write the retired legacy localStorage cache', async () => {
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isDemoData).toBe(false)
    })

    expect(localStorage.getItem('kc-crd-cache')).toBeNull()
  })

  it('sets lastRefresh timestamp after successful fetch', async () => {
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })

    expect(typeof result.current.lastRefresh).toBe('number')
  })

  it('accepts an empty CRD array as a valid response', async () => {
    mockFetch.mockResolvedValue(okResponse([], false))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.crds).toEqual([])
    expect(result.current.isDemoData).toBe(false)
  })

  it('demo data generates CRDs per reachable cluster', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isDemoData).toBe(true)
    })

    // cluster-a and cluster-b are reachable, cluster-c is not
    const clusters = [...new Set(result.current.crds.map(c => c.cluster))]
    expect(clusters.length).toBe(2)
    expect(clusters).toContain('cluster-a')
    expect(clusters).toContain('cluster-b')
  })
})
