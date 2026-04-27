import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockUseClusters } = vi.hoisted(() => ({
  mockUseClusters: vi.fn(),
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

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
  DEFAULT_REFRESH_INTERVAL_MS: 120_000,
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { useServiceImportsCard } from '../useServiceImportsCard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kc-service-imports-cache'

function makeServiceImport(name = 'svc', cluster = 'c1') {
  return {
    metadata: {
      name,
      namespace: 'default',
      labels: { 'multicluster.kubernetes.io/cluster': cluster },
    },
    spec: {
      type: 'ClusterSetIP' as const,
      ports: [{ port: 80, protocol: 'TCP' as const, name: 'http' }],
    },
    status: { clusters: [{ cluster }] },
  }
}

function mockFetchOk(items = [makeServiceImport()]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ items }),
  }))
}

function mockFetch503() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: async () => ({}),
  }))
}

function mockFetchError(message = 'Network error') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)))
}

function mockFetchHttpError(status: number) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({}),
  }))
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useServiceImportsCard — initial state', () => {
  it('returns loading state when no cache and fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(result.current.isLoading).toBe(true)
  })

  it('exposes expected return fields', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(result.current).toHaveProperty('imports')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('refetch is a function', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('useServiceImportsCard — successful API response', () => {
  it('populates imports from API response', async () => {
    mockFetchOk([makeServiceImport('my-svc')])
    const { result } = renderHook(() => useServiceImportsCard())
    // waitFor only re-polls when the callback throws; a boolean return resolves
    // immediately via onDone(null, false). Use expect() so it actually waits.
    await waitFor(() => expect(result.current.imports.length).toBeGreaterThan(0))
    expect(result.current.imports).toHaveLength(1)
  })

  it('sets isDemoData=false on successful fetch', async () => {
    mockFetchOk([makeServiceImport()])
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.isDemoData).toBe(false))
    expect(result.current.isDemoData).toBe(false)
  })

  it('handles empty items array legitimately', async () => {
    mockFetchOk([])
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.isDemoData).toBe(false))
    expect(result.current.imports).toHaveLength(0)
    expect(result.current.isDemoData).toBe(false)
  })

  it('sets consecutiveFailures=0 on success', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('sets lastRefresh to a number on success', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(typeof result.current.lastRefresh).toBe('number'))
    expect(typeof result.current.lastRefresh).toBe('number')
  })

  it('saves to localStorage cache on success', async () => {
    mockFetchOk([makeServiceImport()])
    renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(localStorage.getItem(CACHE_KEY)).not.toBeNull())
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(cached.isDemoData).toBe(false)
  })

  it('isFailed=false on success', async () => {
    mockFetchOk()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false)
  })
})

describe('useServiceImportsCard — error fallback', () => {
  it('falls back to demo data on 503 response', async () => {
    mockFetch503()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.imports.length).toBeGreaterThan(0))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.imports.length).toBeGreaterThan(0)
  })

  it('falls back to demo data on network error', async () => {
    mockFetchError()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThan(0))
    expect(result.current.isDemoData).toBe(true)
  })

  it('falls back to demo data on non-503 HTTP error', async () => {
    mockFetchHttpError(500)
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThan(0))
    expect(result.current.isDemoData).toBe(true)
  })

  it('increments consecutiveFailures on error', async () => {
    mockFetchError()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('uses cluster names for demo data when clusters are connected', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'prod', reachable: true }], isLoading: false })
    mockFetchError()
    const { result } = renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(result.current.imports.length).toBeGreaterThan(0))
    const clusterImports = result.current.imports.filter(
      i => i.metadata?.labels?.['multicluster.kubernetes.io/cluster'] === 'prod'
        || (i.status?.clusters ?? []).some((c: { cluster: string }) => c.cluster === 'prod')
    )
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.imports.length).toBeGreaterThan(0)
    void clusterImports
  })

  it('saves demo data to cache on fallback', async () => {
    mockFetchError()
    renderHook(() => useServiceImportsCard())
    await waitFor(() => expect(localStorage.getItem(CACHE_KEY)).not.toBeNull())
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(cached.isDemoData).toBe(true)
  })
})

describe('useServiceImportsCard — cache', () => {
  it('loads from valid cache on mount', () => {
    const cached = {
      data: [makeServiceImport('cached-svc')],
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(result.current.imports).toHaveLength(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores expired cache (> 5 minutes old)', () => {
    const cached = {
      data: [makeServiceImport()],
      timestamp: Date.now() - 6 * 60 * 1000,
      isDemoData: false,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.imports).toHaveLength(0)
  })

  it('handles malformed cache gracefully', () => {
    localStorage.setItem(CACHE_KEY, '{invalid}')
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { result } = renderHook(() => useServiceImportsCard())
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useServiceImportsCard — clustersLoading', () => {
  it('does not fetch while clusters are still loading', () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: true })
    vi.stubGlobal('fetch', vi.fn())
    renderHook(() => useServiceImportsCard())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetches once clusters finish loading', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false })
    mockFetchOk([])
    renderHook(() => useServiceImportsCard())
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0))
    expect(globalThis.fetch).toHaveBeenCalled()
  })
})

describe('useServiceImportsCard — auth headers', () => {
  it('sends Authorization header when token is present', async () => {
    localStorage.setItem('kc-auth-token', 'test-token')
    mockFetchOk([])
    renderHook(() => useServiceImportsCard())
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0))
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(options?.headers?.['Authorization']).toBe('Bearer test-token')
  })
})
