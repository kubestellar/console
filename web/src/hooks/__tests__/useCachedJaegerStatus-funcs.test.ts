/**
 * Fetcher function tests for useCachedJaegerStatus.ts.
 * This hook delegates to fetchJaegerStatus from agentFetchers,
 * so we mock that and test the fetcher passed to useCache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockFetchJaegerStatus = vi.fn()

vi.mock('../useCachedData/agentFetchers', () => ({
    createCachedHook: vi.fn(),
  fetchJaegerStatus: (...args: unknown[]) => mockFetchJaegerStatus(...args),
}))

vi.mock('../useCachedData/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoJaegerStatus: () => ({
    status: 'Healthy',
    version: '1.53.0',
    collectors: { count: 2, status: 'Healthy' },
    query: { status: 'Healthy' },
    metrics: {
      servicesCount: 10,
      tracesLastHour: 5000,
      dependenciesCount: 15,
      avgLatencyMs: 25,
      p95LatencyMs: 100,
      p99LatencyMs: 250,
      spansDroppedLastHour: 0,
      avgQueueLength: 2,
    },
  }),
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: (config: Record<string, unknown>) => {
        return () => {
            const result = mockUseCache(config)
            return {
                data: result.data,
                isLoading: result.isLoading,
                isRefreshing: result.isRefreshing,
                isDemoFallback: result.isDemoFallback && !result.isLoading,
                error: result.error,
                isFailed: result.isFailed,
                consecutiveFailures: result.consecutiveFailures,
                lastRefresh: result.lastRefresh,
                refetch: result.refetch,
            }
        }
    },
    useCache: (...args: unknown[]) => mockUseCache(...args),
}))

import { useCachedJaegerStatus } from '../useCachedJaegerStatus'

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('useCachedJaegerStatus fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { status: 'Healthy', version: '', collectors: { count: 0, status: 'Healthy' }, query: { status: 'Healthy' }, metrics: { servicesCount: 0, tracesLastHour: 0, dependenciesCount: 0, avgLatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0, spansDroppedLastHour: 0, avgQueueLength: 0 } },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('returns data from fetchJaegerStatus on success', async () => {
    renderHook(() => useCachedJaegerStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    const mockData = {
      status: 'Healthy',
      version: '1.53.0',
      collectors: { count: 2, status: 'Healthy' },
      query: { status: 'Healthy' },
      metrics: {
        servicesCount: 10,
        tracesLastHour: 5000,
        dependenciesCount: 15,
        avgLatencyMs: 25,
        p95LatencyMs: 100,
        p99LatencyMs: 250,
        spansDroppedLastHour: 0,
        avgQueueLength: 2,
      },
    }
    mockFetchJaegerStatus.mockResolvedValueOnce(mockData)

    const result = await fetcher()
    expect(result).toBe(mockData)
  })

  it('throws when fetchJaegerStatus returns null', async () => {
    renderHook(() => useCachedJaegerStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockFetchJaegerStatus.mockResolvedValueOnce(null)

    await expect(fetcher()).rejects.toThrow('Jaeger status unavailable')
  })

  it('propagates network error from fetchJaegerStatus', async () => {
    renderHook(() => useCachedJaegerStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockFetchJaegerStatus.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Network failure')
  })
})
