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
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pvs: [{ metadata: { name: 'pv-1' }, cluster: 'cluster-a' }] }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pvs: [{ metadata: { name: 'pv-2' }, cluster: 'cluster-b' }] }),
    })

    const { result } = renderHook(() => usePVs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.pvs).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  it('handles demo mode correctly', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => usePVs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.pvs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles agent unavailable correctly', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)

    const { result } = renderHook(() => usePVs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Agent unavailable')
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('handles specific cluster parameter', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pvs: [{ metadata: { name: 'pv-specific' } }] }),
    })

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.pvs).toHaveLength(1)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('/pvs?cluster=cluster-a'),
      expect.any(Object)
    )
  })

  it('fetches via backend when isClusterModeBackend is true', async () => {
    mockIsClusterModeBackend = true
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pvs: [{ metadata: { name: 'pv-backend' } }] }),
    })
    vi.stubGlobal('fetch', globalFetchMock)

    const { result } = renderHook(() => usePVs('cluster-a'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.pvs).toHaveLength(1)
    expect(globalFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/pvs?cluster=cluster-a'),
      expect.any(Object)
    )

    vi.unstubAllGlobals()
  })
})

describe('ResourceQuota CRUD hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsClusterModeBackend = false
  })

  it('createOrUpdateResourceQuota calls agent endpoint successfully', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resourceQuota: { metadata: { name: 'quota-1' } } }),
    })

    const spec = { metadata: { name: 'quota-1' } } as any
    const res = await createOrUpdateResourceQuota(spec)

    expect(res).toEqual({ metadata: { name: 'quota-1' } })
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resourcequotas'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('createOrUpdateResourceQuota throws on error response from agent', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    })

    const spec = { metadata: { name: 'quota-1' } } as any
    await expect(createOrUpdateResourceQuota(spec)).rejects.toThrow('HTTP 400')
  })

  it('createOrUpdateResourceQuota calls backend endpoint when cluster mode backend is active', async () => {
    mockIsClusterModeBackend = true
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resourceQuota: { metadata: { name: 'quota-backend' } } }),
    })
    vi.stubGlobal('fetch', globalFetchMock)

    const spec = { metadata: { name: 'quota-backend' } } as any
    const res = await createOrUpdateResourceQuota(spec)

    expect(res).toEqual({ metadata: { name: 'quota-backend' } })
    expect(globalFetchMock).toHaveBeenCalledWith(
      '/api/mcp/resourcequotas',
      expect.objectContaining({ method: 'POST' })
    )

    vi.unstubAllGlobals()
  })

  it('createOrUpdateResourceQuota throws on error response from backend', async () => {
    mockIsClusterModeBackend = true
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
    vi.stubGlobal('fetch', globalFetchMock)

    const spec = { metadata: { name: 'quota-backend' } } as any
    await expect(createOrUpdateResourceQuota(spec)).rejects.toThrow('HTTP 500')

    vi.unstubAllGlobals()
  })

  it('deleteResourceQuota calls agent endpoint successfully', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
    })

    await deleteResourceQuota('cluster-a', 'default', 'quota-1')
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resourcequotas/default/quota-1?cluster=cluster-a'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('deleteResourceQuota throws on error response from agent', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    await expect(deleteResourceQuota('cluster-a', 'default', 'quota-1')).rejects.toThrow('HTTP 404')
  })

  it('deleteResourceQuota calls backend endpoint when cluster mode backend is active', async () => {
    mockIsClusterModeBackend = true
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
    })
    vi.stubGlobal('fetch', globalFetchMock)

    await deleteResourceQuota('cluster-a', 'default', 'quota-1')
    expect(globalFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/resourcequotas/default/quota-1?cluster=cluster-a'),
      expect.objectContaining({ method: 'DELETE' })
    )

    vi.unstubAllGlobals()
  })

  it('deleteResourceQuota throws on error response from backend', async () => {
    mockIsClusterModeBackend = true
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    })
    vi.stubGlobal('fetch', globalFetchMock)

    await expect(deleteResourceQuota('cluster-a', 'default', 'quota-1')).rejects.toThrow('HTTP 502')

    vi.unstubAllGlobals()
  })
})
