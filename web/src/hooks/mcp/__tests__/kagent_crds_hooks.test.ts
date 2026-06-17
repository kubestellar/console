import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockClusterCacheRef,
  mockUseCache,
  mockMapSettled,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockClusterCacheRef: {
    clusters: [] as Array<{
      name: string
      context?: string
      reachable?: boolean
    }>,
  },
  mockUseCache: vi.fn(),
  mockMapSettled: vi.fn(),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../shared', () => ({
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

// Mock useCache to return controllable values
vi.mock('../../../lib/cache', () => ({
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown; fetcher?: () => Promise<unknown>; enabled?: boolean }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
}))

vi.mock('../../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: (...args: unknown[]) => mockMapSettled(...args),
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  MCP_HOOK_TIMEOUT_MS: 10000,
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useKagentCRDAgents,
  useKagentCRDTools,
  useKagentCRDModels,
  useKagentCRDMemories,
} from '../kagent_crds'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// module importability
// ===========================================================================

describe('kagent_crds', () => {
  it('module is importable', async () => {
    const mod = await import('../kagent_crds')
    expect(mod).toBeDefined()
  })
})

// ===========================================================================
// useKagentCRDAgents
// ===========================================================================

describe('useKagentCRDAgents', () => {
  it('passes correct key and category to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:all:all',
        category: 'clusters',
        initialData: [],
        demoWhenEmpty: true,
      }),
    )
  })

  it('returns agents data from useCache', () => {
    const fakeAgents = [
      { name: 'k8s-assistant', namespace: 'kagent-system', cluster: 'prod-east', agentType: 'Declarative' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeAgents, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDAgents())
    expect(result.current.data).toEqual(fakeAgents)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace options correctly', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:staging:kagent-ops',
      }),
    )
  })

  it('sets enabled: false when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('sets enabled: true when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('provides non-empty demoData array', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData).toBeDefined()
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useKagentCRDTools
// ===========================================================================

describe('useKagentCRDTools', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:all:all',
        category: 'clusters',
      }),
    )
  })

  it('returns tool data from useCache', () => {
    const fakeTools = [
      { name: 'kubectl-server', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeTools, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDTools())
    expect(result.current.data).toEqual(fakeTools)
  })

  it('passes cluster filter option', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools({ cluster: 'prod-west' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:prod-west:all',
      }),
    )
  })
})

// ===========================================================================
// useKagentCRDModels
// ===========================================================================

describe('useKagentCRDModels', () => {
  it('passes correct key and initial data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:all:all',
        category: 'clusters',
        initialData: [],
      }),
    )
  })

  it('returns model data from useCache', () => {
    const fakeModels = [
      { name: 'claude-sonnet', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Anthropic' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeModels, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDModels())
    expect(result.current.data).toEqual(fakeModels)
  })

  it('provides non-empty demo models', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('passes namespace filter through to key', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels({ namespace: 'kagent-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:all:kagent-system',
      }),
    )
  })
})

// ===========================================================================
// useKagentCRDMemories
// ===========================================================================

describe('useKagentCRDMemories', () => {
  it('passes correct key and initial data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:all:all',
        category: 'clusters',
        initialData: [],
      }),
    )
  })

  it('returns memory data from useCache', () => {
    const fakeMemories = [
      { name: 'incident-memory', namespace: 'kagent-system', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeMemories, isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDMemories())
    expect(result.current.data).toEqual(fakeMemories)
  })

  it('provides non-empty demo memories', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: false, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('passes cluster and namespace filter through to key', () => {
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:staging:kagent-ops',
      }),
    )
  })

  it('sets enabled based on agent availability', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [], isLoading: true, isRefreshing: false, error: null,
      refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
      consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })
})

// ===========================================================================
// agentFetch — internal helper (tested via fetcher callbacks)
// ===========================================================================
