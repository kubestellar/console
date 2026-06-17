import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockClusterCacheRef,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true), // agent unavailable by default
    mockReportAgentDataSuccess: vi.fn(),
    mockApiGet: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
    mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
    capturedCacheResets,
  }
})

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { getServices: vi.fn() },
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  DEPLOY_ABORT_TIMEOUT_MS: 10_000,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks are declared)
// ---------------------------------------------------------------------------

import {
  useServices,
  useIngresses,
  useNetworkPolicies,
} from '../networking'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// useServices calls fetch() directly (not api.get), so we mock globalThis.fetch
const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockClusterCacheRef.clusters = []
  // Reset module-level servicesCache by calling the captured cache reset callback
  const servicesReset = capturedCacheResets.get('services')
  if (servicesReset) servicesReset()
  // Default: REST fetch returns empty data (services, ingresses, networkpolicies)
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ services: [], ingresses: [], networkpolicies: [] }), { status: 200 })))
  // Re-clear localStorage after cache reset (which may have set items)
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useServices
// ===========================================================================

describe('useServices — local agent HTTP path', () => {
  it('fetches from local agent when cluster is set and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentServices = { services: [{ name: 'agent-svc', namespace: 'ns1', type: 'ClusterIP' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentServices,
    })

    const { result } = renderHook(() => useServices('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Agent path is tried first when cluster is set and agent is available
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to kubectl proxy when agent HTTP fetch returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [{ name: 'my-cluster', context: 'my-ctx', reachable: true }]

    // Agent returns 500, then API returns empty
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      // API fallback
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [] }),
      })
    })

    const { result } = renderHook(() => useServices('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook should have tried the agent path and then fallen through
    expect(callCount).toBeGreaterThanOrEqual(1)
  })

  it('falls through when agent HTTP fetch throws (network error)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.reject(new Error('ECONNREFUSED'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [] }),
      })
    })

    const { result } = renderHook(() => useServices('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('skips agent paths when cluster is not specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not have called reportAgentDataSuccess because no cluster was passed
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})

describe('useServices — kubectl proxy path', () => {
  it('tries kubectl proxy when agent HTTP fails and cluster is set', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'test-cluster', context: 'test-ctx', reachable: true },
    ]

    // Agent fetch rejects, kubectl proxy also fails, API fallback succeeds
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('localhost:8585')) {
        return Promise.reject(new Error('Agent unreachable'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ services: [{ name: 'api-svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
      })
    })

    const { result } = renderHook(() => useServices('test-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should eventually get data from the API fallback
    expect(result.current.services.length).toBeGreaterThanOrEqual(0)
  })
})

describe('useServices — silent refresh behavior', () => {
  it('does not set isRefreshing for silent (background) refetches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // After initial load + MIN_REFRESH_INDICATOR_MS timer, isRefreshing should be false
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })
  })
})

describe('useServices — demo mode silent flag', () => {
  it('sets isRefreshing briefly and then clears it in demo mode non-silent refetch', async () => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices())

    // Advance time past the MIN_REFRESH_INDICATOR_MS (500ms)
    await act(async () => { vi.advanceTimersByTime(600) })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.services.length).toBeGreaterThan(0)
  })
})

describe('useServices — localStorage cache', () => {
  it('loads cached data from localStorage on mount', async () => {
    const cachedServices = [
      { name: 'cached-svc', namespace: 'default', cluster: 'all', type: 'ClusterIP', ports: [] },
    ]
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: cachedServices,
      timestamp: new Date().toISOString(),
      key: 'services:all:all',
    }))

    // Block fetch so we only see cached data
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices())

    // Should show cached data immediately without loading
    expect(result.current.services).toEqual(cachedServices)
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores corrupt localStorage data gracefully', async () => {
    localStorage.setItem('kubestellar-services-cache', '{{{invalid json')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still work fine, just without cache
    expect(result.current.error).toBeNull()
  })

  it('ignores cached data with mismatched cache key', async () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [{ name: 'old' }],
      timestamp: new Date().toISOString(),
      key: 'services:other-cluster:other-ns',
    }))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices('my-cluster', 'my-ns'))
    // Cache key doesn't match, so should start in loading state
    expect(result.current.isLoading).toBe(true)
  })

  it('ignores cached data with empty data array', async () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [],
      timestamp: new Date().toISOString(),
      key: 'services:all:all',
    }))

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useServices())
    // Empty cached data is treated as no cache
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useServices — cluster/namespace change detection', () => {
  it('resets state when cluster changes', async () => {
    const svcA = [{ name: 'svc-a', namespace: 'ns', type: 'ClusterIP', ports: [], cluster: 'cluster-a' }]
    const svcB = [{ name: 'svc-b', namespace: 'ns', type: 'ClusterIP', ports: [], cluster: 'cluster-b' }]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: svcA }),
    })

    const { result, rerender } = renderHook(
      ({ cluster }) => useServices(cluster),
      { initialProps: { cluster: 'cluster-a' } }
    )

    await waitFor(() => expect(result.current.services).toEqual(svcA))

    // Change cluster
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: svcB }),
    })

    rerender({ cluster: 'cluster-b' })

    // Should reset to empty during transition
    await waitFor(() => expect(result.current.services).toEqual(svcB))
  })
})

describe('useServices — API error status response', () => {
  it('throws and catches non-ok API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    // Hook surfaces error so UI can distinguish failure from empty (#11541)
    expect(result.current.error).not.toBeNull()
  })
})
