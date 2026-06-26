/**
 * Tests for kagent_crds.ts
 *
 * Covers the hooks for fetching Kagent CRD resources (agents, tools, models, memories).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockUseCache,
  mockClusterCacheRef,
  mockDeduplicateClustersByServer,
} = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => false),
  mockReportAgentDataSuccess: vi.fn(),
  mockUseCache: vi.fn(),
  mockClusterCacheRef: { clusters: [] },
  mockDeduplicateClustersByServer: vi.fn((clusters) => clusters),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: vi.fn(),
}))

vi.mock('../dedup', () => ({
  deduplicateClustersByServer: (clusters: unknown[]) => mockDeduplicateClustersByServer(clusters),
}))

vi.mock('../../../lib/constants/network', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  useKagentCRDAgents,
  useKagentCRDTools,
  useKagentCRDModels,
  useKagentCRDMemories,
  type KagentCRDAgent,
  type KagentCRDToolServer,
  type KagentCRDModelConfig,
  type KagentCRDMemory,
} from '../kagent_crds'

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(false)
  mockClusterCacheRef.clusters = []
  mockDeduplicateClustersByServer.mockImplementation((clusters) => clusters)
  
  // Default mock implementation for useCache
  mockUseCache.mockReturnValue({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })
})

// ---------------------------------------------------------------------------
// useKagentCRDAgents
// ---------------------------------------------------------------------------

describe('useKagentCRDAgents', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentCRDAgents())
    
    expect(mockUseCache).toHaveBeenCalled()
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-agents:all:all')
  })

  it('calls useCache with cluster-specific key', () => {
    renderHook(() => useKagentCRDAgents({ cluster: 'prod-east' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-agents:prod-east:all')
  })

  it('calls useCache with namespace-specific key', () => {
    renderHook(() => useKagentCRDAgents({ namespace: 'kagent-system' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-agents:all:kagent-system')
  })

  it('calls useCache with cluster and namespace key', () => {
    renderHook(() => useKagentCRDAgents({ cluster: 'staging', namespace: 'kagent-ops' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-agents:staging:kagent-ops')
  })

  it('sets category to clusters', () => {
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.category).toBe('clusters')
  })

  it('provides empty array as initial data', () => {
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.initialData)).toBe(true)
    expect(call.initialData).toHaveLength(0)
  })

  it('provides demo data', () => {
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
  })

  it('enables demo fallback when empty', () => {
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.demoWhenEmpty).toBe(true)
  })

  it('is disabled when agent is unavailable', () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.enabled).toBe(false)
  })

  it('is enabled when agent is available', () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    renderHook(() => useKagentCRDAgents())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.enabled).toBe(true)
  })

  it('returns data from useCache', () => {
    const mockAgents: KagentCRDAgent[] = [
      { name: 'test-agent', namespace: 'default', cluster: 'prod', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'gpt-4o', toolCount: 2, a2aEnabled: true, systemMessage: 'Test', createdAt: '2025-01-01T00:00:00Z', age: '1d' },
    ]
    mockUseCache.mockReturnValue({
      data: mockAgents,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useKagentCRDAgents())
    expect(result.current.data).toEqual(mockAgents)
  })
})

// ---------------------------------------------------------------------------
// useKagentCRDTools
// ---------------------------------------------------------------------------

describe('useKagentCRDTools', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentCRDTools())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-tools:all:all')
  })

  it('calls useCache with cluster-specific key', () => {
    renderHook(() => useKagentCRDTools({ cluster: 'prod-west' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-tools:prod-west:all')
  })

  it('provides demo data with tools', () => {
    renderHook(() => useKagentCRDTools())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one tool has required fields
    const tool = call.demoData[0]
    expect(typeof tool.name).toBe('string')
    expect(typeof tool.namespace).toBe('string')
    expect(typeof tool.cluster).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockTools: KagentCRDToolServer[] = [
      { name: 'kubectl-server', namespace: 'default', cluster: 'prod', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [], status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: mockTools,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useKagentCRDTools())
    expect(result.current.data).toEqual(mockTools)
  })
})

// ---------------------------------------------------------------------------
// useKagentCRDModels
// ---------------------------------------------------------------------------

describe('useKagentCRDModels', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentCRDModels())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-models:all:all')
  })

  it('calls useCache with namespace-specific key', () => {
    renderHook(() => useKagentCRDModels({ namespace: 'kagent-system' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-models:all:kagent-system')
  })

  it('provides demo data with models', () => {
    renderHook(() => useKagentCRDModels())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one model has required fields
    const model = call.demoData[0]
    expect(typeof model.name).toBe('string')
    expect(typeof model.provider).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockModels: KagentCRDModelConfig[] = [
      { name: 'claude-sonnet', namespace: 'default', cluster: 'prod', kind: 'ModelConfig', provider: 'Anthropic', model: 'claude-sonnet-4', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: mockModels,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useKagentCRDModels())
    expect(result.current.data).toEqual(mockModels)
  })
})

// ---------------------------------------------------------------------------
// useKagentCRDMemories
// ---------------------------------------------------------------------------

describe('useKagentCRDMemories', () => {
  it('calls useCache with correct key for all clusters', () => {
    renderHook(() => useKagentCRDMemories())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-memories:all:all')
  })

  it('calls useCache with cluster and namespace key', () => {
    renderHook(() => useKagentCRDMemories({ cluster: 'prod-east', namespace: 'kagent-system' }))
    
    const call = mockUseCache.mock.calls[0][0]
    expect(call.key).toBe('kagent-crd-memories:prod-east:kagent-system')
  })

  it('provides demo data with memories', () => {
    renderHook(() => useKagentCRDMemories())
    
    const call = mockUseCache.mock.calls[0][0]
    expect(Array.isArray(call.demoData)).toBe(true)
    expect(call.demoData.length).toBeGreaterThan(0)
    // Verify at least one memory has required fields
    const memory = call.demoData[0]
    expect(typeof memory.name).toBe('string')
    expect(typeof memory.provider).toBe('string')
  })

  it('returns data from useCache', () => {
    const mockMemories: KagentCRDMemory[] = [
      { name: 'test-memory', namespace: 'default', cluster: 'prod', provider: 'pinecone', status: 'Ready' },
    ]
    mockUseCache.mockReturnValue({
      data: mockMemories,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useKagentCRDMemories())
    expect(result.current.data).toEqual(mockMemories)
  })

  it('sets category to clusters for all hooks', () => {
    renderHook(() => useKagentCRDAgents())
    renderHook(() => useKagentCRDTools())
    renderHook(() => useKagentCRDModels())
    renderHook(() => useKagentCRDMemories())
    
    for (let i = 0; i < 4; i++) {
      const call = mockUseCache.mock.calls[i][0]
      expect(call.category).toBe('clusters')
    }
  })
})
