import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

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
  getDemoMode: vi.fn(() => false),
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

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { gpuNodeCache, gpuNodeSubscribers, updateGPUNodeCache, useGPUNodes, useNodes } from '../compute'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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

// ===========================================================================
// useGPUNodes — demo mode branch
// ===========================================================================

describe('useGPUNodes', () => {
  it('returns demo GPU nodes filtered by cluster in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useGPUNodes('prod-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.every(n => n.cluster === 'prod-cluster')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns all demo GPU nodes when no cluster filter in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useGPUNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
  })

  it('returns empty nodes and error when agent fetch fails and demo mode is off', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockAgentFetch.mockRejectedValue(new Error('agent offline'))
    mockFetchSSE.mockRejectedValue(new Error('sse offline'))

    const { result } = renderHook(() => useGPUNodes('some-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toHaveLength(0)
  })
})

// ===========================================================================
// useNodes — demo mode and REST-error path
// ===========================================================================

describe('useNodes', () => {
  it('returns demo nodes filtered by cluster in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNodes('prod-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes.every(n => n.cluster === 'prod-cluster')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns all demo nodes when no cluster filter in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNodes())

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
  })

  it('handles SSE fetch failure gracefully and sets error state', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockFetchSSE.mockRejectedValue(new Error('stream error'))

    const { result } = renderHook(() => useNodes())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.nodes).toHaveLength(0)
  })

  it('maps agent response nodes to NodeInfo format', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          {
            name: 'node-1',
            status: 'Ready',
            roles: ['worker'],
            kubeletVersion: 'v1.29.0',
            cpuCapacity: '8',
            memoryCapacity: '16Gi',
            podCapacity: '110',
            conditions: [],
            unschedulable: false,
          },
        ],
      }),
    })
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useNodes('cluster-a'))

    await waitFor(() => expect(result.current.nodes.length).toBeGreaterThan(0))
    expect(result.current.nodes[0]).toMatchObject({
      name: 'node-1',
      cluster: 'cluster-a',
      status: 'Ready',
    })
    expect(result.current.error).toBeNull()
  })
})
