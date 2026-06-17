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

function useReachablePVCluster(name = 'c1', context = 'ctx1') {
  mockIsAgentUnavailable.mockReturnValue(false)
  mockClusterCacheRef.clusters = [{ name, context, reachable: true }]
}

// ===========================================================================
// usePVCs
// ===========================================================================

describe('usePVs', () => {
  it('returns empty array with loading state on mount', () => {
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => pendingResponse())
    const { result } = renderHook(() => usePVs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvs).toEqual([])
  })

  it('returns PVs after successful fetch', async () => {
    useReachablePVCluster()
    const fakePVs = [{ name: 'pv-1', capacity: '100Gi', storageClass: 'gp2', status: 'Available' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ pvs: fakePVs })))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([{ ...fakePVs[0], cluster: 'c1' }])
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: [] }), { status: 200 })))

    renderHook(() => usePVs('target-cluster'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=target-cluster')
  })

  it('refetch() triggers a new fetch', async () => {
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: [] }), { status: 200 })))
    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears interval on unmount', async () => {
    vi.useFakeTimers()
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: [] }), { status: 200 })))

    const { unmount } = renderHook(() => usePVs())

    // Advance time past one interval
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new API calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterPoll)
  })

  it('returns empty list with error message on fetch failure', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => usePVs('target-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBe('Failed to fetch PVs from any cluster')
  })
})

// ===========================================================================
// useResourceQuotas
// ===========================================================================

describe('usePVs - additional edge cases', () => {
  it('handles API returning null pvs field', async () => {
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: null }), { status: 200 })))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles API returning undefined pvs field', async () => {
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
  })

  it('tracks consecutive failures and isFailed for PVs', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => usePVs('target-cluster'))

    await act(async () => {
      await result.current.refetch()
      await result.current.refetch()
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('returns PVs with various storage classes and statuses', async () => {
    useReachablePVCluster()
    const mixedPVs = [
      { name: 'pv-available', capacity: '200Gi', storageClass: 'gp3', status: 'Available' },
      { name: 'pv-bound', capacity: '100Gi', storageClass: 'standard', status: 'Bound' },
      { name: 'pv-released', capacity: '50Gi', storageClass: 'fast-ssd', status: 'Released' },
      { name: 'pv-failed', capacity: '10Gi', storageClass: 'cold-storage', status: 'Failed' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: mixedPVs }), { status: 200 })))

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toHaveLength(4)
    const statuses = result.current.pvs.map(pv => pv.status)
    expect(statuses).toEqual(['Available', 'Bound', 'Released', 'Failed'])
  })
})

// ===========================================================================
// useResourceQuotas - additional edge cases
// ===========================================================================

describe('usePVs — additional branches', () => {
  it('returns the complete return shape with all expected keys', async () => {
    useReachablePVCluster()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: [] }), { status: 200 })))
    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('pvs')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
  })

  it('resets consecutiveFailures to 0 on successful fetch after errors', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    // First: fail
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => usePVs('target-cluster'))
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Then: succeed
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [{ name: 'target-cluster', context: 'target-cluster', reachable: true }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvs: [{ name: 'pv', status: 'Available' }] }), { status: 200 })))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.isFailed).toBe(false)
  })

  it('sets isRefreshing during fetch and clears after', async () => {
    useReachablePVCluster()
    let resolvePromise: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve }))

    const { result } = renderHook(() => usePVs())

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Resolve the API call
    await act(async () => { resolvePromise!(new Response(JSON.stringify({ pvs: [] }), { status: 200 })) })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })
})
