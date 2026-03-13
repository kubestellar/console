import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockKubectlProxy,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockKubectlProxy: {
    getNamespaces: vi.fn(),
  },
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
      namespaces?: string[]
    }>,
  },
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
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

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  LOCAL_AGENT_URL: 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useNamespaces, useNamespaceStats } from '../namespaces'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockIsDemoMode.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useNamespaces
// ===========================================================================

describe('useNamespaces', () => {
  it('returns empty namespaces when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaces())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toEqual([])
  })

  it('returns demo namespaces when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces.length).toBeGreaterThan(0)
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.error).toBeNull()
  })

  it('fetches namespaces from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ name: 'default' }, { name: 'kube-system' }, { name: 'monitoring' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.namespaces).toContain('monitoring')
  })

  it('falls back to REST API when agent fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('monitoring')
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('falls back to default namespaces when all methods fail', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaces('unreachable-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Falls back to ['default', 'kube-system'] as minimal fallback
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
  })

  it('skips demo mode when forceLive is true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockApiGet.mockResolvedValue({ data: { pods: [{ name: 'p', namespace: 'live-ns', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] } })

    const { result } = renderHook(() => useNamespaces('my-cluster', true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive bypasses demo mode; should use real API
    expect(result.current.namespaces).toContain('live-ns')
  })
})

// ===========================================================================
// useNamespaceStats
// ===========================================================================

describe('useNamespaceStats', () => {
  it('returns empty stats when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaceStats())

    expect(result.current.stats).toEqual([])
  })

  it('returns namespace stats from API after fetch resolves', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'production', status: 'Pending', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'pod-4', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '7d' },
      { name: 'pod-5', namespace: 'monitoring', status: 'Failed', ready: '0/1', restarts: 5, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBe(2)

    const prodStats = result.current.stats.find(s => s.name === 'production')
    expect(prodStats).toBeDefined()
    expect(prodStats!.podCount).toBe(3)
    expect(prodStats!.runningPods).toBe(2)
    expect(prodStats!.pendingPods).toBe(1)

    const monStats = result.current.stats.find(s => s.name === 'monitoring')
    expect(monStats).toBeDefined()
    expect(monStats!.podCount).toBe(2)
    expect(monStats!.failedPods).toBe(1)
  })

  it('sorts stats by pod count descending', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'small', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-4', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    mockApiGet.mockResolvedValue({ data: { pods: fakePods } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats[0].name).toBe('large')
    expect(result.current.stats[1].name).toBe('small')
  })

  it('falls back to demo stats on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockApiGet.mockResolvedValue({ data: { pods: [] } })

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})
