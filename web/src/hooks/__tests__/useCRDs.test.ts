/**
 * Tests for useCRDs hook — CRD data fetching with demo fallback.
 *
 * Validates cache loading/saving, auth headers, demo data generation,
 * auto-refresh, failure tracking, and the refetch mechanism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

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
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mockClustersReturn = {
    deduplicatedClusters: [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
      { name: 'cluster-c', reachable: false },
    ],
    isLoading: false,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCRDs', () => {
  beforeEach(resetState)
  afterEach(() => {
    vi.useRealTimers()
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

  it('increments consecutiveFailures on repeated failures', async () => {
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(1)
    })

    // Trigger a refetch
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.consecutiveFailures).toBe(2)
  })

  it('marks isFailed after 3 consecutive failures', async () => {
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useCRDs())

    // Wait for initial fetch failure
    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    })

    // Trigger more failures
    await act(async () => { await result.current.refetch() })
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3)
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures on successful fetch', async () => {
    // First call fails, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(1)
    })

    // Trigger refetch which succeeds
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isDemoData).toBe(false)
  })

  it('includes auth token in request headers when available', async () => {
    localStorage.setItem('token', 'test-jwt-token')
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

  it('saves successful live data to localStorage cache', async () => {
    mockFetch.mockResolvedValue(okResponse(LIVE_CRDS))

    const { result } = renderHook(() => useCRDs())

    await waitFor(() => {
      expect(result.current.isDemoData).toBe(false)
    })

    const cached = localStorage.getItem('kc-crd-cache')
    expect(cached).toBeTruthy()
    const parsed = JSON.parse(cached!)
    expect(parsed.data).toEqual(LIVE_CRDS)
    expect(parsed.isDemoData).toBe(false)
    expect(typeof parsed.timestamp).toBe('number')
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
