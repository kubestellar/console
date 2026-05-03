/**
 * Deep branch-coverage tests for useServiceExports.ts
 *
 * Tests the useServiceExports hook: initial cache load, API success path,
 * 503 fallback to demo data, network error fallback, demo data indicator,
 * empty array as valid result, auto-refresh, failure threshold, cache
 * expiry, auth headers, and cluster-based demo data generation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [] as Array<{ name: string; reachable?: boolean }>,
  isLoading: false,
}))
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10_000 }
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import hook under test AFTER mocks
// ---------------------------------------------------------------------------

import { useServiceExports } from '../useServiceExports'

// ---------------------------------------------------------------------------
// Constants (mirrored from source for clarity)
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kc-service-exports-cache'
const STATUS_SERVICE_UNAVAILABLE = 503
/** Failure threshold from source */
const FAILURE_THRESHOLD = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    json: () => Promise.resolve(data),
  })
}

function makeExport(name: string, cluster: string, status: 'Ready' | 'Pending' | 'Failed' = 'Ready') {
  return {
    name,
    namespace: 'default',
    cluster,
    serviceName: name,
    status,
    targetClusters: [],
    createdAt: new Date().toISOString(),
  }
}

function seedCache(exports: unknown[], isDemoData: boolean, ageMs = 0) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data: exports,
    timestamp: Date.now() - ageMs,
    isDemoData,
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useServiceExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'us-east-1', reachable: true },
        { name: 'eu-west-1', reachable: true },
      ],
      isLoading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Return shape ──────────────────────────────────────────────────

  it('returns the expected API shape', async () => {
    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    expect(result.current).toHaveProperty('exports')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(typeof result.current.refetch).toBe('function')
  })

  // ── isLoading reflects clusters loading ───────────────────────────

  it('isLoading is true when clusters are still loading', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isLoading: true,
    })

    const { result } = renderHook(() => useServiceExports())

    expect(result.current.isLoading).toBe(true)
  })

  // ── Successful API fetch ──────────────────────────────────────────

  it('fetches live data from API and sets isDemoData=false', async () => {
    const liveExports = [makeExport('api-gw', 'us-east-1')]
    mockFetch.mockReturnValue(jsonResponse({ exports: liveExports, isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.exports).toHaveLength(1)
    expect(result.current.exports[0].name).toBe('api-gw')
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('treats empty exports array as valid live data', async () => {
    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.exports).toEqual([])
    expect(result.current.isDemoData).toBe(false)
  })

  it('handles null exports field gracefully (treats as empty)', async () => {
    mockFetch.mockReturnValue(jsonResponse({ exports: null, isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.exports).toEqual([])
    expect(result.current.isDemoData).toBe(false)
  })

  // ── 503 fallback to demo data ─────────────────────────────────────

  it('falls back to demo data on 503 (no k8s client)', async () => {
    mockFetch.mockReturnValue(jsonResponse(null, STATUS_SERVICE_UNAVAILABLE))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.exports.length).toBeGreaterThan(0)
    expect(result.current.consecutiveFailures).toBe(1)
  })

  // ── Network error fallback ────────────────────────────────────────

  it('falls back to demo data on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.exports.length).toBeGreaterThan(0)
  })

  // ── Demo data indicator from API ──────────────────────────────────

  it('falls back to demo when API returns isDemoData=true', async () => {
    mockFetch.mockReturnValue(jsonResponse({
      exports: [makeExport('fake', 'c1')],
      isDemoData: true,
    }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    // The demo exports should be generated (not from API response)
    expect(result.current.consecutiveFailures).toBe(1)
  })

  // ── Failure threshold and isFailed ────────────────────────────────

  it('isFailed becomes true after reaching failure threshold', async () => {
    mockFetch.mockRejectedValue(new Error('down'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // 1 < FAILURE_THRESHOLD

    // Trigger more failures via refetch
    for (let i = 1; i < FAILURE_THRESHOLD; i++) {
      await act(async () => {
        await result.current.refetch()
      })
    }

    expect(result.current.consecutiveFailures).toBe(FAILURE_THRESHOLD)
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures on successful API response', async () => {
    // First: fail
    mockFetch.mockRejectedValueOnce(new Error('down'))

    const { result } = renderHook(() => useServiceExports())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(1)

    // Then: succeed
    mockFetch.mockReturnValue(jsonResponse({ exports: [makeExport('ok', 'c')], isDemoData: false }))

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isDemoData).toBe(false)
  })

  // ── localStorage cache ────────────────────────────────────────────

  it('loads initial data from cache when fresh', async () => {
    const cached = [makeExport('cached-svc', 'c1')]
    seedCache(cached, false, 0)  // fresh cache

    // Prevent the initial fetch from resolving immediately so we can
    // inspect the cached state
    let resolveFetch: (v: unknown) => void
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = r }))

    const { result } = renderHook(() => useServiceExports())

    // Should have loaded from cache immediately
    expect(result.current.exports).toHaveLength(1)
    expect(result.current.exports[0].name).toBe('cached-svc')
    // isLoading should be false since we have cache
    expect(result.current.isLoading).toBe(false)

    // Clean up the pending fetch
    await act(async () => {
      resolveFetch!(jsonResponse({ exports: cached, isDemoData: false }))
    })
  })

  it('ignores expired cache', async () => {
    const expired = [makeExport('old', 'c1')]
    /** 6 minutes ago - past the 5 minute expiry */
    const SIX_MINUTES_MS = 360_000
    seedCache(expired, false, SIX_MINUTES_MS)

    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    // Should not use expired cache, should show loading
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.exports).toEqual([])
  })

  it('saves fetched data to localStorage cache', async () => {
    const fresh = [makeExport('save-me', 'c1')]
    mockFetch.mockReturnValue(jsonResponse({ exports: fresh, isDemoData: false }))

    renderHook(() => useServiceExports())

    await waitFor(() => {
      const stored = localStorage.getItem(CACHE_KEY)
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.data).toHaveLength(1)
      expect(parsed.data[0].name).toBe('save-me')
      expect(parsed.isDemoData).toBe(false)
    })
  })

  it('saves demo data to cache on fallback', async () => {
    mockFetch.mockRejectedValue(new Error('fail'))

    renderHook(() => useServiceExports())

    await waitFor(() => {
      const stored = localStorage.getItem(CACHE_KEY)
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.isDemoData).toBe(true)
      expect(parsed.data.length).toBeGreaterThan(0)
    })
  })

  // ── Demo data generation with cluster names ───────────────────────

  it('generates demo data based on available cluster names', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'alpha', reachable: true },
        { name: 'beta', reachable: true },
        { name: 'gamma', reachable: true },
      ],
      isLoading: false,
    })
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const clusterNames = [...new Set(result.current.exports.map(e => e.cluster))]
    expect(clusterNames).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']))
  })

  it('uses default cluster names when no clusters available', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isLoading: false,
    })
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const clusterNames = [...new Set(result.current.exports.map(e => e.cluster))]
    // Should use the default fallback names
    expect(clusterNames.length).toBeGreaterThan(0)
  })

  it('excludes unreachable clusters from demo data generation', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'live', reachable: true },
        { name: 'dead', reachable: false },
      ],
      isLoading: false,
    })
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const clusterNames = result.current.exports.map(e => e.cluster)
    expect(clusterNames).not.toContain('dead')
  })

  // ── Auth headers ──────────────────────────────────────────────────

  it('includes Authorization header when token exists', async () => {
    localStorage.setItem('token', 'test-jwt')
    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/service-exports',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt',
          }),
        }),
      )
    })
  })

  it('omits Authorization header when no token', async () => {
    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    renderHook(() => useServiceExports())

    await waitFor(() => {
      const headers = mockFetch.mock.calls[0]?.[1]?.headers
      expect(headers).not.toHaveProperty('Authorization')
    })
  })

  // ── Non-ok HTTP status (non-503) ──────────────────────────────────

  it('falls back to demo on non-503 HTTP error (e.g. 500)', async () => {
    mockFetch.mockReturnValue(jsonResponse(null, 500))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.consecutiveFailures).toBe(1)
  })

  // ── lastRefresh tracking ──────────────────────────────────────────

  it('updates lastRefresh on successful fetch', async () => {
    mockFetch.mockReturnValue(jsonResponse({ exports: [], isDemoData: false }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).not.toBeNull()
    expect(typeof result.current.lastRefresh).toBe('number')
  })

  it('updates lastRefresh on failed fetch (demo fallback)', async () => {
    mockFetch.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).not.toBeNull()
  })
})
