/**
 * Tests for useCachedEPPStatus — EPP (Endpoint Picker Protocol) monitoring hook.
 *
 * Covers:
 * - summarizeEPPStatus pure function (all health states)
 * - getDemoEPPStatus demo data shape
 * - fetchEPPStatus fetcher (success, HTTP error, component filtering)
 * - useCachedEPPStatus hook (isDemoData suppression during loading, field forwarding)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockFetchLLMdServers = vi.fn()
vi.mock('../useCachedLLMd', () => ({
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
}))

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
  createCachedHook: (config: unknown) => {
    capturedConfig = config
    return () => mockUseCache(config)
  },
}))

vi.mock('../../lib/demo/epp', () => ({
  generateEPPStatus: () => ({ queueDepth: 5, latency: 42, errorRate: 0.01 }),
}))

let capturedConfig: unknown = null

import {
  summarizeEPPStatus,
  getDemoEPPStatus,
  fetchEPPStatus,
  useCachedEPPStatus,
} from '../useCachedEPPStatus'
import type { LLMdServer } from '../useLLMd'

function makeServer(overrides: Partial<LLMdServer> = {}): LLMdServer {
  return {
    id: 'srv-1',
    name: 'test-server',
    namespace: 'llm-d',
    cluster: 'vllm-d',
    model: 'llama-3',
    type: 'llm-d',
    componentType: 'epp',
    status: 'running',
    replicas: 1,
    readyReplicas: 1,
    ...overrides,
  }
}

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
  data: {
    epps: [],
    summary: { health: 'unavailable', totalEPPs: 0, readyEPPs: 0, degradedEPPs: 0, unavailableEPPs: 0 },
    lastCheckTime: '',
  },
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  capturedConfig = null
  mockUseCache.mockReturnValue(makeCacheResult())
})

// ---------------------------------------------------------------------------
// summarizeEPPStatus
// ---------------------------------------------------------------------------

describe('summarizeEPPStatus', () => {
  it('returns unavailable when epps array is empty', () => {
    const result = summarizeEPPStatus([])
    expect(result.health).toBe('unavailable')
    expect(result.totalEPPs).toBe(0)
  })

  it('returns healthy when all EPPs are running', () => {
    const epps = [makeServer({ status: 'running' }), makeServer({ id: 'srv-2', status: 'running' })]
    const result = summarizeEPPStatus(epps)
    expect(result.health).toBe('healthy')
    expect(result.totalEPPs).toBe(2)
    expect(result.readyEPPs).toBe(2)
    expect(result.degradedEPPs).toBe(0)
    expect(result.unavailableEPPs).toBe(0)
  })

  it('returns degraded when any EPP is scaling', () => {
    const epps = [makeServer({ status: 'running' }), makeServer({ id: 'srv-2', status: 'scaling' })]
    const result = summarizeEPPStatus(epps)
    expect(result.health).toBe('degraded')
    expect(result.degradedEPPs).toBe(1)
  })

  it('returns degraded when any EPP is stopped', () => {
    const epps = [makeServer({ status: 'stopped' })]
    const result = summarizeEPPStatus(epps)
    expect(result.health).toBe('degraded')
    expect(result.unavailableEPPs).toBe(1)
  })

  it('returns degraded when any EPP is in error state', () => {
    const epps = [makeServer({ status: 'error' })]
    const result = summarizeEPPStatus(epps)
    expect(result.health).toBe('degraded')
    expect(result.unavailableEPPs).toBe(1)
  })

  it('counts each status category correctly', () => {
    const epps = [
      makeServer({ id: '1', status: 'running' }),
      makeServer({ id: '2', status: 'scaling' }),
      makeServer({ id: '3', status: 'stopped' }),
      makeServer({ id: '4', status: 'error' }),
    ]
    const result = summarizeEPPStatus(epps)
    expect(result.totalEPPs).toBe(4)
    expect(result.readyEPPs).toBe(1)
    expect(result.degradedEPPs).toBe(1)
    expect(result.unavailableEPPs).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// getDemoEPPStatus
// ---------------------------------------------------------------------------

describe('getDemoEPPStatus', () => {
  it('returns a valid EPPStatusData shape with EPPs and summary', () => {
    const demo = getDemoEPPStatus()
    expect(Array.isArray(demo.epps)).toBe(true)
    expect(demo.epps.length).toBeGreaterThan(0)
    expect(demo.summary).toHaveProperty('health')
    expect(demo.summary).toHaveProperty('totalEPPs')
    expect(typeof demo.lastCheckTime).toBe('string')
    expect(demo.lastCheckTime.length).toBeGreaterThan(0)
  })

  it('all demo EPPs have componentType epp', () => {
    const demo = getDemoEPPStatus()
    demo.epps.forEach((epp) => {
      expect(epp.componentType).toBe('epp')
    })
  })

  it('demo summary is consistent with demo EPPs', () => {
    const demo = getDemoEPPStatus()
    const recomputed = summarizeEPPStatus(demo.epps)
    expect(demo.summary.totalEPPs).toBe(recomputed.totalEPPs)
    expect(demo.summary.health).toBe(recomputed.health)
  })
})

// ---------------------------------------------------------------------------
// fetchEPPStatus
// ---------------------------------------------------------------------------

describe('fetchEPPStatus', () => {
  it('filters servers to only epp componentType', async () => {
    const servers: LLMdServer[] = [
      makeServer({ id: '1', componentType: 'epp' }),
      makeServer({ id: '2', componentType: 'model' }),
      makeServer({ id: '3', componentType: 'epp' }),
    ]
    mockFetchLLMdServers.mockResolvedValue(servers)

    const result = await fetchEPPStatus(['test-cluster'])
    expect(result.epps).toHaveLength(2)
    expect(result.epps.every((e) => e.componentType === 'epp')).toBe(true)
  })

  it('returns empty epps when no epp componentType servers exist', async () => {
    mockFetchLLMdServers.mockResolvedValue([
      makeServer({ id: '1', componentType: 'model' }),
    ])
    const result = await fetchEPPStatus()
    expect(result.epps).toHaveLength(0)
    expect(result.summary.health).toBe('unavailable')
  })

  it('propagates fetch errors from fetchLLMdServers', async () => {
    mockFetchLLMdServers.mockRejectedValue(new Error('network error'))
    await expect(fetchEPPStatus()).rejects.toThrow('network error')
  })

  it('sets lastCheckTime to a valid ISO string', async () => {
    mockFetchLLMdServers.mockResolvedValue([makeServer()])
    const before = Date.now()
    const result = await fetchEPPStatus()
    const after = Date.now()
    const ts = new Date(result.lastCheckTime).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('passes provided clusters to fetchLLMdServers', async () => {
    mockFetchLLMdServers.mockResolvedValue([])
    await fetchEPPStatus(['cluster-a', 'cluster-b'])
    expect(mockFetchLLMdServers).toHaveBeenCalledWith(['cluster-a', 'cluster-b'])
  })
})

// ---------------------------------------------------------------------------
// useCachedEPPStatus hook
// ---------------------------------------------------------------------------

describe('useCachedEPPStatus', () => {
  it('returns epps and summary from cache data', () => {
    const epps = [makeServer()]
    const summary = summarizeEPPStatus(epps)
    mockUseCache.mockReturnValue(
      makeCacheResult({ data: { epps, summary, lastCheckTime: '2024-01-01T00:00:00Z' } })
    )
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.epps).toHaveLength(1)
    expect(result.current.summary.health).toBe('healthy')
  })

  it('isDemoData is false when not demo fallback', () => {
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.isDemoData).toBe(false)
  })

  it('isDemoData is true when isDemoFallback and not loading', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true, isLoading: false }))
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.isDemoData).toBe(true)
  })

  it('isDemoData is suppressed (false) while isLoading is true', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true, isLoading: true }))
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('includes metrics field from generateEPPStatus', () => {
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.metrics).toEqual({ queueDepth: 5, latency: 42, errorRate: 0.01 })
  })

  it('accepts custom clusters parameter', () => {
    renderHook(() => useCachedEPPStatus(['my-cluster']))
    // createCachedHook should have been called — capturedConfig key includes the cluster
    expect(capturedConfig).not.toBeNull()
  })

  it('forwards isFailed and consecutiveFailures from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isFailed: true, consecutiveFailures: 3 }))
    const { result } = renderHook(() => useCachedEPPStatus())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(3)
  })
})
