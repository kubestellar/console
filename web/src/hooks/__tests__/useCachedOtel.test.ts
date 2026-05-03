import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockAuthFetch } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockAuthFetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
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
}))

vi.mock('../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

import { useCachedOtel, __testables } from '../useCachedOtel'

const {
  isOtelCollectorPod,
  parseIntOrZero,
  deriveCollectorState,
  parseVersion,
  parsePipelines,
  normalizeSignal,
  podToCollector,
  summarize,
  buildStatus,
} = __testables

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(data: unknown = null) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCacheResult())
})

// ---------------------------------------------------------------------------
// Hook-level tests
// ---------------------------------------------------------------------------

describe('useCachedOtel hook', () => {
  it('renders without error', () => {
    const { result } = renderHook(() => useCachedOtel())
    expect(result.current).toBeDefined()
  })

  it('returns standard CachedHookResult shape', () => {
    const { result } = renderHook(() => useCachedOtel())
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

  it('passes correct cache key', () => {
    renderHook(() => useCachedOtel())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'otel-status' })
    )
  })

  it('suppresses isDemoFallback during loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isDemoFallback: true,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedOtel())
    expect(result.current.isDemoFallback).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pure function tests (supplement -funcs.test.ts with additional coverage)
// ---------------------------------------------------------------------------

describe('isOtelCollectorPod', () => {
  it('identifies pods with otel-collector in name', () => {
    expect(isOtelCollectorPod({ name: 'otel-collector-abc123' })).toBe(true)
  })

  it('identifies pods with opentelemetry-collector in name', () => {
    expect(isOtelCollectorPod({ name: 'opentelemetry-collector-0' })).toBe(true)
  })

  it('identifies pods by app.kubernetes.io/name label', () => {
    expect(isOtelCollectorPod({
      name: 'some-pod',
      metadata: { labels: { 'app.kubernetes.io/name': 'opentelemetry-collector' } },
    })).toBe(true)
  })

  it('rejects non-otel pods', () => {
    expect(isOtelCollectorPod({ name: 'nginx-pod' })).toBe(false)
  })
})

describe('parseIntOrZero', () => {
  it('parses valid number string', () => {
    expect(parseIntOrZero('42')).toBe(42)
  })

  it('returns 0 for undefined', () => {
    expect(parseIntOrZero(undefined)).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseIntOrZero('abc')).toBe(0)
  })
})

describe('normalizeSignal', () => {
  it('normalizes traces to traces', () => {
    expect(normalizeSignal('traces')).toBe('traces')
  })

  it('normalizes metrics to metrics', () => {
    expect(normalizeSignal('metrics')).toBe('metrics')
  })

  it('normalizes logs to logs', () => {
    expect(normalizeSignal('logs')).toBe('logs')
  })

  it('returns traces for unknown signals', () => {
    expect(normalizeSignal('custom')).toBe('traces')
  })
})

describe('deriveCollectorState', () => {
  it('returns Running for Running phase with ready containers', () => {
    expect(deriveCollectorState({ name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }] } })).toBe('Running')
  })

  it('returns Degraded for Running phase with unready containers', () => {
    expect(deriveCollectorState({ name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: false }] } })).toBe('Degraded')
  })

  it('returns Failed for non-Running phase', () => {
    expect(deriveCollectorState({ name: 'p', status: { phase: 'Failed' } })).toBe('Failed')
  })
})

describe('parseVersion', () => {
  it('extracts version from image tag', () => {
    expect(parseVersion({ name: 'p', status: { containerStatuses: [{ image: 'otel/opentelemetry-collector:0.90.0' }] } })).toBe('0.90.0')
  })

  it('returns empty string for no containers', () => {
    expect(parseVersion({ name: 'p', status: { containerStatuses: [] } })).toBe('')
  })
})

describe('buildStatus', () => {
  it('returns not-installed for empty collectors', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.collectors).toEqual([])
  })
})

describe('summarize', () => {
  it('aggregates collector stats', () => {
    const collectors = [{
      name: 'test',
      namespace: 'default',
      cluster: 'c1',
      state: 'Running' as const,
      version: '0.90.0',
      mode: 'deployment',
      pipelines: [],
      spansAccepted: 10,
      spansDropped: 1,
      metricsAccepted: 20,
      metricsDropped: 2,
      logsAccepted: 30,
      logsDropped: 3,
      exportErrors: 0,
    }]
    const result = summarize(collectors)
    expect(result.totalCollectors).toBe(1)
    expect(result.runningCollectors).toBe(1)
    expect(result.totalSpansAccepted).toBe(10)
    expect(result.totalMetricsAccepted).toBe(20)
    expect(result.totalLogsAccepted).toBe(30)
  })
})
