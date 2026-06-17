import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { jsonResponse } from './mcp-test-utils'

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

describe('useServices', () => {
  it('handles null services field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ services: null }))

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook uses `data.services || []` so null becomes empty array
    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })
  it('handles missing services field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}))

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // NEW: HTTP error status codes
  // -------------------------------------------------------------------------
  it('increments consecutiveFailures on HTTP 500 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).not.toBeNull() // services surface errors per #11541
  })
  it('sets isFailed to true after 3 consecutive failures', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })

    const { result } = renderHook(() => useServices())

    // First failure happens on mount
    await act(async () => { await Promise.resolve() })

    // Advance time to trigger polling and accumulate failures
    for (let i = 0; i < 3; i++) {
      await act(async () => { vi.advanceTimersByTime(120_000) })
      await act(async () => { await Promise.resolve() })
    }

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3)
    expect(result.current.isFailed).toBe(true)
  })
  it('resets consecutiveFailures to 0 on successful fetch after failures', async () => {
    // Start with a single failure then stop failing
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Now succeed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 'svc', namespace: 'ns', type: 'ClusterIP', ports: [] }] }),
    })
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
  })

  // -------------------------------------------------------------------------
  // NEW: Demo mode - cluster/namespace filtering
  // -------------------------------------------------------------------------
  it('filters demo services by cluster when specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // All returned services should belong to the 'staging' cluster
    expect(result.current.services.length).toBeGreaterThan(0)
    result.current.services.forEach(s => {
      expect(s.cluster).toBe('staging')
    })
  })
  it('filters demo services by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('prod-east', 'data'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services.length).toBeGreaterThan(0)
    result.current.services.forEach(s => {
      expect(s.cluster).toBe('prod-east')
      expect(s.namespace).toBe('data')
    })
  })
  it('returns empty array in demo mode when cluster does not match any demo data', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices('nonexistent-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // NEW: Cache key correctness
  // -------------------------------------------------------------------------
  it('generates distinct cache keys for different cluster/namespace combos', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    // Render with one set of params
    const { unmount } = renderHook(() => useServices('cluster-a', 'ns-a'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    unmount()

    // Render with different params - registerRefetch should be called with different key
    renderHook(() => useServices('cluster-b', 'ns-b'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    // registerRefetch calls should have distinct keys
    const refetchKeys = mockRegisterRefetch.mock.calls.map((c: unknown[]) => c[0])
    const uniqueKeys = new Set(refetchKeys)
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(2)
  })

  // -------------------------------------------------------------------------
  // NEW: lastUpdated and lastRefresh timestamps
  // -------------------------------------------------------------------------
  it('sets lastUpdated and lastRefresh timestamps on successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [{ name: 's', namespace: 'n', type: 'ClusterIP', ports: [] }] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.lastUpdated).toBeInstanceOf(Date)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  // -------------------------------------------------------------------------
  // NEW: Query param encoding without cluster/namespace
  // -------------------------------------------------------------------------
  it('omits cluster and namespace query params when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    renderHook(() => useServices())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).not.toContain('cluster=')
    expect(url).not.toContain('namespace=')
  })
})
