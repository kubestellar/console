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
  mockApiPost,
  mockApiDelete,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockKubectlProxy,
  mockClusterCacheRef,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true),
    mockReportAgentDataSuccess: vi.fn(),
    mockApiGet: vi.fn(),
    mockApiPost: vi.fn(),
    mockApiDelete: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
    mockKubectlProxy: { getPVCs: vi.fn() },
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
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
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
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  usePVCs,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  subscribeStorageCache,
  GPU_RESOURCE_TYPES,
  COMMON_RESOURCE_TYPES,
} from '../storage'
// Import the same constant the source hooks use so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173).
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [], pvs: [], resourceQuotas: [], limitRanges: [], resourceQuota: {} }), { status: 200 })))
  // Reset module-level caches to prevent cross-test contamination.
  // The registerCacheReset callback sets pvcsCache = null internally.
  const resetStorage = capturedCacheResets.get('storage')
  if (resetStorage) resetStorage()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// usePVCs
// ===========================================================================

describe('usePVCs - multi-cluster aggregation via local agent', () => {
  it('aggregates PVCs from multiple clusters via local agent', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]

    const pvcA = { name: 'pvc-a', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }
    const pvcB = { name: 'pvc-b', namespace: 'ns2', status: 'Bound', capacity: '20Gi' }

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [pvcA] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [pvcB] }),
      })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(2)
    // Each PVC should be tagged with its cluster name
    expect(result.current.pvcs[0].cluster).toBe('cluster-a')
    expect(result.current.pvcs[1].cluster).toBe('cluster-b')
    expect(result.current.error).toBeNull()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('handles partial cluster failure when one agent endpoint fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'good-cluster', context: 'ctx-good', reachable: true },
      { name: 'bad-cluster', context: 'ctx-bad', reachable: true },
    ]

    const goodPvc = { name: 'pvc-good', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pvcs: [goodPvc] }),
      })
      .mockRejectedValueOnce(new Error('cluster unreachable'))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still return data from the successful cluster
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('pvc-good')
  })

  it('skips unreachable clusters in aggregation', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'reachable', context: 'ctx-r', reachable: true },
      { name: 'unreachable', context: 'ctx-u', reachable: false },
    ]

    const pvc = { name: 'pvc-r', namespace: 'ns1', status: 'Bound', capacity: '5Gi' }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [pvc] }),
    })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    // fetch should only be called once (for the reachable cluster)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches from single cluster via agent when cluster param is provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]

    const pvc = { name: 'specific-pvc', namespace: 'ns1', status: 'Bound', capacity: '10Gi' }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvcs: [pvc] }),
    })

    const { result } = renderHook(() => usePVCs('target-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should only call fetch once for the specified cluster, not iterate all
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=target-cluster')
  })
})

// ===========================================================================
// usePVCs - kubectl proxy fallback
// ===========================================================================

describe('usePVCs - kubectl proxy fallback', () => {
  it('falls back to kubectl proxy when agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-x', context: 'ctx-x', reachable: true },
    ]

    // Agent fetch returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    const kubePvc = { name: 'kubectl-pvc', namespace: 'default', status: 'Bound', capacity: '8Gi', storageClass: 'standard' }
    mockKubectlProxy.getPVCs.mockResolvedValue([kubePvc])

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockKubectlProxy.getPVCs).toHaveBeenCalled()
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('kubectl-pvc')
    expect(result.current.pvcs[0].cluster).toBe('cluster-x')
  })
})

// ===========================================================================
// usePVCs - consecutive failures and isFailed
// ===========================================================================

describe('usePVCs - consecutive failure tracking', () => {
  it('sets isFailed=true after 3 consecutive API failures', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => usePVCs())

    await act(async () => {
      await result.current.refetch()
      await result.current.refetch()
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures to 0 on successful fetch', async () => {
    // Start with a single failure
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Now succeed
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [{ name: 'pvc-ok', namespace: 'ns', status: 'Bound' }] }), { status: 200 })))
    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
    expect(result.current.pvcs).toHaveLength(1)
  })
})

// ===========================================================================
// usePVs - additional edge cases
// ===========================================================================

describe('usePVCs — additional branches', () => {
  it('returns the complete return shape with all expected keys', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [] }), { status: 200 })))
    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('pvcs')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('agent endpoint non-ok falls through to kubectl proxy', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-y', context: 'ctx-y', reachable: true },
    ]

    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    // kubectl proxy succeeds
    const kubePvc = { name: 'kube-pvc', namespace: 'default', status: 'Bound', capacity: '5Gi', storageClass: 'gp2' }
    mockKubectlProxy.getPVCs.mockResolvedValue([kubePvc])

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockKubectlProxy.getPVCs).toHaveBeenCalled()
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].cluster).toBe('cluster-y')
  })

  it('both agent and kubectl proxy fail — falls through to REST API', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-z', context: 'ctx-z', reachable: true },
    ]

    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    // kubectl proxy also fails
    mockKubectlProxy.getPVCs.mockRejectedValue(new Error('kubectl failed'))

    // REST API succeeds
    const restPvc = { name: 'rest-pvc', namespace: 'ns', cluster: 'cluster-z', status: 'Bound', capacity: '10Gi' }
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [restPvc] }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('rest-pvc')
  })

  it('preserves stale data on error when cache exists', async () => {
    const initialPvc = { name: 'cached-pvc', namespace: 'ns', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'gp3' }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ pvcs: [initialPvc] }), { status: 200 }))

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.pvcs).toHaveLength(1))

    // Next fetch fails — hang subsequent calls to prevent cascade
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('server error'))
      .mockImplementation(() => new Promise(() => {}))
    await act(async () => { await result.current.refetch() })

    // Should preserve cached data, not clear it
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].name).toBe('cached-pvc')
  })

  it('sets lastUpdated and lastRefresh after successful fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [{ name: 'p', namespace: 'n', status: 'Bound' }] }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastUpdated).not.toBeNull()
    expect(result.current.lastRefresh).not.toBeNull()
  })

  it('demo mode sets lastUpdated on successful demo data load', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastUpdated).not.toBeNull()
  })
})
