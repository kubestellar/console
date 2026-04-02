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
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../shared', () => ({
  LOCAL_AGENT_URL: 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/cache', () => ({
  useCache: (opts: { key: string; initialData: unknown; demoData: unknown }) => mockUseCache(opts),
  resetFailuresForCluster: vi.fn(),
}))

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

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(true)
  mockClusterCacheRef.clusters = []
})

afterEach(() => {
  vi.useRealTimers()
})

// ===========================================================================
// useKagentCRDAgents
// ===========================================================================

describe('useKagentCRDAgents', () => {
  it('passes correct key and initial data to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:all:all',
        category: 'clusters',
        initialData: [],
        demoWhenEmpty: true,
      })
    )
  })

  it('returns data from useCache', () => {
    const fakeAgents = [
      { name: 'k8s-assistant', namespace: 'kagent-system', cluster: 'prod-east', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 2, readyReplicas: 2, modelConfigRef: 'claude-sonnet', toolCount: 4, a2aEnabled: true, systemMessage: 'test', createdAt: '2025-01-15T10:00:00Z', age: '68d' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeAgents,
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDAgents())

    expect(result.current.data).toEqual(fakeAgents)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace options into cache key', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-agents:staging:kagent-ops',
      })
    )
  })

  it('sets enabled to false when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    )
  })

  it('sets enabled to true when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it('provides demo agents with expected structure', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData).toBeDefined()
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const firstAgent = callArg.demoData[0]
    expect(firstAgent).toHaveProperty('name')
    expect(firstAgent).toHaveProperty('agentType')
    expect(firstAgent).toHaveProperty('runtime')
    expect(firstAgent).toHaveProperty('modelConfigRef')
    expect(firstAgent).toHaveProperty('toolCount')
    expect(firstAgent).toHaveProperty('a2aEnabled')
    expect(firstAgent).toHaveProperty('systemMessage')
  })

  it('uses only namespace when no cluster provided', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDAgents({ namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'kagent-crd-agents:all:kagent-ops' })
    )
  })
})

// ===========================================================================
// useKagentCRDTools
// ===========================================================================

describe('useKagentCRDTools', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:all:all',
        category: 'clusters',
        initialData: [],
      })
    )
  })

  it('returns tool data from useCache', () => {
    const fakeTools = [
      { name: 'kubectl-server', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'get_pods', description: 'List pods' }], status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeTools,
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDTools())

    expect(result.current.data).toEqual(fakeTools)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace options', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools({ cluster: 'prod-west', namespace: 'kagent-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-tools:prod-west:kagent-system',
      })
    )
  })

  it('provides demo tools with discoveredTools arrays', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDTools())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const firstTool = callArg.demoData[0]
    expect(firstTool).toHaveProperty('kind')
    expect(firstTool).toHaveProperty('protocol')
    expect(Array.isArray(firstTool.discoveredTools)).toBe(true)
    expect(firstTool.discoveredTools[0]).toHaveProperty('name')
    expect(firstTool.discoveredTools[0]).toHaveProperty('description')
  })
})

// ===========================================================================
// useKagentCRDModels
// ===========================================================================

describe('useKagentCRDModels', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:all:all',
        category: 'clusters',
        initialData: [],
      })
    )
  })

  it('returns model data from useCache', () => {
    const fakeModels = [
      { name: 'claude-sonnet', namespace: 'kagent-system', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Anthropic', model: 'claude-sonnet-4-20250514', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeModels,
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDModels())

    expect(result.current.data).toEqual(fakeModels)
  })

  it('passes cluster and namespace options', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels({ cluster: 'staging', namespace: 'kagent-ops' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-models:staging:kagent-ops',
      })
    )
  })

  it('provides demo models with multiple providers', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const providers = callArg.demoData.map((m: { provider: string }) => m.provider)
    expect(providers).toContain('Anthropic')
    expect(providers).toContain('OpenAI')
  })

  it('demo models include ModelProviderConfig kind', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    const callArg = mockUseCache.mock.calls[0][0]
    const kinds = callArg.demoData.map((m: { kind: string }) => m.kind)
    expect(kinds).toContain('ModelConfig')
    expect(kinds).toContain('ModelProviderConfig')
  })

  it('demo models include discoveredModels arrays', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDModels())

    const callArg = mockUseCache.mock.calls[0][0]
    // Find a model with discoveredModels
    const modelWithDiscovered = callArg.demoData.find(
      (m: { discoveredModels: string[] }) => m.discoveredModels.length > 0
    )
    expect(modelWithDiscovered).toBeDefined()
    expect(modelWithDiscovered.modelCount).toBeGreaterThan(0)
  })
})

// ===========================================================================
// useKagentCRDMemories
// ===========================================================================

describe('useKagentCRDMemories', () => {
  it('passes correct key to useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:all:all',
        category: 'clusters',
        initialData: [],
      })
    )
  })

  it('returns memory data from useCache', () => {
    const fakeMemories = [
      { name: 'incident-memory', namespace: 'kagent-system', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: fakeMemories,
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDMemories())

    expect(result.current.data).toEqual(fakeMemories)
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace options', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: true, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories({ cluster: 'prod-east', namespace: 'kagent-system' }))

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'kagent-crd-memories:prod-east:kagent-system',
      })
    )
  })

  it('provides demo memories with provider field', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.demoData.length).toBeGreaterThan(0)
    const firstMemory = callArg.demoData[0]
    expect(firstMemory).toHaveProperty('provider')
    expect(firstMemory).toHaveProperty('status')
    expect(firstMemory).toHaveProperty('cluster')
  })

  it('sets enabled based on agent availability', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: null,
    })

    renderHook(() => useKagentCRDMemories())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it('returns isRefreshing state from useCache', () => {
    mockUseCache.mockReturnValue({
      data: [{ name: 'm1', namespace: 'ns', cluster: 'c1', provider: 'pinecone', status: 'Ready' }],
      isLoading: false, isRefreshing: true, error: null, refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 0, isFailed: false, lastRefresh: new Date(),
    })

    const { result } = renderHook(() => useKagentCRDMemories())

    expect(result.current.isRefreshing).toBe(true)
  })

  it('returns error from useCache', () => {
    mockUseCache.mockReturnValue({
      data: [],
      isLoading: false, isRefreshing: false,
      error: new Error('memory fetch failed'),
      refetch: vi.fn(),
      isDemoData: false, consecutiveFailures: 2, isFailed: false, lastRefresh: null,
    })

    const { result } = renderHook(() => useKagentCRDMemories())

    expect(result.current.error).toEqual(new Error('memory fetch failed'))
    expect(result.current.consecutiveFailures).toBe(2)
  })
})
