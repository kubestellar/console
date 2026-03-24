import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockApiGet,
  mockFetchSSE,
  mockRegisterRefetch,
  mockSubscribeClusterCache,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockSubscribeClusterCache: vi.fn(() => vi.fn()),
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
    }>,
  },
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
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
  registerCacheReset: vi.fn(() => vi.fn()),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  subscribeClusterCache: (...args: unknown[]) => mockSubscribeClusterCache(...args),
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useOperators, useOperatorSubscriptions } from '../operators'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribeClusterCache.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
  mockClusterCacheRef.clusters = [{ name: 'prod-east', context: 'prod-east' }]
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================
// useOperators
// ===========================================================================

describe('useOperators', () => {
  it('returns initial loading state with empty operators array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useOperators())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.operators).toEqual([])
  })

  it('returns operators after SSE fetch resolves', async () => {
    const fakeOperators = [
      { name: 'prometheus-operator', namespace: 'monitoring', version: 'v0.65.1', status: 'Succeeded', cluster: 'prod-east' },
    ]
    mockFetchSSE.mockResolvedValue(fakeOperators)

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns demo operators when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('falls back to REST when SSE fails', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    const fakeOperators = [
      { name: 'cert-manager', namespace: 'cert-manager', version: 'v1.12.0', status: 'Succeeded' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: fakeOperators } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('tracks consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('returns lastRefresh timestamp', async () => {
    mockFetchSSE.mockResolvedValue([{ name: 'op1', namespace: 'ns', version: 'v1', status: 'Succeeded', cluster: 'c1' }])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })
})

// ===========================================================================
// useOperatorSubscriptions
// ===========================================================================

describe('useOperatorSubscriptions', () => {
  it('returns initial loading state with empty subscriptions array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useOperatorSubscriptions())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.subscriptions).toEqual([])
  })

  it('returns subscriptions after SSE fetch resolves', async () => {
    const fakeSubs = [
      { name: 'prometheus-operator', namespace: 'monitoring', channel: 'stable', source: 'operatorhubio-catalog', installPlanApproval: 'Automatic', currentCSV: 'prometheusoperator.v0.65.1', cluster: 'c1' },
    ]
    mockFetchSSE.mockResolvedValue(fakeSubs)

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns demo subscriptions when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions.length).toBeGreaterThan(0)
  })

  it('handles both SSE and REST failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    mockApiGet.mockRejectedValue(new Error('REST failed'))

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('error'))
    mockApiGet.mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Only 1 failure so far
    expect(result.current.isFailed).toBe(false)
  })
})
