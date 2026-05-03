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

import { useCachedDragonfly, __testables } from '../useCachedDragonfly'

const { classifyDragonflyPod, podIsReady, parseVersion, buildStatus } = __testables

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

describe('useCachedDragonfly hook', () => {
  it('renders without error', () => {
    const { result } = renderHook(() => useCachedDragonfly())
    expect(result.current).toBeDefined()
  })

  it('returns standard CachedHookResult shape', () => {
    const { result } = renderHook(() => useCachedDragonfly())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('refetch')
  })

  it('passes correct cache key', () => {
    renderHook(() => useCachedDragonfly())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'dragonfly-status' })
    )
  })

  it('suppresses isDemoFallback during loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isDemoFallback: true,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedDragonfly())
    expect(result.current.isDemoFallback).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pure function tests (supplement the -funcs.test.ts)
// ---------------------------------------------------------------------------

describe('podIsReady', () => {
  it('returns true when all containers are ready and phase is Running', () => {
    expect(podIsReady({ name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: true }] } })).toBe(true)
  })

  it('returns false when any container is not ready', () => {
    expect(podIsReady({ name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: false }] } })).toBe(false)
  })

  it('returns false when no container statuses exist', () => {
    expect(podIsReady({ name: 'p' })).toBe(false)
  })
})

describe('parseVersion', () => {
  it('extracts version from image tag', () => {
    expect(parseVersion({ name: 'p', status: { containerStatuses: [{ image: 'dragonflyoss/manager:v2.1.0' }] } })).toBe('v2.1.0')
  })

  it('returns empty string for empty containers', () => {
    expect(parseVersion({ name: 'p', status: { containerStatuses: [] } })).toBe('')
  })

  it('returns empty string when no image tag', () => {
    expect(parseVersion({ name: 'p', status: { containerStatuses: [{ image: 'dragonflyoss/manager' }] } })).toBe('')
  })
})

describe('buildStatus', () => {
  it('returns not-installed for empty pods', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.components).toEqual([])
  })

  it('returns healthy when all dragonfly pods are ready', () => {
    const pods = [
      { name: 'dragonfly-manager-0', status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'dragonflyoss/manager:v2.1.0' }] } },
    ]
    const result = buildStatus(pods)
    expect(result.health).toBe('healthy')
  })

  it('returns degraded when some pods are not ready', () => {
    const pods = [
      { name: 'dragonfly-manager-0', status: { phase: 'Pending', containerStatuses: [{ ready: false, image: 'dragonflyoss/manager:v2.1.0' }] } },
    ]
    const result = buildStatus(pods)
    expect(result.health).toBe('degraded')
  })
})

describe('classifyDragonflyPod', () => {
  it('classifies manager pod by app label', () => {
    const pod = {
      name: 'dragonfly-manager-0',
      metadata: { labels: { app: 'dragonfly', 'app.kubernetes.io/component': 'manager' } },
    }
    expect(classifyDragonflyPod(pod)).toBe('manager')
  })

  it('classifies seed-peer by name pattern', () => {
    const pod = { name: 'dragonfly-seed-peer-0' }
    expect(classifyDragonflyPod(pod)).toBe('seed-peer')
  })

  it('classifies dfdaemon by name pattern', () => {
    const pod = { name: 'dragonfly-dfdaemon-abc12' }
    expect(classifyDragonflyPod(pod)).toBe('dfdaemon')
  })

  it('returns null for non-dragonfly pods', () => {
    expect(classifyDragonflyPod({ name: 'nginx-pod' })).toBeNull()
  })
})
