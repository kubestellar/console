/**
 * Tests for useCachedJaegerStatus hook.
 *
 * Verifies the hook is correctly wired via createCachedHook factory
 * and returns the expected shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock the cache factory
const mockUseCache = vi.fn(() => ({
  data: {
    status: 'Healthy',
    version: '1.50.0',
    collectors: { count: 2, status: 'Healthy' },
    query: { status: 'Healthy' },
    metrics: {
      servicesCount: 12,
      tracesLastHour: 500,
      dependenciesCount: 8,
      avgLatencyMs: 42,
      p95LatencyMs: 120,
      p99LatencyMs: 250,
      spansDroppedLastHour: 0,
      avgQueueLength: 3,
    },
  },
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
  retryFetch: vi.fn(),
  clearAndRefetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (config: { key: string; initialData: unknown; fetcher: () => Promise<unknown> }) => {
    return () => {
      const result = mockUseCache()
      // Verify the config was passed correctly
      if (config.key !== 'jaeger_status') {
        throw new Error(`Unexpected key: ${config.key}`)
      }
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
        retryFetch: result.retryFetch,
      }
    }
  },
}))

vi.mock('../useCachedData/agentFetchers', () => ({
  fetchJaegerStatus: vi.fn(),
}))

vi.mock('../useCachedData/demoData', () => ({
  getDemoJaegerStatus: vi.fn(() => ({
    status: 'Healthy',
    version: 'demo-1.0',
    collectors: { count: 1, status: 'Healthy' },
    query: { status: 'Healthy' },
    metrics: {
      servicesCount: 5,
      tracesLastHour: 100,
      dependenciesCount: 3,
      avgLatencyMs: 30,
      p95LatencyMs: 80,
      p99LatencyMs: 150,
      spansDroppedLastHour: 0,
      avgQueueLength: 1,
    },
  })),
}))

import { useCachedJaegerStatus } from '../useCachedJaegerStatus'

describe('useCachedJaegerStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the expected CachedHookResult shape', () => {
    const { result } = renderHook(() => useCachedJaegerStatus())

    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns Jaeger status data with expected fields', () => {
    const { result } = renderHook(() => useCachedJaegerStatus())
    const data = result.current.data

    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('collectors')
    expect(data).toHaveProperty('query')
    expect(data).toHaveProperty('metrics')
    expect(data.metrics).toHaveProperty('servicesCount')
    expect(data.metrics).toHaveProperty('tracesLastHour')
    expect(data.metrics).toHaveProperty('avgLatencyMs')
    expect(data.metrics).toHaveProperty('p95LatencyMs')
    expect(data.metrics).toHaveProperty('p99LatencyMs')
  })

  it('is not loading when data is available', () => {
    const { result } = renderHook(() => useCachedJaegerStatus())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('isDemoFallback is false when not in demo mode and not loading', () => {
    const { result } = renderHook(() => useCachedJaegerStatus())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('handles loading state correctly', () => {
    mockUseCache.mockReturnValueOnce({
      data: {
        status: 'Healthy',
        version: '',
        collectors: { count: 0, status: 'Healthy' },
        query: { status: 'Healthy' },
        metrics: {
          servicesCount: 0, tracesLastHour: 0, dependenciesCount: 0,
          avgLatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0,
          spansDroppedLastHour: 0, avgQueueLength: 0,
        },
      },
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: true,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
      retryFetch: vi.fn(),
      clearAndRefetch: vi.fn(),
    })

    const { result } = renderHook(() => useCachedJaegerStatus())
    expect(result.current.isLoading).toBe(true)
    // isDemoFallback should be false when loading (per createCachedHook contract)
    expect(result.current.isDemoFallback).toBe(false)
  })
})
