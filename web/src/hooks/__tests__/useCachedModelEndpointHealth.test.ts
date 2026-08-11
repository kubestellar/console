/**
 * Tests for useCachedModelEndpointHealth — Model endpoint health monitoring hook.
 *
 * Covers:
 * - summarizeModelEndpointHealth pure function (all health states, replica counts)
 * - getDemoModelEndpointHealth demo data shape
 * - fetchModelEndpointHealth fetcher (filtering, error propagation)
 * - useCachedModelEndpointHealth hook (field forwarding, isDemoFallback suppression)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockFetchLLMdServers = vi.fn()
vi.mock('../useCachedLLMd', () => ({
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
}))

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
  createCachedHook: () => {
    return () => mockUseCache()
  },
}))

import {
  summarizeModelEndpointHealth,
  getDemoModelEndpointHealth,
  fetchModelEndpointHealth,
  useCachedModelEndpointHealth,
} from '../useCachedModelEndpointHealth'
import type { LLMdServer } from '../useLLMd'

function makeEndpoint(overrides: Partial<LLMdServer> = {}): LLMdServer {
  return {
    id: 'ep-1',
    name: 'test-model',
    namespace: 'llm-d',
    cluster: 'vllm-d',
    model: 'llama-3-70b',
    type: 'vllm',
    componentType: 'model',
    status: 'running',
    replicas: 2,
    readyReplicas: 2,
    ...overrides,
  }
}

const EMPTY_SUMMARY = {
  health: 'unavailable',
  totalEndpoints: 0,
  readyEndpoints: 0,
  degradedEndpoints: 0,
  unavailableEndpoints: 0,
  totalReadyReplicas: 0,
  totalReplicas: 0,
}

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
  data: {
    endpoints: [],
    summary: { ...EMPTY_SUMMARY },
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
  mockUseCache.mockReturnValue(makeCacheResult())
})

// ---------------------------------------------------------------------------
// summarizeModelEndpointHealth
// ---------------------------------------------------------------------------

describe('summarizeModelEndpointHealth', () => {
  it('returns unavailable when endpoints array is empty', () => {
    const result = summarizeModelEndpointHealth([])
    expect(result.health).toBe('unavailable')
    expect(result.totalEndpoints).toBe(0)
    expect(result.totalReplicas).toBe(0)
  })

  it('returns unavailable when totalReplicas is 0', () => {
    const result = summarizeModelEndpointHealth([
      makeEndpoint({ replicas: 0, readyReplicas: 0 }),
    ])
    expect(result.health).toBe('unavailable')
  })

  it('returns healthy when all endpoints are running with full replicas', () => {
    const endpoints = [
      makeEndpoint({ id: '1', replicas: 2, readyReplicas: 2 }),
      makeEndpoint({ id: '2', replicas: 3, readyReplicas: 3 }),
    ]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.health).toBe('healthy')
    expect(result.totalEndpoints).toBe(2)
    expect(result.readyEndpoints).toBe(2)
    expect(result.totalReplicas).toBe(5)
    expect(result.totalReadyReplicas).toBe(5)
  })

  it('returns degraded when any endpoint is scaling', () => {
    const endpoints = [
      makeEndpoint({ id: '1', status: 'running', replicas: 2, readyReplicas: 2 }),
      makeEndpoint({ id: '2', status: 'scaling', replicas: 2, readyReplicas: 1 }),
    ]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.health).toBe('degraded')
    expect(result.degradedEndpoints).toBe(1)
  })

  it('returns degraded when any endpoint is stopped', () => {
    const endpoints = [makeEndpoint({ status: 'stopped', replicas: 1, readyReplicas: 0 })]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.health).toBe('degraded')
    expect(result.unavailableEndpoints).toBe(1)
  })

  it('returns degraded when any endpoint is in error state', () => {
    const endpoints = [makeEndpoint({ status: 'error', replicas: 1, readyReplicas: 0 })]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.health).toBe('degraded')
    expect(result.unavailableEndpoints).toBe(1)
  })

  it('returns degraded when readyReplicas < totalReplicas', () => {
    const endpoints = [
      makeEndpoint({ status: 'running', replicas: 3, readyReplicas: 2 }),
    ]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.health).toBe('degraded')
    expect(result.totalReplicas).toBe(3)
    expect(result.totalReadyReplicas).toBe(2)
  })

  it('sums replicas across multiple endpoints', () => {
    const endpoints = [
      makeEndpoint({ id: '1', replicas: 2, readyReplicas: 2 }),
      makeEndpoint({ id: '2', replicas: 4, readyReplicas: 3 }),
    ]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.totalReplicas).toBe(6)
    expect(result.totalReadyReplicas).toBe(5)
  })

  it('handles undefined replicas as 0', () => {
    const endpoints = [makeEndpoint({ replicas: undefined, readyReplicas: undefined })]
    const result = summarizeModelEndpointHealth(endpoints)
    expect(result.totalReplicas).toBe(0)
    expect(result.totalReadyReplicas).toBe(0)
    expect(result.health).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// getDemoModelEndpointHealth
// ---------------------------------------------------------------------------

describe('getDemoModelEndpointHealth', () => {
  it('returns a valid ModelEndpointHealthData shape', () => {
    const demo = getDemoModelEndpointHealth()
    expect(Array.isArray(demo.endpoints)).toBe(true)
    expect(demo.endpoints.length).toBeGreaterThan(0)
    expect(demo.summary).toHaveProperty('health')
    expect(demo.summary).toHaveProperty('totalEndpoints')
    expect(demo.summary).toHaveProperty('totalReplicas')
    expect(typeof demo.lastCheckTime).toBe('string')
    expect(demo.lastCheckTime.length).toBeGreaterThan(0)
  })

  it('all demo endpoints have componentType model', () => {
    const demo = getDemoModelEndpointHealth()
    demo.endpoints.forEach((ep) => {
      expect(ep.componentType).toBe('model')
    })
  })

  it('demo summary is consistent with demo endpoints', () => {
    const demo = getDemoModelEndpointHealth()
    const recomputed = summarizeModelEndpointHealth(demo.endpoints)
    expect(demo.summary.totalEndpoints).toBe(recomputed.totalEndpoints)
    expect(demo.summary.totalReplicas).toBe(recomputed.totalReplicas)
  })
})

// ---------------------------------------------------------------------------
// fetchModelEndpointHealth
// ---------------------------------------------------------------------------

describe('fetchModelEndpointHealth', () => {
  it('filters servers to only model componentType', async () => {
    const servers: LLMdServer[] = [
      makeEndpoint({ id: '1', componentType: 'model' }),
      makeEndpoint({ id: '2', componentType: 'epp' }),
      makeEndpoint({ id: '3', componentType: 'model' }),
    ]
    mockFetchLLMdServers.mockResolvedValue(servers)

    const result = await fetchModelEndpointHealth(['test-cluster'])
    expect(result.endpoints).toHaveLength(2)
    expect(result.endpoints.every((e) => e.componentType === 'model')).toBe(true)
  })

  it('returns empty endpoints when no model servers exist', async () => {
    mockFetchLLMdServers.mockResolvedValue([
      makeEndpoint({ id: '1', componentType: 'epp' }),
    ])
    const result = await fetchModelEndpointHealth()
    expect(result.endpoints).toHaveLength(0)
    expect(result.summary.health).toBe('unavailable')
  })

  it('propagates errors from fetchLLMdServers', async () => {
    mockFetchLLMdServers.mockRejectedValue(new Error('fetch failed'))
    await expect(fetchModelEndpointHealth()).rejects.toThrow('fetch failed')
  })

  it('passes provided clusters to fetchLLMdServers', async () => {
    mockFetchLLMdServers.mockResolvedValue([])
    await fetchModelEndpointHealth(['cluster-x', 'cluster-y'])
    expect(mockFetchLLMdServers).toHaveBeenCalledWith(['cluster-x', 'cluster-y'])
  })

  it('sets lastCheckTime to a valid ISO string', async () => {
    mockFetchLLMdServers.mockResolvedValue([makeEndpoint()])
    const before = Date.now()
    const result = await fetchModelEndpointHealth()
    const after = Date.now()
    const ts = new Date(result.lastCheckTime).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

// ---------------------------------------------------------------------------
// useCachedModelEndpointHealth hook
// ---------------------------------------------------------------------------

describe('useCachedModelEndpointHealth', () => {
  it('returns endpoints and summary from cache data', () => {
    const endpoints = [makeEndpoint()]
    const summary = summarizeModelEndpointHealth(endpoints)
    mockUseCache.mockReturnValue(
      makeCacheResult({ data: { endpoints, summary, lastCheckTime: '2024-01-01T00:00:00Z' } })
    )
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(result.current.endpoints).toHaveLength(1)
    expect(result.current.summary.health).toBe('healthy')
  })

  it('isDemoFallback is false when not in demo mode', () => {
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('isDemoFallback is true when isDemoFallback and not loading', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true, isLoading: false }))
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('isDemoFallback is suppressed while isLoading is true', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true, isLoading: true }))
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('forwards isFailed and consecutiveFailures from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isFailed: true, consecutiveFailures: 5 }))
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(5)
  })

  it('returns refetch function', () => {
    const { result } = renderHook(() => useCachedModelEndpointHealth())
    expect(typeof result.current.refetch).toBe('function')
  })
})
