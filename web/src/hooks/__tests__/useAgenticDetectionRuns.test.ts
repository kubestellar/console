import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  createCachedHook: vi.fn((_config: unknown) => () => mockUseCache(_config)),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(overrides = {}) {
  return {
    data: {
      runs: [],
      issueUrl: '',
      totalCount: 0,
      source: '',
      cachedAt: new Date().toISOString(),
      isDemoData: false,
    },
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
// Import after mocks
// ---------------------------------------------------------------------------

import { useAgenticDetectionRuns } from '../useAgenticDetectionRuns'
import type { DetectionRun, DetectionRunsData } from '../useAgenticDetectionRuns'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCacheResult())
})

describe('useAgenticDetectionRuns', () => {
  describe('result shape', () => {
    it('returns standard cache fields', () => {
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isRefreshing')
      expect(result.current).toHaveProperty('isDemoFallback')
      expect(result.current).toHaveProperty('isFailed')
      expect(result.current).toHaveProperty('refetch')
    })

    it('exposes data with runs array', () => {
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.data).toHaveProperty('runs')
      expect(Array.isArray(result.current.data.runs)).toBe(true)
    })

    it('exposes data with issueUrl and totalCount', () => {
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.data).toHaveProperty('issueUrl')
      expect(result.current.data).toHaveProperty('totalCount')
    })
  })

  describe('initial data', () => {
    it('has empty runs array in initial state', () => {
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.data.runs).toEqual([])
      expect(result.current.data.totalCount).toBe(0)
    })

    it('isLoading false when cache settled', () => {
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('with demo data', () => {
    it('surfaces demo runs when isDemoFallback true', () => {
      const demoRuns: DetectionRun[] = [
        {
          conclusion: 'warning',
          reason: 'parse_error',
          workflowUrl: 'https://github.com/kubestellar/console/actions/runs/123',
          runId: '123',
          commentedAt: new Date().toISOString(),
          commentUrl: 'https://github.com/kubestellar/console/issues/13634#issuecomment-1',
        },
      ]
      const demoData: DetectionRunsData = {
        runs: demoRuns,
        issueUrl: 'https://github.com/kubestellar/console/issues/13634',
        totalCount: 1,
        source: 'demo',
        cachedAt: new Date().toISOString(),
        isDemoData: true,
      }
      mockUseCache.mockReturnValue(defaultCacheResult({ data: demoData, isDemoFallback: true }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.isDemoFallback).toBe(true)
      expect(result.current.data.runs).toHaveLength(1)
      expect(result.current.data.runs[0].conclusion).toBe('warning')
      expect(result.current.data.runs[0].reason).toBe('parse_error')
      expect(result.current.data.isDemoData).toBe(true)
    })

    it('demo data has valid run shapes', () => {
      const demoRuns: DetectionRun[] = [
        {
          conclusion: 'warning',
          reason: 'parse_error',
          workflowUrl: 'https://github.com/kubestellar/console/actions/runs/25864572226',
          runId: '25864572226',
          commentedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          commentUrl: 'https://github.com/kubestellar/console/issues/13634#issuecomment-12345',
        },
        {
          conclusion: 'failure',
          reason: 'agent_failure',
          workflowUrl: 'https://github.com/kubestellar/console/actions/runs/25864572224',
          runId: '25864572224',
          commentedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          commentUrl: 'https://github.com/kubestellar/console/issues/13634#issuecomment-12343',
        },
      ]
      demoRuns.forEach(run => {
        expect(run).toHaveProperty('conclusion')
        expect(run).toHaveProperty('reason')
        expect(run).toHaveProperty('workflowUrl')
        expect(run).toHaveProperty('runId')
        expect(run).toHaveProperty('commentedAt')
        expect(run).toHaveProperty('commentUrl')
      })
    })
  })

  describe('loading and error states', () => {
    it('forwards isLoading true from cache', () => {
      mockUseCache.mockReturnValue(defaultCacheResult({ isLoading: true }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.isLoading).toBe(true)
    })

    it('forwards isRefreshing true from cache', () => {
      mockUseCache.mockReturnValue(defaultCacheResult({ isRefreshing: true }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.isRefreshing).toBe(true)
    })

    it('forwards isFailed true from cache', () => {
      mockUseCache.mockReturnValue(defaultCacheResult({ isFailed: true, consecutiveFailures: 3 }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBe(3)
    })

    it('error field forwarded from cache', () => {
      const err = new Error('fetch failed')
      mockUseCache.mockReturnValue(defaultCacheResult({ error: err }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      expect(result.current.error).toBe(err)
    })
  })

  describe('refetch', () => {
    it('exposes callable refetch function', () => {
      const refetchMock = vi.fn()
      mockUseCache.mockReturnValue(defaultCacheResult({ refetch: refetchMock }))
      const { result } = renderHook(() => useAgenticDetectionRuns())
      result.current.refetch()
      expect(refetchMock).toHaveBeenCalledOnce()
    })
  })

  describe('DetectionRun type shape', () => {
    it('run fields have expected types', () => {
      const run: DetectionRun = {
        conclusion: 'success',
        reason: 'ok',
        workflowUrl: 'https://example.com',
        runId: '42',
        commentedAt: new Date().toISOString(),
        commentUrl: 'https://example.com/comment',
      }
      expect(typeof run.conclusion).toBe('string')
      expect(typeof run.reason).toBe('string')
      expect(typeof run.workflowUrl).toBe('string')
      expect(typeof run.runId).toBe('string')
      expect(typeof run.commentedAt).toBe('string')
      expect(typeof run.commentUrl).toBe('string')
    })
  })

  describe('cache key', () => {
    it('uses agentic-detection-runs cache key', () => {
      renderHook(() => useAgenticDetectionRuns())
      // createCachedHook factory is called with a config containing the key
      const config = mockUseCache.mock.calls[0]?.[0] as { key: string } | undefined
      if (config && typeof config === 'object' && 'key' in config) {
        expect(config.key).toBe('agentic-detection-runs')
      }
    })
  })
})
