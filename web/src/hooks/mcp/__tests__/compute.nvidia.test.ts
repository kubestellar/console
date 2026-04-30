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
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
      nodeCount?: number
      cpuCores?: number
      memoryGB?: number
    }>
  },
}))

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
  },
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  GPU_POLL_INTERVAL_MS: 30_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  LOCAL_AGENT_URL: 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  MCP_EXTENDED_TIMEOUT_MS: 10_000,
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
  useNVIDIAOperators,
  gpuNodeCache,
  gpuNodeSubscribers,
  updateGPUNodeCache,
} from '../compute'

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
  mockFetchSSE.mockResolvedValue([])
  // Reset GPU subscribers and force-clear cached nodes to prevent cross-test contamination.
  // Direct assignment bypasses updateGPUNodeCache's cache protection (which blocks clearing
  // nodes when data exists). Each test must start with a clean slate.
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
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useNodes
// ===========================================================================


describe('useNVIDIAOperators', () => {
  it('returns empty array with loading state on mount', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useNVIDIAOperators())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.operators).toEqual([])
  })

  it('returns operators after SSE fetch resolves', async () => {
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    mockFetchSSE.mockResolvedValue(fakeOps)

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual(fakeOps)
    expect(result.current.error).toBeNull()
  })

  it('falls back to REST when SSE fails', async () => {
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ operators: fakeOps }), { status: 200 }))
    )

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual(fakeOps)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster when provided via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useNVIDIAOperators('my-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
  })

  it('refetch() triggers a new fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error: null when both SSE and REST fail', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles REST response with singular "operator" key', async () => {
    const singleOp = { cluster: 'c1', installed: true, version: '24.1.0', components: [] }
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ operator: singleOp }), { status: 200 }))
    )

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([singleOp])
  })

  it('handles REST response with neither operators nor operator key', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    )

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('skips SSE when token is "demo-token"', async () => {
    localStorage.setItem('token', 'demo-token')
    const fakeOps = [{ cluster: 'c1', installed: true, version: '23.9.0', components: [] }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ operators: fakeOps }), { status: 200 }))
    )

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // SSE should NOT have been called because token is 'demo-token'
    // Instead it should have fallen through to REST
    expect(result.current.operators).toEqual(fakeOps)
  })
})

describe('useNVIDIAOperators — additional branches', () => {
  it('accumulates operators progressively via SSE onClusterData', async () => {
    const op1 = { cluster: 'c1', installed: true, version: '23.9', components: [] }
    const op2 = { cluster: 'c2', installed: true, version: '24.0', components: [] }

    // fetchSSE calls onClusterData callback during streaming
    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [op1])
      opts.onClusterData('c2', [op2])
      return [op1, op2]
    })

    const { result } = renderHook(() => useNVIDIAOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toHaveLength(2)
  })

  it('passes cluster via REST URL params', async () => {
    localStorage.setItem('token', 'demo-token') // forces SSE skip
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ operators: [] }), { status: 200 }))
    )

    renderHook(() => useNVIDIAOperators('specific-cluster'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=specific-cluster')
  })
})
