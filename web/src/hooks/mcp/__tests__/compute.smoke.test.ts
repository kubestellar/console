import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const {
  mockAgentFetch,
  mockFetchSSE,
  mockIsAgentUnavailable,
  mockIsDemoMode,
  mockRegisterCacheReset,
  mockRegisterRefetch,
  mockReportAgentDataSuccess,
} = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockIsDemoMode: vi.fn(() => false),
  mockRegisterCacheReset: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockReportAgentDataSuccess: vi.fn(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../shared', () => ({
  GPU_POLL_INTERVAL_MS: 30_000,
  getEffectiveInterval: (ms: number) => ms,
  getLocalAgentURL: () => 'http://127.0.0.1:8585',
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../../useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: () => '/api/mcp',
  isClusterModeBackend: () => false,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: () => vi.fn(),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

import { gpuNodeCache, gpuNodeSubscribers, updateGPUNodeCache, useGPUNodes } from '../compute'

describe('compute smoke coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-token')
    gpuNodeSubscribers.clear()
    gpuNodeCache.nodes = []
    updateGPUNodeCache({
      lastUpdated: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
    mockFetchSSE.mockResolvedValue([])
    mockIsAgentUnavailable.mockReturnValue(false)
    mockIsDemoMode.mockReturnValue(false)
    mockRegisterRefetch.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates GPU nodes from the local agent and clamps over-allocated counts', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          {
            name: 'gpu-node-1',
            cluster: 'cluster-a',
            gpuType: 'NVIDIA A100',
            gpuCount: 4,
            gpuAllocated: 9,
            acceleratorType: 'GPU',
          },
        ],
      }),
    })

    const { result } = renderHook(() => useGPUNodes('cluster-a'))

    await waitFor(() => expect(result.current.nodes).toHaveLength(1))
    expect(result.current.nodes).toEqual([
      expect.objectContaining({
        name: 'gpu-node-1',
        cluster: 'cluster-a',
        gpuCount: 4,
        gpuAllocated: 4,
      }),
    ])
    expect(mockReportAgentDataSuccess).toHaveBeenCalledTimes(1)
  })

  it('falls back to demo GPU data when live fetches fail in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockAgentFetch.mockRejectedValue(new Error('agent offline'))
    mockFetchSSE.mockRejectedValue(new Error('sse offline'))

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
    expect(result.current.nodes.length).toBeGreaterThan(0)
    expect(result.current.nodes.some(node => node.name === 'gpu-node-1')).toBe(true)
  })
})
