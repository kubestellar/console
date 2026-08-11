/**
 * Tests for useCachedDrasiPipelines hook.
 *
 * Verifies the hook is correctly wired via createCachedHook factory
 * and returns the expected shape, including the isDemoData alias.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DrasiPipelineData } from '../../lib/demo/drasi'

const INITIAL_DATA: DrasiPipelineData[] = []

const mockUseCache = vi.fn()

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook:
    (_config: { key: string; initialData: unknown; fetcher: () => Promise<unknown> }) =>
    () =>
      mockUseCache(_config),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../../lib/demo/drasi', () => ({
  generateDrasiPipelines: vi.fn(),
}))

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
  data: INITIAL_DATA,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
  ...overrides,
})

import { useCachedDrasiPipelines } from '../useCachedDrasiPipelines'

describe('useCachedDrasiPipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue(makeCacheResult())
  })

  it('returns the expected hook result shape', () => {
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('returns empty array and isDemoData=false when not in demo mode', () => {
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(result.current.data).toHaveLength(0)
    expect(result.current.isDemoData).toBe(false)
  })

  it('sets isDemoData=true when isDemoFallback is set', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true }))
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current.isDemoData).toBe(true)
  })

  it('is not loading when data is available', () => {
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('handles loading state correctly', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }),
    )
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current.isLoading).toBe(true)
  })

  it('reflects pipeline data when provided', () => {
    const pipelines: DrasiPipelineData[] = [
      {
        pipelineName: 'orders-pipeline',
        status: 'running',
        continuousQueriesCount: 3,
        reactionsCount: 2,
        lastEventAt: '2024-01-01T00:00:00Z',
      },
      {
        pipelineName: 'inventory-pipeline',
        status: 'error',
        continuousQueriesCount: 1,
        reactionsCount: 1,
        lastEventAt: '2024-01-01T00:01:00Z',
      },
    ]
    mockUseCache.mockReturnValue(makeCacheResult({ data: pipelines }))
    const { result } = renderHook(() => useCachedDrasiPipelines())
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data[0].pipelineName).toBe('orders-pipeline')
    expect(result.current.data[0].status).toBe('running')
    expect(result.current.data[1].status).toBe('error')
  })
})
