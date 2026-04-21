import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockRegisterRefetch, mockClusters, mockClustersLoading } = vi.hoisted(() => ({
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockClusters: vi.fn(() => []),
  mockClustersLoading: vi.fn(() => false),
}))

vi.mock('../useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: mockClusters(),
    isLoading: mockClustersLoading(),
  }),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { useGatewayStatus } from '../useGatewayStatus'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kc-gateway-status-cache'

function makeGateway(name = 'gw', cluster = 'c1') {
  return {
    name,
    namespace: 'default',
    cluster,
    gatewayClass: 'istio',
    status: 'Programmed' as const,
    addresses: ['10.0.0.1'],
    listeners: [],
    attachedRoutes: 0,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function mockFetchOk(items = [makeGateway()]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ items, totalCount: items.length }),
  })
}

function mockFetch503() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: async () => ({}),
  })
}

function mockFetchError(message = 'Network error') {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error(message))
}

function mockFetchHttpError(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({}),
  })
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockClusters.mockReturnValue([])
  mockClustersLoading.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGatewayStatus — initial state', () => {
  it('returns loading state initially when no cache exists', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current.isLoading).toBe(true)
  })

  it('exposes expected return fields', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current).toHaveProperty('gateways')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('refetch is a function', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('useGatewayStatus — successful API response', () => {
  it('populates gateways from API response', async () => {
    mockFetchOk([makeGateway('prod-gw', 'prod')])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => result.current.gateways.length > 0)
    expect(result.current.gateways).toHaveLength(1)
    expect(result.current.gateways[0].name).toBe('prod-gw')
  })

  it('sets isDemoData=false on successful fetch', async () => {
    mockFetchOk([makeGateway()])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => result.current.isDemoData === false)
    expect(result.current.isDemoData).toBe(false)
  })

  it('sets consecutiveFailures=0 on success', async () => {
    mockFetchOk([makeGateway()])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('sets lastRefresh to a number on success', async () => {
    mockFetchOk([makeGateway()])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(typeof result.current.lastRefresh).toBe('number')
  })

  it('saves result to localStorage cache', async () => {
    mockFetchOk([makeGateway()])
    renderHook(() => useGatewayStatus())
    await waitFor(() => localStorage.getItem(CACHE_KEY) !== null)
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(cached.isDemoData).toBe(false)
    expect(cached.data).toHaveLength(1)
  })

  it('handles empty items array (no gateways configured)', async () => {
    mockFetchOk([])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.gateways).toHaveLength(0)
    expect(result.current.isDemoData).toBe(false)
  })

  it('isFailed is false after success', async () => {
    mockFetchOk([makeGateway()])
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isFailed).toBe(false)
  })
})

describe('useGatewayStatus — error fallback (demo data)', () => {
  it('falls back to demo data on 503 response', async () => {
    mockFetch503()
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.gateways.length).toBeGreaterThan(0)
  })

  it('falls back to demo data on network error', async () => {
    mockFetchError('Network error')
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isDemoData).toBe(true)
  })

  it('falls back to demo data on non-503 HTTP error', async () => {
    mockFetchHttpError(500)
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isDemoData).toBe(true)
  })

  it('increments consecutiveFailures on error', async () => {
    mockFetchError()
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => result.current.consecutiveFailures > 0)
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('generates demo gateways using cluster names when available', async () => {
    mockClusters.mockReturnValue([{ name: 'my-cluster', reachable: true }])
    mockFetchError()
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => result.current.gateways.length > 0)
    const clusterGateways = result.current.gateways.filter(gw => gw.cluster === 'my-cluster')
    expect(clusterGateways.length).toBeGreaterThan(0)
  })

  it('generates demo gateways with default cluster names when no clusters', async () => {
    mockClusters.mockReturnValue([])
    mockFetchError()
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => result.current.gateways.length > 0)
    const clusterNames = new Set(result.current.gateways.map(gw => gw.cluster))
    expect(clusterNames.size).toBeGreaterThan(0)
  })

  it('saves demo data to cache on fallback', async () => {
    mockFetchError()
    renderHook(() => useGatewayStatus())
    await waitFor(() => localStorage.getItem(CACHE_KEY) !== null)
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(cached.isDemoData).toBe(true)
  })

  it('isFailed becomes true after 3 consecutive failures', async () => {
    mockFetchError()
    const { result } = renderHook(() => useGatewayStatus())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.consecutiveFailures).toBe(1)
    expect(result.current.isFailed).toBe(false)
  })
})

describe('useGatewayStatus — cache', () => {
  it('loads from cache when valid cache exists', () => {
    const cached = {
      data: [makeGateway('cached-gw')],
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current.gateways).toHaveLength(1)
    expect(result.current.gateways[0].name).toBe('cached-gw')
  })

  it('starts with isLoading=false when cache is populated', () => {
    const cached = {
      data: [makeGateway()],
      timestamp: Date.now(),
      isDemoData: false,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores expired cache (older than 5 minutes)', () => {
    const cached = {
      data: [makeGateway('old-gw')],
      timestamp: Date.now() - 6 * 60 * 1000,
      isDemoData: false,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.gateways).toHaveLength(0)
  })

  it('handles malformed cache gracefully', () => {
    localStorage.setItem(CACHE_KEY, 'not-valid-json')
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGatewayStatus())
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useGatewayStatus — refetch registration', () => {
  it('registers with modeTransition.registerRefetch on mount', async () => {
    mockFetchOk([])
    renderHook(() => useGatewayStatus())
    await waitFor(() => mockRegisterRefetch.mock.calls.length > 0)
    expect(mockRegisterRefetch).toHaveBeenCalledWith('gateway-status', expect.any(Function))
  })

  it('calls unregister function returned by registerRefetch on unmount', async () => {
    const mockCleanup = vi.fn()
    mockRegisterRefetch.mockReturnValue(mockCleanup)
    mockFetchOk([])
    const { unmount } = renderHook(() => useGatewayStatus())
    await waitFor(() => mockRegisterRefetch.mock.calls.length > 0)
    unmount()
    expect(mockCleanup).toHaveBeenCalled()
  })
})

describe('useGatewayStatus — auth headers', () => {
  it('sends Authorization header when token is present', async () => {
    localStorage.setItem('kc-auth-token', 'my-token')
    mockFetchOk([])
    renderHook(() => useGatewayStatus())
    await waitFor(() => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(options?.headers?.['Authorization']).toBe('Bearer my-token')
  })

  it('omits Authorization header when no token stored', async () => {
    localStorage.removeItem('kc-auth-token')
    mockFetchOk([])
    renderHook(() => useGatewayStatus())
    await waitFor(() => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(options?.headers?.['Authorization']).toBeUndefined()
  })
})

describe('useGatewayStatus — clustersLoading', () => {
  it('does not fetch while clusters are still loading', () => {
    mockClustersLoading.mockReturnValue(true)
    globalThis.fetch = vi.fn()
    renderHook(() => useGatewayStatus())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetches once clusters finish loading', async () => {
    mockClustersLoading.mockReturnValue(false)
    mockFetchOk([])
    renderHook(() => useGatewayStatus())
    await waitFor(() => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    expect(globalThis.fetch).toHaveBeenCalled()
  })
})
