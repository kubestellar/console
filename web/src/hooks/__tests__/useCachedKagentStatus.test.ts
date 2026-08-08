/**
 * Tests for useCachedKagentStatus.
 *
 * The hook is a `createCachedHook` wrapper whose only bespoke logic is its
 * `fetcher()` — it calls the global `fetch('/api/kagent/status')`, throws on
 * !ok, and coerces the response body to a fully-populated `KagentStatusData`
 * with array/number defaults for missing fields.
 *
 * We mock `../../lib/cache` so `createCachedHook(config)` records the config
 * and returns a hook that calls a controllable `mockUseCache`. That lets us
 * pull the real fetcher out of the recorded config and invoke it directly
 * against a mocked global `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockUseCache, capturedConfigs } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  capturedConfigs: [] as unknown[],
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
  }
})

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (config: unknown) => {
    capturedConfigs.push(config)
    return () => mockUseCache(config)
  },
}))

import {
  useCachedKagentStatus,
  HEALTH_THRESHOLD_HEALTHY,
  HEALTH_THRESHOLD_WARNING,
  type KagentStatusData,
} from '../useCachedKagentStatus'

interface CachedHookConfig {
  key: string
  category?: string
  fetcher: () => Promise<KagentStatusData>
  initialData: KagentStatusData
  demoData?: KagentStatusData
}

function findConfig(): CachedHookConfig {
  const match = capturedConfigs.find(
    (c): c is CachedHookConfig =>
      typeof c === 'object' &&
      c !== null &&
      (c as { key?: string }).key === 'kagent_status',
  )
  if (!match) throw new Error('No captured config for key kagent_status')
  return match
}

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
// Constants
// ---------------------------------------------------------------------------

describe('exported health thresholds', () => {
  it('exposes HEALTH_THRESHOLD_HEALTHY = 90', () => {
    expect(HEALTH_THRESHOLD_HEALTHY).toBe(90)
  })

  it('exposes HEALTH_THRESHOLD_WARNING = 70', () => {
    expect(HEALTH_THRESHOLD_WARNING).toBe(70)
  })

  it('warning threshold is strictly below healthy threshold', () => {
    expect(HEALTH_THRESHOLD_WARNING).toBeLessThan(HEALTH_THRESHOLD_HEALTHY)
  })
})

// ---------------------------------------------------------------------------
// Cached-hook registration
// ---------------------------------------------------------------------------

describe('useCachedKagentStatus cached-hook registration', () => {
  it('registers with cache key kagent_status', () => {
    expect(() => findConfig()).not.toThrow()
  })

  it('uses the "clusters" refresh category', () => {
    expect(findConfig().category).toBe('clusters')
  })

  it('supplies empty INITIAL_DATA', () => {
    const cfg = findConfig()
    expect(cfg.initialData.clusters).toEqual([])
    expect(cfg.initialData.totalAgents).toBe(0)
    expect(cfg.initialData.totalReady).toBe(0)
    expect(cfg.initialData.overallHealth).toBe(0)
  })

  it('supplies DEMO_DATA with realistic multi-cluster shape', () => {
    const cfg = findConfig()
    const demo = cfg.demoData
    expect(demo).toBeDefined()
    expect(demo!.clusters.length).toBeGreaterThanOrEqual(2)
    expect(demo!.totalAgents).toBeGreaterThan(0)
    expect(demo!.totalReady).toBeGreaterThan(0)
    expect(demo!.overallHealth).toBeGreaterThan(0)
    expect(demo!.overallHealth).toBeLessThanOrEqual(100)
    for (const cluster of demo!.clusters) {
      expect(cluster.readyAgents + cluster.pendingAgents + cluster.failedAgents)
        .toBeLessThanOrEqual(cluster.totalAgents)
      expect(cluster.agents.length).toBe(cluster.totalAgents)
    }
  })
})

// ---------------------------------------------------------------------------
// Hook wrapper passthrough (via mocked useCache)
// ---------------------------------------------------------------------------

describe('useCachedKagentStatus hook return', () => {
  beforeEach(() => {
    mockUseCache.mockReset()
  })

  it('passes through data/isLoading/refetch from the underlying cache', () => {
    const refetch = vi.fn()
    mockUseCache.mockReturnValue(
      baseCacheReturn({
        data: { clusters: [], totalAgents: 3, totalReady: 2, overallHealth: 66 },
        isLoading: true,
        refetch,
      }),
    )
    const { result } = renderHook(() => useCachedKagentStatus())
    expect(result.current.data?.totalAgents).toBe(3)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.refetch).toBe(refetch)
  })
})

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

describe('fetchKagentStatus (captured via createCachedHook config)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns the parsed payload on a 200 response', async () => {
    const payload: KagentStatusData = {
      clusters: [
        {
          cluster: 'prod',
          totalAgents: 2,
          readyAgents: 2,
          pendingAgents: 0,
          failedAgents: 0,
          healthPercentage: 100,
          agents: [],
        },
      ],
      totalAgents: 2,
      totalReady: 2,
      overallHealth: 100,
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    })

    const result = await findConfig().fetcher()
    expect(result).toEqual(payload)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/kagent/status',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('coerces missing clusters to [] and numeric fields to 0', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    const result = await findConfig().fetcher()
    expect(result.clusters).toEqual([])
    expect(result.totalAgents).toBe(0)
    expect(result.totalReady).toBe(0)
    expect(result.overallHealth).toBe(0)
  })

  it('coerces a non-array clusters field to []', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ clusters: 'not-an-array', totalAgents: 5 }),
    })
    const result = await findConfig().fetcher()
    expect(result.clusters).toEqual([])
    expect(result.totalAgents).toBe(5)
  })

  it('preserves partially-populated numeric fields', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          clusters: [],
          totalAgents: 4,
          overallHealth: 82,
        }),
    })
    const result = await findConfig().fetcher()
    expect(result.totalAgents).toBe(4)
    expect(result.totalReady).toBe(0)
    expect(result.overallHealth).toBe(82)
  })

  it('throws on non-ok response with status code in message', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
    })
    await expect(findConfig().fetcher()).rejects.toThrow(/kagent status HTTP 503/)
  })

  it('propagates network errors from fetch', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down'),
    )
    await expect(findConfig().fetcher()).rejects.toThrow('network down')
  })
})
