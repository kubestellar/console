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

// ===========================================================================
// usePVCs
// ===========================================================================

describe('usePVCs', () => {
  it('returns initial loading state when no cache exists', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => pendingResponse())
    const { result } = renderHook(() => usePVCs())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvcs).toEqual([])
  })

  it('returns PVCs after successful REST fetch', async () => {
    const fakePVCs = [
      { name: 'pvc-1', namespace: 'default', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'standard' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ pvcs: fakePVCs })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual(fakePVCs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [] }), { status: 200 })))

    renderHook(() => usePVCs('my-cluster', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [] }), { status: 200 })))
    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('polls every REFRESH_INTERVAL_MS and clears the interval on unmount', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: [] }), { status: 200 })))

    const { unmount } = renderHook(() => usePVCs())

    // Advance time past one interval
    await act(async () => { vi.advanceTimersByTime(150_000) })

    const callsAfterPoll = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterPoll).toBeGreaterThan(0)

    unmount()

    // After unmount the interval is cleared; no new API calls
    await act(async () => { vi.advanceTimersByTime(150_000) })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterPoll)
  })

  it('reacts to storage cache reset by clearing data and entering loading state', async () => {
    const fakePVCs = [
      { name: 'pvc-1', namespace: 'default', cluster: 'c1', status: 'Bound', capacity: '10Gi', storageClass: 'standard' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: fakePVCs }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())
    await waitFor(() => expect(result.current.pvcs.length).toBeGreaterThan(0))

    // Block the next fetch so loading state is visible after reset
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))

    // Trigger the real cache reset via the captured registerCacheReset callback
    const reset = capturedCacheResets.get('storage')
    expect(reset).toBeDefined()
    await act(async () => { reset!() })

    // Hook reacts: loading flag is set and visible data is cleared
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvcs).toEqual([])
  })

  it('returns demo PVCs in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty PVCs with error message on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch error'))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('fetch error')
  })
})

// ===========================================================================
// usePVs
// ===========================================================================

describe('usePVCs - capacity and data shape variants', () => {
  it('handles PVCs with various capacity units (Gi, Ti, Mi)', async () => {
    const pvcsMixed = [
      { name: 'small-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '100Mi', storageClass: 'standard' },
      { name: 'medium-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '50Gi', storageClass: 'gp3' },
      { name: 'large-pvc', namespace: 'ns1', cluster: 'c1', status: 'Bound', capacity: '2Ti', storageClass: 'fast-ssd' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: pvcsMixed }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(3)
    expect(result.current.pvcs[0].capacity).toBe('100Mi')
    expect(result.current.pvcs[1].capacity).toBe('50Gi')
    expect(result.current.pvcs[2].capacity).toBe('2Ti')
  })

  it('handles PVCs with missing optional fields (no capacity, no storageClass)', async () => {
    const sparseData = [
      { name: 'minimal-pvc', namespace: 'default', status: 'Pending' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: sparseData }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toHaveLength(1)
    expect(result.current.pvcs[0].capacity).toBeUndefined()
    expect(result.current.pvcs[0].storageClass).toBeUndefined()
  })

  it('handles API returning null pvcs field gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ pvcs: null }), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles API returning undefined pvcs field gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

    const { result } = renderHook(() => usePVCs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo PVCs by cluster when cluster is specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo data has PVCs on prod-east, staging, and vllm-d
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo PVCs by namespace when namespace is specified', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs(undefined, 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.namespace === 'monitoring')).toBe(true)
  })

  it('filters demo PVCs by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => usePVCs('staging', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvcs.length).toBeGreaterThan(0)
    expect(result.current.pvcs.every(p => p.cluster === 'staging' && p.namespace === 'monitoring')).toBe(true)
  })
})

// ===========================================================================
// usePVCs - multi-cluster aggregation via local agent
// ===========================================================================
