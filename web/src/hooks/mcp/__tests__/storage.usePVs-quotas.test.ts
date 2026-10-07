import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const {
  mockAgentFetch,
  mockIsAgentUnavailable,
  mockIsDemoMode,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockIsDemoMode: vi.fn(() => false),
  mockClusterCacheRef: {
    clusters: [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ],
  },
}))

vi.mock('../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    isDemoMode: () => mockIsDemoMode(),
  }
})

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: () => vi.fn(),
}))

vi.mock('../dedup', () => ({
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../../../lib/utils/concurrency', () => ({
  settledWithConcurrency: async (tasks: (() => Promise<unknown>)[]) => {
    const results = await Promise.allSettled(tasks.map(task => task()))
    return results
  },
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  }
})

vi.mock('../../../lib/cache', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    CONSECUTIVE_FAILURE_THRESHOLD: 3,
  }
})

let mockIsClusterModeBackend = false
vi.mock('../../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: () => mockIsClusterModeBackend,
}))

vi.mock('../useClusterResourceQuery', () => ({
  useClusterResourceQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isDemoFallback: false,
    consecutiveFailures: 0,
  }),
}))

import { usePVs, createOrUpdateResourceQuota, deleteResourceQuota } from '../storage'

describe('usePVs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsDemoMode.mockReturnValue(false)
    mockIsClusterModeBackend = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transitions from loading to success when PVs are fetched successfully', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pvs: [{ name: 'pv-1', capacity: '10Gi', status: 'Bound' }] }),
    })

    const { result } = renderHook(() => usePVs('cluster-a'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.pvs).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toHaveLength(1)
    expect(result.current.pvs[0]).toMatchObject({ name: 'pv-1', cluster: 'cluster-a' })
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('returns demo (empty) data when demo mode is enabled', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  it('reports an error and increments consecutiveFailures when the agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Agent unavailable')
    expect(result.current.consecutiveFailures).toBe(1)
    expect(result.current.pvs).toEqual([])
  })

  it('returns empty PVs without error when there are no reachable clusters', async () => {
    mockClusterCacheRef.clusters = []

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()

    // restore for subsequent tests
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: true },
    ]
  })

  it('aggregates PVs from multiple clusters when no cluster is specified', async () => {
    mockAgentFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pvs: [{ name: 'pv-a', status: 'Bound' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pvs: [{ name: 'pv-b', status: 'Bound' }] }) })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => expect(result.current.pvs.length).toBeGreaterThanOrEqual(2))
    const clusterNames = result.current.pvs.map(p => p.cluster)
    expect(clusterNames).toContain('cluster-a')
    expect(clusterNames).toContain('cluster-b')
  })

  it('sets an error and increments consecutiveFailures when every cluster fetch fails', async () => {
    mockAgentFetch.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch PVs from any cluster')
    expect(result.current.consecutiveFailures).toBe(1)
    expect(result.current.pvs).toEqual([])
  })

  it('marks isFailed true once consecutiveFailures reaches the threshold', async () => {
    mockAgentFetch.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => usePVs('cluster-a'))
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(2))

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(3))
    expect(result.current.isFailed).toBe(true)
  })

  it('uses the backend endpoint when isClusterModeBackend is true', async () => {
    mockIsClusterModeBackend = true
    mockAgentFetch.mockClear()
    const backendFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvs: [{ name: 'pv-backend', status: 'Bound' }] }),
    })
    vi.stubGlobal('fetch', backendFetch)

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => expect(result.current.pvs).toHaveLength(1))
    expect(result.current.pvs[0].name).toBe('pv-backend')
    expect(backendFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/pvs'),
      expect.any(Object),
    )
    expect(mockAgentFetch).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

describe('createOrUpdateResourceQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsClusterModeBackend = false
  })

  it('posts to the agent endpoint and returns the resourceQuota', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ resourceQuota: { name: 'rq-1' } }),
    })

    const result = await createOrUpdateResourceQuota({
      cluster: 'cluster-a',
      namespace: 'default',
      name: 'rq-1',
      hard: {},
    } as never)

    expect(result).toEqual({ name: 'rq-1' })
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resourcequotas'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('posts to the backend endpoint when isClusterModeBackend is true', async () => {
    mockIsClusterModeBackend = true
    const backendFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resourceQuota: { name: 'rq-2' } }),
    })
    vi.stubGlobal('fetch', backendFetch)

    const result = await createOrUpdateResourceQuota({
      cluster: 'cluster-a',
      namespace: 'default',
      name: 'rq-2',
      hard: {},
    } as never)

    expect(result).toEqual({ name: 'rq-2' })
    expect(backendFetch).toHaveBeenCalledWith(
      '/api/mcp/resourcequotas',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockAgentFetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('throws when the agent responds with a non-ok status', async () => {
    mockAgentFetch.mockResolvedValue({ ok: false, status: 500 })

    await expect(
      createOrUpdateResourceQuota({ cluster: 'cluster-a', namespace: 'default', name: 'rq-1', hard: {} } as never),
    ).rejects.toThrow('HTTP 500')
  })
})

describe('deleteResourceQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsClusterModeBackend = false
  })

  it('sends a DELETE request with the expected query params', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true })

    await deleteResourceQuota('cluster-a', 'default', 'rq-1')

    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/resourcequotas\?.*cluster=cluster-a.*/),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('uses the backend endpoint when isClusterModeBackend is true', async () => {
    mockIsClusterModeBackend = true
    const backendFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', backendFetch)

    await deleteResourceQuota('cluster-a', 'default', 'rq-1')

    expect(backendFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/resourcequotas?'),
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(mockAgentFetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('throws when the delete request fails', async () => {
    mockAgentFetch.mockResolvedValue({ ok: false, status: 404 })

    await expect(deleteResourceQuota('cluster-a', 'default', 'rq-1')).rejects.toThrow('HTTP 404')
  })
})
