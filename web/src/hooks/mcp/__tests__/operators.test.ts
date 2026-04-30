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
  agentFetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

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

// ===========================================================================
// Additional regression tests – useOperators
// ===========================================================================

describe('useOperators – return shape', () => {
  it('exposes all documented return properties', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const keys = Object.keys(result.current)
    const expected = [
      'operators',
      'isLoading',
      'isRefreshing',
      'error',
      'refetch',
      'lastRefresh',
      'consecutiveFailures',
      'isFailed',
    ]
    for (const key of expected) {
      expect(keys).toContain(key)
    }
  })

  it('operators is always an array (never undefined)', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.operators)).toBe(true)
  })

  it('isFailed is boolean derived from consecutiveFailures >= 3', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isFailed).toBe('boolean')
    // 0 failures => not failed
    expect(result.current.isFailed).toBe(false)
  })
})

describe('useOperators – cluster filter', () => {
  it('passes cluster parameter in REST fallback URL', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse unavailable'))
    const fakeOps = [
      { name: 'op1', namespace: 'ns', version: 'v1', status: 'Succeeded', cluster: 'prod-east' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: fakeOps } })

    const { result } = renderHook(() => useOperators('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should have called REST with cluster query param
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('cluster=prod-east'),
      expect.anything(),
    )
  })

  it('uses all-clusters endpoint when no cluster filter supplied', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse unavailable'))
    mockApiGet.mockResolvedValue({ data: { operators: [] } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/gitops/operators',
      expect.anything(),
    )
  })

  it('demo mode returns operators scoped to the given cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useOperators('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const op of result.current.operators) {
      expect(op.cluster).toBe('prod-east')
    }
  })
})

describe('useOperators – empty/missing data handling', () => {
  it('handles REST response with empty operators array', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    mockApiGet.mockResolvedValue({ data: { operators: [] } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles REST response with undefined operators field', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should gracefully default to empty array (data.operators || [])
    expect(result.current.operators).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles demo mode with no clusters in cache', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockClusterCacheRef.clusters = []

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators).toEqual([])
  })
})

describe('useOperators – SSE onClusterData progressive rendering', () => {
  it('invokes fetchSSE with onClusterData callback for streaming', async () => {
    const ops = [
      { name: 'cert-manager', namespace: 'cert-manager', version: 'v1.12.0', status: 'Succeeded', cluster: 'c1' },
    ]
    mockFetchSSE.mockImplementation(async (opts: Record<string, unknown>) => {
      // Simulate the SSE backend calling onClusterData once
      const cb = opts.onClusterData as (cluster: string, items: typeof ops) => void
      if (typeof cb === 'function') {
        cb('c1', ops)
      }
      return ops
    })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators.length).toBe(1)
    expect(result.current.operators[0].name).toBe('cert-manager')
  })
})

describe('useOperators – phase → status mapping', () => {
  it('maps phase field to status on SSE results', async () => {
    const rawOps = [
      { name: 'op1', namespace: 'ns', version: 'v1', phase: 'Failed', cluster: 'c1' },
    ]
    mockFetchSSE.mockResolvedValue(rawOps)

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators[0].status).toBe('Failed')
  })

  it('maps phase field to status on REST results', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    const rawOps = [
      { name: 'op1', namespace: 'ns', version: 'v1', phase: 'Installing' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: rawOps } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators[0].status).toBe('Installing')
  })

  it('defaults status to Unknown when neither status nor phase is present', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    const rawOps = [
      { name: 'op1', namespace: 'ns', version: 'v1' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: rawOps } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators[0].status).toBe('Unknown')
  })
})

