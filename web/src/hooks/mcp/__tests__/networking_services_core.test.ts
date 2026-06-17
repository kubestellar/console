import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { jsonResponse, pendingResponse } from './mcp-test-utils'

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
  it('returns initial loading state when no cache exists', () => {
    globalThis.fetch = vi.fn().mockReturnValue(pendingResponse())
    const { result } = renderHook(() => useServices())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])
  })
  it('returns services after successful REST fetch', async () => {
    const fakeServices = [
      { name: 'svc-a', namespace: 'default', cluster: 'cluster-1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ services: fakeServices }))

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services).toEqual(fakeServices)
    expect(result.current.error).toBeNull()
  })
  it('forwards cluster and namespace as query params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    renderHook(() => useServices('my-cluster', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })
  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    )
  })
  it('polls every REFRESH_INTERVAL_MS and clears the interval on unmount', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [] }),
    })

    const { unmount } = renderHook(() => useServices())

    // Advance time to trigger one poll cycle
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterPoll)
  })
  it('reacts to networking cache reset by clearing data and entering loading state', async () => {
    const fakeServices = [
      { name: 'svc-a', namespace: 'default', cluster: 'c1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: fakeServices }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.services.length).toBeGreaterThan(0))

    // Block the next fetch so loading state is visible after reset
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    // Trigger the real cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('services')
    expect(reset).toBeDefined()
    await act(async () => { reset!() })

    // Hook reacts: loading flag is set and visible data is cleared
    expect(result.current.isLoading).toBe(true)
    expect(result.current.services).toEqual([])
  })
  it('surfaces an error string on fetch failure (services surface errors per #11541)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // useServices surfaces an error so cards can distinguish "fetch failed" from "no data" (#11541)
    expect(result.current.error).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
  it('returns demo services when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServices())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.services.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // NEW: Service type parsing - all four Kubernetes service types
  // -------------------------------------------------------------------------
  it('correctly returns ClusterIP services with clusterIP field', async () => {
    const clusterIPService = {
      name: 'internal-api', namespace: 'default', cluster: 'c1',
      type: 'ClusterIP', clusterIP: '10.96.0.10', ports: ['8080/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [clusterIPService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0].type).toBe('ClusterIP')
    expect(result.current.services[0].clusterIP).toBe('10.96.0.10')
    expect(result.current.services[0].externalIP).toBeUndefined()
  })
  it('correctly returns LoadBalancer services with externalIP', async () => {
    const lbService = {
      name: 'public-api', namespace: 'production', cluster: 'prod-east',
      type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45',
      ports: ['80/TCP', '443/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [lbService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('LoadBalancer')
    expect(result.current.services[0].externalIP).toBe('52.14.123.45')
    expect(result.current.services[0].ports).toEqual(['80/TCP', '443/TCP'])
  })
  it('correctly returns NodePort services with port mappings', async () => {
    const nodePortService = {
      name: 'grafana', namespace: 'monitoring', cluster: 'staging',
      type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [nodePortService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('NodePort')
    expect(result.current.services[0].ports).toEqual(['3000:30300/TCP'])
  })
  it('correctly returns ExternalName services without clusterIP', async () => {
    const externalNameService = {
      name: 'external-db', namespace: 'data', cluster: 'c1',
      type: 'ExternalName', ports: [],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: [externalNameService] }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services[0].type).toBe('ExternalName')
    expect(result.current.services[0].clusterIP).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // NEW: Mixed service types in a single response
  // -------------------------------------------------------------------------
  it('handles mixed service types in a single response', async () => {
    const mixedServices = [
      { name: 'svc-clusterip', namespace: 'ns1', type: 'ClusterIP', clusterIP: '10.0.0.1', ports: ['80/TCP'] },
      { name: 'svc-lb', namespace: 'ns1', type: 'LoadBalancer', clusterIP: '10.0.0.2', externalIP: '1.2.3.4', ports: ['443/TCP'] },
      { name: 'svc-nodeport', namespace: 'ns1', type: 'NodePort', clusterIP: '10.0.0.3', ports: ['8080:30080/TCP'] },
      { name: 'svc-extname', namespace: 'ns1', type: 'ExternalName', ports: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ services: mixedServices }),
    })

    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.services).toHaveLength(4)
    const types = result.current.services.map(s => s.type)
    expect(types).toEqual(['ClusterIP', 'LoadBalancer', 'NodePort', 'ExternalName'])
  })

  // -------------------------------------------------------------------------
  // NEW: Empty response handling
  // -------------------------------------------------------------------------
})
