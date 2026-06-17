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

describe('useLimitRanges', () => {
  it('returns empty array with loading state on mount', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useLimitRanges())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.limitRanges).toEqual([])
  })

  it('returns limit ranges after fetch resolves', async () => {
    const fakeLRs = [{ name: 'container-limits', namespace: 'production', cluster: 'c1', limits: [], age: '30d' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ limitRanges: fakeLRs }), { status: 200 })))

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual(fakeLRs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ limitRanges: [] }), { status: 200 })))

    renderHook(() => useLimitRanges('test-cluster', 'test-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=test-cluster')
    expect(url).toContain('namespace=test-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ limitRanges: [] }), { status: 200 })))
    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns demo limit ranges in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty list with error: null on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// usePVCs - PVC capacity parsing and varied data shapes
// ===========================================================================

describe('useLimitRanges - additional edge cases', () => {
  it('handles API returning null limitRanges field', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ limitRanges: null }), { status: 200 })))

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo limit ranges by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('vllm-d'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr => lr.cluster === 'vllm-d')).toBe(true)
  })

  it('filters demo limit ranges by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges(undefined, 'data'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr => lr.namespace === 'data')).toBe(true)
  })
})

// ===========================================================================
// createOrUpdateResourceQuota
// ===========================================================================

describe('subscribeStorageCache', () => {
  it('subscribes to cache notifications and can unsubscribe', async () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribeStorageCache(subscriber)

    // Trigger a cache reset to invoke subscribers
    const reset = capturedCacheResets.get('storage')
    expect(reset).toBeDefined()
    reset!()

    // Subscriber should have been called with isResetting=true
    expect(subscriber).toHaveBeenCalled()
    const callArg = subscriber.mock.calls[0][0]
    expect(callArg.isResetting).toBe(true)

    // After unsubscribe, no further notifications
    unsubscribe()
    subscriber.mockClear()
    reset!()
    expect(subscriber).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Exported constants
// ===========================================================================

describe('GPU_RESOURCE_TYPES', () => {
  it('contains NVIDIA and AMD GPU resource types', () => {
    const keys = GPU_RESOURCE_TYPES.map(t => t.key)
    expect(keys).toContain('requests.nvidia.com/gpu')
    expect(keys).toContain('limits.nvidia.com/gpu')
    expect(keys).toContain('requests.amd.com/gpu')
    expect(keys).toContain('limits.amd.com/gpu')
  })

  it('has exactly 4 GPU resource type entries', () => {
    expect(GPU_RESOURCE_TYPES).toHaveLength(4)
  })
})

describe('COMMON_RESOURCE_TYPES', () => {
  it('includes all GPU_RESOURCE_TYPES entries', () => {
    const commonKeys = COMMON_RESOURCE_TYPES.map(t => t.key)
    for (const gpu of GPU_RESOURCE_TYPES) {
      expect(commonKeys).toContain(gpu.key)
    }
  })

  it('includes standard resource types (cpu, memory, pods, services, pvcs, storage)', () => {
    const commonKeys = COMMON_RESOURCE_TYPES.map(t => t.key)
    expect(commonKeys).toContain('requests.cpu')
    expect(commonKeys).toContain('limits.cpu')
    expect(commonKeys).toContain('requests.memory')
    expect(commonKeys).toContain('limits.memory')
    expect(commonKeys).toContain('pods')
    expect(commonKeys).toContain('services')
    expect(commonKeys).toContain('persistentvolumeclaims')
    expect(commonKeys).toContain('requests.storage')
  })

  it('has 12 total entries (8 common + 4 GPU)', () => {
    const EXPECTED_COMMON_COUNT = 8
    const EXPECTED_GPU_COUNT = 4
    expect(COMMON_RESOURCE_TYPES).toHaveLength(EXPECTED_COMMON_COUNT + EXPECTED_GPU_COUNT)
  })

  it('each entry has key, label, and description', () => {
    for (const entry of COMMON_RESOURCE_TYPES) {
      expect(entry.key).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  })
})

// ===========================================================================
// Additional branch coverage — storage.ts
// ===========================================================================

describe('useLimitRanges — additional branches', () => {
  it('filters demo limit ranges by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges.length).toBeGreaterThan(0)
    expect(result.current.limitRanges.every(lr =>
      lr.cluster === 'prod-east' && lr.namespace === 'production'
    )).toBe(true)
  })

  it('handles API returning undefined limitRanges field', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

    const { result } = renderHook(() => useLimitRanges())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
  })

  it('returns empty array when demo mode filter produces no matches', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useLimitRanges('nonexistent-cluster', 'nonexistent-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limitRanges).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

describe('subscribeStorageCache', () => {
  it('returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeStorageCache(callback)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('does not call callback after unsubscribe', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeStorageCache(callback)
    unsubscribe()
    // After unsubscribing, the callback should not be notified
    expect(callback).not.toHaveBeenCalled()
  })
})