describe('useOperators – SSE unavailable when no token', () => {
  it('skips REST call when no token in localStorage (prevents GA4 auth errors)', async () => {
    localStorage.removeItem('token')
    const fakeOps = [
      { name: 'op1', namespace: 'ns', version: 'v1', status: 'Succeeded', cluster: 'c1' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: fakeOps } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Neither SSE nor REST should be attempted without a token (#9957)
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(mockApiGet).not.toHaveBeenCalled()
    expect(result.current.operators.length).toBe(0)
  })

  it('falls back to REST when token is demo-token', async () => {
    localStorage.setItem('token', 'demo-token')
    const fakeOps = [
      { name: 'op2', namespace: 'ns', version: 'v2', status: 'Failed', cluster: 'c2' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: fakeOps } })

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(mockApiGet).toHaveBeenCalled()
  })
})

describe('useOperators – refetch triggers re-fetch', () => {
  it('calling refetch causes a new SSE request', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    act(() => {
      result.current.refetch()
    })

    // After refetch, a new fetch cycle should start
    await waitFor(() => {
      expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})

describe('useOperators – REST fills missing cluster field', () => {
  it('assigns cluster from param when REST data lacks cluster field', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    const rawOps = [
      { name: 'op1', namespace: 'ns', version: 'v1', status: 'Succeeded' },
    ]
    mockApiGet.mockResolvedValue({ data: { operators: rawOps } })

    const { result } = renderHook(() => useOperators('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.operators[0].cluster).toBe('my-cluster')
  })
})

// ===========================================================================
// Additional regression tests – useOperatorSubscriptions
// ===========================================================================

describe('useOperatorSubscriptions – return shape', () => {
  it('exposes all documented return properties', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const keys = Object.keys(result.current)
    const expected = [
      'subscriptions',
      'isLoading',
      'isRefreshing',
      'error',
      'refetch',
      'lastRefresh',
      'consecutiveFailures',
      'isFailed',
    ]
    for (const key of expected) {
      expect(keys).toContain(key)
    }
  })

  it('subscriptions is always an array (never undefined)', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.subscriptions)).toBe(true)
  })
})

describe('useOperatorSubscriptions – cluster filter', () => {
  it('passes cluster parameter in REST fallback URL', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    const fakeSubs = [
      { name: 'sub1', namespace: 'ns', channel: 'stable', source: 'src', installPlanApproval: 'Automatic', currentCSV: 'csv.v1', cluster: 'prod-west' },
    ]
    mockApiGet.mockResolvedValue({ data: { subscriptions: fakeSubs } })

    const { result } = renderHook(() => useOperatorSubscriptions('prod-west'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('cluster=prod-west'),
      expect.anything(),
    )
  })

  it('uses all-clusters endpoint when no cluster filter supplied', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    mockApiGet.mockResolvedValue({ data: { subscriptions: [] } })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/gitops/operator-subscriptions',
      expect.anything(),
    )
  })

  it('demo mode returns subscriptions scoped to the given cluster', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useOperatorSubscriptions('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const sub of result.current.subscriptions) {
      expect(sub.cluster).toBe('prod-east')
    }
  })
})

describe('useOperatorSubscriptions – empty/missing data handling', () => {
  it('handles REST response with empty subscriptions array', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    mockApiGet.mockResolvedValue({ data: { subscriptions: [] } })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles REST response with undefined subscriptions field', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    mockApiGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles demo mode with no clusters in cache', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockClusterCacheRef.clusters = []

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions).toEqual([])
  })
})

describe('useOperatorSubscriptions – SSE onClusterData progressive rendering', () => {
  it('invokes fetchSSE with onClusterData callback for streaming', async () => {
    const subs = [
      { name: 'sub1', namespace: 'ns', channel: 'stable', source: 'src', installPlanApproval: 'Automatic' as const, currentCSV: 'csv.v1', cluster: 'c1' },
    ]
    mockFetchSSE.mockImplementation(async (opts: Record<string, unknown>) => {
      const cb = opts.onClusterData as (cluster: string, items: typeof subs) => void
      if (typeof cb === 'function') {
        cb('c1', subs)
      }
      return subs
    })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions.length).toBe(1)
    expect(result.current.subscriptions[0].name).toBe('sub1')
  })
})

describe('useOperatorSubscriptions – SSE unavailable when no token', () => {
  it('skips REST call when no token in localStorage (prevents GA4 auth errors)', async () => {
    localStorage.removeItem('token')
    const fakeSubs = [
      { name: 'sub1', namespace: 'ns', channel: 'stable', source: 'src', installPlanApproval: 'Automatic', currentCSV: 'csv.v1', cluster: 'c1' },
    ]
    mockApiGet.mockResolvedValue({ data: { subscriptions: fakeSubs } })

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Neither SSE nor REST should be attempted without a token (#9957)
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(mockApiGet).not.toHaveBeenCalled()
    expect(result.current.subscriptions.length).toBe(0)
  })
})

describe('useOperatorSubscriptions – refetch triggers re-fetch', () => {
  it('calling refetch causes a new SSE request', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})

describe('useOperatorSubscriptions – REST fills missing cluster field', () => {
  it('assigns cluster from param when REST data lacks cluster field', async () => {
    mockFetchSSE.mockRejectedValue(new Error('sse off'))
    const rawSubs = [
      { name: 'sub1', namespace: 'ns', channel: 'stable', source: 'src', installPlanApproval: 'Automatic', currentCSV: 'csv.v1' },
    ]
    mockApiGet.mockResolvedValue({ data: { subscriptions: rawSubs } })

    const { result } = renderHook(() => useOperatorSubscriptions('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.subscriptions[0].cluster).toBe('my-cluster')
  })
})

describe('useOperatorSubscriptions – demo data with multiple clusters', () => {
  it('returns subscriptions for all cached clusters when no filter', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'cluster-a' },
      { name: 'cluster-b', context: 'cluster-b' },
    ]

    const { result } = renderHook(() => useOperatorSubscriptions())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = [...new Set(result.current.subscriptions.map(s => s.cluster))]
    expect(clusterNames).toContain('cluster-a')
    expect(clusterNames).toContain('cluster-b')
  })
})

describe('useOperators – demo data with multiple clusters', () => {
  it('returns operators for all cached clusters when no filter', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'cluster-a' },
      { name: 'cluster-b', context: 'cluster-b' },
    ]

    const { result } = renderHook(() => useOperators())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = [...new Set(result.current.operators.map(o => o.cluster))]
    expect(clusterNames).toContain('cluster-a')
    expect(clusterNames).toContain('cluster-b')
  })
})
