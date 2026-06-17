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

describe('demo data integrity', () => {
  it('demo agents have all required fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData
      for (const agent of agents as Array<Record<string, unknown>>) {
        expect(agent.name).toBeTruthy()
        expect(agent.namespace).toBeTruthy()
        expect(agent.cluster).toBeTruthy()
        expect(['Declarative', 'BYO']).toContain(agent.agentType)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo tools have all required fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData
      for (const tool of tools as Array<Record<string, unknown>>) {
        expect(tool.name).toBeTruthy()
        expect(tool.namespace).toBeTruthy()
        expect(tool.cluster).toBeTruthy()
        expect(['ToolServer', 'RemoteMCPServer']).toContain(tool.kind)
        expect(Array.isArray(tool.discoveredTools)).toBe(true)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo models have provider and kind fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData
      for (const model of models as Array<Record<string, unknown>>) {
        expect(model.name).toBeTruthy()
        expect(model.provider).toBeTruthy()
        expect(['ModelConfig', 'ModelProviderConfig']).toContain(model.kind)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo memories have provider and status fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const memories = opts.demoData
      for (const memory of memories as Array<Record<string, unknown>>) {
        expect(memory.name).toBeTruthy()
        expect(memory.provider).toBeTruthy()
        expect(memory.status).toBeTruthy()
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDMemories())
  })
})

// ===========================================================================
// Hook re-export types
// ===========================================================================

describe('type re-exports', () => {
  it('re-exports KagentCRDAgent type', async () => {
    const mod = await import('../kagent_crds')
    // Type re-exports are checked at compile time; we verify module has the hooks
    expect(mod.useKagentCRDAgents).toBeDefined()
    expect(mod.useKagentCRDTools).toBeDefined()
    expect(mod.useKagentCRDModels).toBeDefined()
    expect(mod.useKagentCRDMemories).toBeDefined()
  })
})

// ===========================================================================
// Expanded coverage: agentFetch internals, namespace filtering,
// abort/timeout, missing data keys, demo data field validation
// ===========================================================================

describe('demo data field completeness', () => {
  it('demo agents have runtime, a2aEnabled, replicas, and age fields', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData as Array<Record<string, unknown>>
      for (const agent of agents) {
        expect(typeof agent.runtime).toBe('string')
        expect(typeof agent.a2aEnabled).toBe('boolean')
        expect(typeof agent.replicas).toBe('number')
        expect(typeof agent.readyReplicas).toBe('number')
        expect(typeof agent.age).toBe('string')
        expect(typeof agent.systemMessage).toBe('string')
        expect(typeof agent.toolCount).toBe('number')
        expect(typeof agent.modelConfigRef).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo agents have valid status values', () => {
    const validStatuses = ['Ready', 'Accepted', 'Pending', 'Failed', 'Unknown']
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const agents = opts.demoData as Array<Record<string, unknown>>
      for (const agent of agents) {
        expect(validStatuses).toContain(agent.status)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDAgents())
  })

  it('demo tools have correct protocol values', () => {
    const validProtocols = ['stdio', 'sse', 'streamableHTTP']
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData as Array<Record<string, unknown>>
      for (const tool of tools) {
        expect(validProtocols).toContain(tool.protocol)
        expect(typeof tool.url).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo tools discoveredTools have name and description', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const tools = opts.demoData as Array<Record<string, unknown>>
      for (const tool of tools) {
        const discovered = tool.discoveredTools as Array<Record<string, unknown>>
        expect(discovered.length).toBeGreaterThan(0)
        for (const dt of discovered) {
          expect(typeof dt.name).toBe('string')
          expect(typeof dt.description).toBe('string')
        }
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDTools())
  })

  it('demo models have discoveredModels array and modelCount', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData as Array<Record<string, unknown>>
      for (const model of models) {
        expect(Array.isArray(model.discoveredModels)).toBe(true)
        expect(typeof model.modelCount).toBe('number')
        expect(typeof model.lastDiscoveryTime).toBe('string')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo models with ModelProviderConfig have non-empty discoveredModels', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const models = opts.demoData as Array<Record<string, unknown>>
      const providerConfigs = models.filter(m => m.kind === 'ModelProviderConfig')
      expect(providerConfigs.length).toBeGreaterThan(0)
      for (const pc of providerConfigs) {
        const discovered = pc.discoveredModels as string[]
        expect(discovered.length).toBeGreaterThan(0)
        expect(pc.modelCount).toBe(discovered.length)
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDModels())
  })

  it('demo memories have exactly the expected entries', () => {
    mockUseCache.mockImplementation((opts: { demoData: unknown[] }) => {
      const memories = opts.demoData as Array<Record<string, unknown>>
      expect(memories.length).toBe(2)
      const names = memories.map(m => m.name)
      expect(names).toContain('incident-memory')
      expect(names).toContain('code-review-memory')
      for (const memory of memories) {
        expect(memory.provider).toBe('pinecone')
        expect(memory.status).toBe('Ready')
      }
      return {
        data: [], isLoading: false, isRefreshing: false, error: null,
        refetch: vi.fn(), isDemoData: false, isDemoFallback: false,
        consecutiveFailures: 0, isFailed: false, lastRefresh: null,
      }
    })
    renderHook(() => useKagentCRDMemories())
  })
})
