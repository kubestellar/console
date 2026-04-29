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

import { useCachedLonghorn, __testables } from '../useCachedLonghorn'

const { normalizeVolumeState, normalizeRobustness, summarize, deriveHealth, buildStatus } = __testables

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

describe('useCachedLonghorn hook', () => {
  it('renders without error', () => {
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current).toBeDefined()
  })

  it('returns standard CachedHookResult shape', () => {
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('refetch')
  })

  it('passes correct cache key', () => {
    renderHook(() => useCachedLonghorn())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'longhorn-status' })
    )
  })

  it('suppresses isDemoFallback during loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isDemoFallback: true,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current.isDemoFallback).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('normalizeVolumeState', () => {
  it('normalizes valid states', () => {
    expect(normalizeVolumeState('attached')).toBe('attached')
    expect(normalizeVolumeState('detached')).toBe('detached')
    expect(normalizeVolumeState('attaching')).toBe('attaching')
  })

  it('returns "detached" for invalid state', () => {
    expect(normalizeVolumeState('bogus')).toBe('detached')
  })

  it('returns "detached" for undefined', () => {
    expect(normalizeVolumeState(undefined)).toBe('detached')
  })
})

describe('normalizeRobustness', () => {
  it('normalizes valid robustness values', () => {
    expect(normalizeRobustness('healthy')).toBe('healthy')
    expect(normalizeRobustness('degraded')).toBe('degraded')
    expect(normalizeRobustness('faulted')).toBe('faulted')
  })

  it('returns "unknown" for invalid value', () => {
    expect(normalizeRobustness('invalid')).toBe('unknown')
  })
})

describe('summarize', () => {
  it('returns zero counts for empty volumes and nodes', () => {
    const result = summarize([], [])
    expect(result.totalVolumes).toBe(0)
    expect(result.totalNodes).toBe(0)
    expect(result.healthyVolumes).toBe(0)
  })

  it('counts volume health states correctly', () => {
    const volumes = [
      { name: 'v1', namespace: 'default', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 1073741824, actualSizeBytes: 0, nodeAttached: 'n1', cluster: '' },
      { name: 'v2', namespace: 'default', state: 'attached' as const, robustness: 'degraded' as const, replicasDesired: 3, replicasHealthy: 1, sizeBytes: 1073741824, actualSizeBytes: 0, nodeAttached: 'n1', cluster: '' },
      { name: 'v3', namespace: 'default', state: 'detached' as const, robustness: 'faulted' as const, replicasDesired: 3, replicasHealthy: 0, sizeBytes: 1073741824, actualSizeBytes: 0, nodeAttached: '', cluster: '' },
    ]
    const result = summarize(volumes, [])
    expect(result.totalVolumes).toBe(3)
    expect(result.healthyVolumes).toBe(1)
    expect(result.degradedVolumes).toBe(1)
    expect(result.faultedVolumes).toBe(1)
  })

  it('counts node readiness correctly', () => {
    const nodes = [
      { name: 'n1', ready: true, schedulable: true, storageTotalBytes: 0, storageUsedBytes: 0, replicaCount: 0, cluster: '' },
      { name: 'n2', ready: false, schedulable: true, storageTotalBytes: 0, storageUsedBytes: 0, replicaCount: 0, cluster: '' },
    ]
    const result = summarize([], nodes)
    expect(result.totalNodes).toBe(2)
    expect(result.readyNodes).toBe(1)
  })
})

describe('deriveHealth', () => {
  it('returns not-installed for empty volumes and nodes', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when all volumes are healthy and nodes ready', () => {
    const volumes = [
      { name: 'v1', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 100, actualSizeBytes: 50, nodeAttached: 'n1', namespace: 'default', cluster: '' },
      { name: 'v2', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 100, actualSizeBytes: 50, nodeAttached: 'n1', namespace: 'default', cluster: '' },
    ]
    const nodes = [
      { name: 'n1', ready: true, schedulable: true, storageTotalBytes: 100, storageUsedBytes: 50, replicaCount: 2, cluster: '' },
    ]
    expect(deriveHealth(volumes, nodes)).toBe('healthy')
  })

  it('returns degraded when some volumes are degraded', () => {
    const volumes = [
      { name: 'v1', state: 'attached' as const, robustness: 'healthy' as const, replicasDesired: 3, replicasHealthy: 3, sizeBytes: 100, actualSizeBytes: 50, nodeAttached: 'n1', namespace: 'default', cluster: '' },
      { name: 'v2', state: 'attached' as const, robustness: 'degraded' as const, replicasDesired: 3, replicasHealthy: 1, sizeBytes: 100, actualSizeBytes: 50, nodeAttached: 'n1', namespace: 'default', cluster: '' },
    ]
    const nodes = [
      { name: 'n1', ready: true, schedulable: true, storageTotalBytes: 100, storageUsedBytes: 50, replicaCount: 2, cluster: '' },
    ]
    expect(deriveHealth(volumes, nodes)).toBe('degraded')
  })

  it('returns degraded when volumes are faulted', () => {
    const volumes = [
      { name: 'v1', state: 'attached' as const, robustness: 'faulted' as const, replicasDesired: 3, replicasHealthy: 0, sizeBytes: 100, actualSizeBytes: 50, nodeAttached: 'n1', namespace: 'default', cluster: '' },
    ]
    const nodes = [
      { name: 'n1', ready: true, schedulable: true, storageTotalBytes: 100, storageUsedBytes: 50, replicaCount: 1, cluster: '' },
    ]
    expect(deriveHealth(volumes, nodes)).toBe('degraded')
  })
})

describe('buildStatus', () => {
  it('returns not-installed for empty arrays', () => {
    const result = buildStatus([], [])
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for empty volumes and nodes', () => {
    const result = buildStatus([], [])
    expect(result.health).toBe('not-installed')
  })
})
