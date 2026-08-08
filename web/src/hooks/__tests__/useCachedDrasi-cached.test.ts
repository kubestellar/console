/**
 * Tests for the three thin `createCachedHook`-based wrappers:
 *   - useCachedDrasiHealth
 *   - useCachedDrasiPipelines
 *   - useCachedDrasiTopology
 *
 * Each hook's only bespoke logic is:
 *   1. Its `fetcher()` — calls `agentFetch(<endpoint>)`, parses JSON, falls
 *      back to defaults for missing/malformed bodies, throws on !ok.
 *   2. Its `isDemoData` alias mapping to `isDemoFallback` from the underlying
 *      cache result.
 *
 * We mock `../../lib/cache` so `createCachedHook(config)` records the config
 * and returns a hook that calls a controllable `mockUseCache`. That lets us
 * pull the real fetcher out of the recorded config and invoke it directly
 * against a mocked `agentFetch`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAgentFetch, mockUseCache, capturedConfigs } = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockUseCache: vi.fn(),
  capturedConfigs: [] as unknown[],
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (config: unknown) => {
    capturedConfigs.push(config)
    return () => mockUseCache(config)
  },
}))

// Silence any downstream demo-data imports that need it.
vi.mock('../../lib/demo/drasi', () => ({
  generateDrasiPipelines: () => [],
}))
vi.mock('../../lib/demo/drasiHealth', () => ({
  generateDrasiHealthSummary: () => ({
    overallHealth: 'healthy',
    pipelines: [],
    totalSources: 0,
    healthySources: 0,
    totalQueries: 0,
    healthyQueries: 0,
    totalReactions: 0,
    healthyReactions: 0,
  }),
}))
vi.mock('../../lib/demo/drasiTopology', () => ({
  generateDrasiTopology: () => ({
    nodes: [],
    edges: [],
    totalSources: 0,
    totalQueries: 0,
    totalReactions: 0,
    connectedPairs: 0,
    orphanedNodes: 0,
  }),
}))

// Baseline mockUseCache return shape.
function baseCacheReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
    retryFetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Import hooks after mocks are set up
// ---------------------------------------------------------------------------

import { useCachedDrasiHealth } from '../useCachedDrasiHealth'
import { useCachedDrasiPipelines } from '../useCachedDrasiPipelines'
import { useCachedDrasiTopology } from '../useCachedDrasiTopology'

interface CachedHookConfig {
  key: string
  fetcher: () => Promise<unknown>
  initialData: unknown
}

function findConfig(key: string): CachedHookConfig {
  const match = capturedConfigs.find(
    (c): c is CachedHookConfig =>
      typeof c === 'object' && c !== null && (c as { key?: string }).key === key,
  )
  if (!match) throw new Error(`No captured config for key ${key}`)
  return match
}

// ---------------------------------------------------------------------------
// useCachedDrasiHealth
// ---------------------------------------------------------------------------

describe('useCachedDrasiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(baseCacheReturn())
  })

  it('registers a cached hook with key drasi_health', () => {
    expect(() => findConfig('drasi_health')).not.toThrow()
  })

  it('exposes isDemoData mirroring isDemoFallback from the underlying result', () => {
    mockUseCache.mockReturnValue(baseCacheReturn({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.isDemoData).toBe(true)
  })

  it('isDemoData is false when isDemoFallback is false', () => {
    mockUseCache.mockReturnValue(baseCacheReturn({ isDemoFallback: false }))
    const { result } = renderHook(() => useCachedDrasiHealth())
    expect(result.current.isDemoData).toBe(false)
  })

  describe('fetcher', () => {
    it('returns the parsed health summary on a 200 response', async () => {
      const health = {
        overallHealth: 'healthy',
        pipelines: [],
        totalSources: 2,
        healthySources: 2,
        totalQueries: 3,
        healthyQueries: 3,
        totalReactions: 1,
        healthyReactions: 1,
      }
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ health }),
      })

      const result = await findConfig('drasi_health').fetcher()
      expect(result).toEqual(health)
      expect(mockAgentFetch).toHaveBeenCalledWith(
        'http://localhost:8585/drasi/health',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        }),
      )
    })

    it('falls back to INITIAL_DATA when body has no `health` field', async () => {
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      const result = (await findConfig('drasi_health').fetcher()) as {
        overallHealth: string
        totalSources: number
      }
      expect(result.overallHealth).toBe('healthy')
      expect(result.totalSources).toBe(0)
    })

    it('throws on a non-ok response', async () => {
      mockAgentFetch.mockResolvedValue({ ok: false, status: 503 })
      await expect(findConfig('drasi_health').fetcher()).rejects.toThrow(
        /drasi\/health HTTP 503/,
      )
    })
  })
})

// ---------------------------------------------------------------------------
// useCachedDrasiPipelines
// ---------------------------------------------------------------------------

describe('useCachedDrasiPipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(baseCacheReturn())
  })

  it('registers a cached hook with key drasi_pipelines', () => {
    expect(() => findConfig('drasi_pipelines')).not.toThrow()
  })

  it('exposes isDemoData mirroring isDemoFallback', () => {
    mockUseCache.mockReturnValue(baseCacheReturn({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current.isDemoData).toBe(true)
  })

  describe('fetcher', () => {
    it('returns the parsed pipelines array on a 200 response', async () => {
      const pipelines = [{ id: 'p1' }, { id: 'p2' }]
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ pipelines }),
      })

      const result = await findConfig('drasi_pipelines').fetcher()
      expect(result).toEqual(pipelines)
      expect(mockAgentFetch).toHaveBeenCalledWith(
        'http://localhost:8585/drasi/pipelines',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        }),
      )
    })

    it('returns [] when body.pipelines is missing', async () => {
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
      const result = await findConfig('drasi_pipelines').fetcher()
      expect(result).toEqual([])
    })

    it('returns [] when body.pipelines is not an array', async () => {
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ pipelines: 'not-an-array' }),
      })
      const result = await findConfig('drasi_pipelines').fetcher()
      expect(result).toEqual([])
    })

    it('throws on a non-ok response', async () => {
      mockAgentFetch.mockResolvedValue({ ok: false, status: 500 })
      await expect(findConfig('drasi_pipelines').fetcher()).rejects.toThrow(
        /drasi\/pipelines HTTP 500/,
      )
    })
  })
})

// ---------------------------------------------------------------------------
// useCachedDrasiTopology
// ---------------------------------------------------------------------------

describe('useCachedDrasiTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(baseCacheReturn())
  })

  it('registers a cached hook with key drasi_topology', () => {
    expect(() => findConfig('drasi_topology')).not.toThrow()
  })

  it('exposes isDemoData mirroring isDemoFallback', () => {
    mockUseCache.mockReturnValue(baseCacheReturn({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiTopology())
    expect(result.current.isDemoData).toBe(true)
  })

  describe('fetcher', () => {
    it('returns the parsed topology on a 200 response', async () => {
      const topology = {
        nodes: [{ id: 'a' }],
        edges: [{ from: 'a', to: 'b' }],
        totalSources: 1,
        totalQueries: 2,
        totalReactions: 3,
        connectedPairs: 4,
        orphanedNodes: 0,
      }
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ topology }),
      })

      const result = await findConfig('drasi_topology').fetcher()
      expect(result).toEqual(topology)
      expect(mockAgentFetch).toHaveBeenCalledWith(
        'http://localhost:8585/drasi/topology',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        }),
      )
    })

    it('falls back to INITIAL_DATA when body has no `topology` field', async () => {
      mockAgentFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
      const result = (await findConfig('drasi_topology').fetcher()) as {
        nodes: unknown[]
        edges: unknown[]
        connectedPairs: number
      }
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
      expect(result.connectedPairs).toBe(0)
    })

    it('throws on a non-ok response', async () => {
      mockAgentFetch.mockResolvedValue({ ok: false, status: 404 })
      await expect(findConfig('drasi_topology').fetcher()).rejects.toThrow(
        /drasi\/topology HTTP 404/,
      )
    })
  })
})
