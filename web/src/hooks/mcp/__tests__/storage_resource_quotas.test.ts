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

describe('useResourceQuotas', () => {
  it('returns empty array with loading state on mount', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useResourceQuotas())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resourceQuotas).toEqual([])
  })

  it('returns resource quotas after fetch resolves', async () => {
    const fakeQuotas = [{ name: 'compute-quota', namespace: 'production', cluster: 'c1', hard: { pods: '50' }, used: { pods: '10' }, age: '30d' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: fakeQuotas }), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual(fakeQuotas)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: [] }), { status: 200 })))

    renderHook(() => useResourceQuotas('my-cluster', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: [] }), { status: 200 })))
    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns demo quotas in demo mode (without forceLive)', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('bypasses demo mode and fetches live data when forceLive=true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const liveQuotas = [{ name: 'live-quota', namespace: 'prod', cluster: 'c1', hard: { pods: '100' }, used: { pods: '20' }, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: liveQuotas }), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas(undefined, undefined, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive=true skips demo data; real API is called and live data is returned
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(result.current.resourceQuotas).toEqual(liveQuotas)
    expect(result.current.error).toBeNull()
  })

  it('returns empty list with error: null on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useLimitRanges
// ===========================================================================

describe('useResourceQuotas - additional edge cases', () => {
  it('handles API returning null resourceQuotas field', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: null }), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('filters demo quotas by cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q => q.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo quotas by namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas(undefined, 'ml'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q => q.namespace === 'ml')).toBe(true)
  })
})

// ===========================================================================
// useLimitRanges - additional edge cases
// ===========================================================================

describe('createOrUpdateResourceQuota', () => {
  it('posts to API and returns the created quota', async () => {
    const spec = {
      cluster: 'prod-east',
      name: 'new-quota',
      namespace: 'default',
      hard: { pods: '100', 'requests.cpu': '10' },
    }
    const createdQuota = { ...spec, used: { pods: '0', 'requests.cpu': '0' }, age: '0s' }
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuota: createdQuota }), { status: 200 })))

    const result = await createOrUpdateResourceQuota(spec)

    expect(globalThis.fetch).toHaveBeenCalledWith(`${LOCAL_AGENT_HTTP_URL}/resourcequotas`, expect.objectContaining({ method: 'POST', body: JSON.stringify(spec) }))
    expect(result).toEqual(createdQuota)
  })

  it('propagates API error on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('403 Forbidden'))

    await expect(createOrUpdateResourceQuota({
      cluster: 'c1',
      name: 'q1',
      namespace: 'ns',
      hard: { pods: '10' },
    })).rejects.toThrow('403 Forbidden')
  })
})

// ===========================================================================
// deleteResourceQuota
// ===========================================================================

describe('deleteResourceQuota', () => {
  it('sends DELETE request with correct query parameters', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))

    await deleteResourceQuota('prod-east', 'default', 'compute-quota')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${LOCAL_AGENT_HTTP_URL}/resourcequotas?cluster=prod-east&namespace=default&name=compute-quota`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('propagates API error on delete failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('404 Not Found'))

    await expect(deleteResourceQuota('c1', 'ns', 'missing')).rejects.toThrow('404 Not Found')
  })
})

// ===========================================================================
// subscribeStorageCache
// ===========================================================================

describe('useResourceQuotas — additional branches', () => {
  it('filters demo quotas by both cluster and namespace', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas.length).toBeGreaterThan(0)
    expect(result.current.resourceQuotas.every(q =>
      q.cluster === 'prod-east' && q.namespace === 'production'
    )).toBe(true)
  })

  it('handles API returning undefined resourceQuotas field', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resourceQuotas).toEqual([])
  })

  it('provides a refetch function that can be called multiple times', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: [] }), { status: 200 })))
    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })
    await act(async () => { await result.current.refetch() })

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

// ===========================================================================
// useResourceQuotas - isDemoFallback wiring (Issue 9356)
// ===========================================================================

describe('useResourceQuotas — isDemoFallback wiring (Issue 9356)', () => {
  it('returns isDemoFallback: true when serving demo data in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('returns isDemoFallback: false when serving live API data', async () => {
    const liveQuotas = [{ name: 'live-quota', namespace: 'prod', cluster: 'c1', hard: { pods: '100' }, used: { pods: '20' }, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: liveQuotas }), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.resourceQuotas).toEqual(liveQuotas)
  })

  it('returns isDemoFallback: false when live API fails (empty, not demo)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.resourceQuotas).toEqual([])
  })

  it('returns isDemoFallback: false when forceLive bypasses demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const liveQuotas = [{ name: 'live-quota', namespace: 'prod', cluster: 'c1', hard: { pods: '100' }, used: { pods: '20' }, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: liveQuotas }), { status: 200 })))

    const { result } = renderHook(() => useResourceQuotas(undefined, undefined, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive=true skips demo data, so isDemoFallback must be false
    // even though global demo mode is on.
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.resourceQuotas).toEqual(liveQuotas)
  })

  it('transitions isDemoFallback from true to false when demo mode is disabled', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useResourceQuotas())

    await waitFor(() => expect(result.current.isDemoFallback).toBe(true))

    mockIsDemoMode.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ resourceQuotas: [] }), { status: 200 })))
    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect(result.current.isDemoFallback).toBe(false))
  })
})

describe('deleteResourceQuota', () => {
  it('calls DELETE with correct params', async () => {
    await deleteResourceQuota('cluster-x', 'namespace-y', 'quota-z')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${LOCAL_AGENT_HTTP_URL}/resourcequotas?cluster=cluster-x&namespace=namespace-y&name=quota-z`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('propagates API error on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('403 Forbidden'))
    await expect(deleteResourceQuota('c', 'ns', 'q')).rejects.toThrow('403 Forbidden')
  })
})
