/**
 * useLimaStatus tests — createCachedHook factory pattern.
 *
 * Unlike Contour/Flux (manual useCache + __testables), Lima uses createCachedHook.
 * Mock createCachedHook (not useCache alone) so the factory-created useCachedLima
 * hook returns controlled cache results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockUseCache, mockUseCardLoadingState } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockUseCardLoadingState: vi.fn(),
}))

vi.mock('../../../../lib/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/cache')>()
  return {
    ...actual,
    useCache: (config: Record<string, unknown>) => mockUseCache(config),
    createCachedHook: (config: Record<string, unknown>) => {
      return () => {
        const result = mockUseCache(config)
        return {
          data: result.data,
          isLoading: result.isLoading,
          isRefreshing: result.isRefreshing,
          // Return isDemoFallback raw — let useLimaStatus enforce the
          // `&& !isLoading` gate via effectiveIsDemoData, so that guard
          // is actually exercised by the tests rather than duplicated here.
          isDemoFallback: result.isDemoFallback,
          error: result.error,
          isFailed: result.isFailed,
          consecutiveFailures: result.consecutiveFailures,
          lastRefresh: result.lastRefresh,
          refetch: result.refetch,
          retryFetch: result.retryFetch,
        }
      }
    },
  }
})

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

import { useLimaStatus, buildLimaStatus, toDemoStatus } from '../useLimaStatus'
import { LIMA_DEMO_DATA, type LimaInstance } from '../demoData'

const refetch = vi.fn(async () => {})

const BASE_INSTANCE: LimaInstance = {
  name: 'lima-k3s',
  status: 'running',
  cpuCores: 4,
  memoryGB: 8,
  diskGB: 60,
  arch: 'x86_64',
  os: 'Ubuntu 22.04 LTS',
  limaVersion: '0.18.0',
  lastSeen: new Date().toISOString(),
}

const STOPPED_INSTANCE: LimaInstance = {
  ...BASE_INSTANCE,
  name: 'lima-test',
  status: 'stopped',
}

const HEALTHY_DATA = buildLimaStatus([BASE_INSTANCE, { ...BASE_INSTANCE, name: 'lima-default' }])
const DEGRADED_DATA = buildLimaStatus([BASE_INSTANCE, STOPPED_INSTANCE])
const NOT_DETECTED_DATA = buildLimaStatus([])
const DEMO_DATA = toDemoStatus(LIMA_DEMO_DATA)

function setupCacheReturn(overrides: Record<string, unknown>) {
  mockUseCache.mockReturnValue({
    data: HEALTHY_DATA,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    error: null,
    lastRefresh: null,
    refetch,
    retryFetch: vi.fn(),
    ...overrides,
  })
}

function lastLoadingStateCall() {
  const calls = mockUseCardLoadingState.mock.calls
  return calls[calls.length - 1][0] as Record<string, unknown>
}

describe('useLimaStatus (createCachedHook factory)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupCacheReturn({})
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  it('uses lima-status cache key through the createCachedHook factory', () => {
    renderHook(() => useLimaStatus())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'lima-status' }),
    )
  })

  it('returns healthy data when all VMs are running', () => {
    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.data.health).toBe('healthy')
    expect(result.current.data.runningNodes).toBe(2)
    expect(result.current.data.stoppedNodes).toBe(0)
  })

  it('returns degraded data when a VM is stopped', () => {
    setupCacheReturn({ data: DEGRADED_DATA })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.data.health).toBe('degraded')
    expect(result.current.data.stoppedNodes).toBe(1)
  })

  it('returns not-detected when no Lima instances exist', () => {
    setupCacheReturn({ data: NOT_DETECTED_DATA })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.data.health).toBe('not-detected')
    expect(result.current.data.totalNodes).toBe(0)
  })

  it('exposes isDemoData when cache reports demo fallback and not loading', () => {
    setupCacheReturn({
      data: DEMO_DATA,
      isDemoFallback: true,
    })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.isDemoData).toBe(true)
    expect(lastLoadingStateCall().isDemoData).toBe(true)
  })

  it('isDemoData is false during loading even when isDemoFallback is true', () => {
    setupCacheReturn({
      data: DEMO_DATA,
      isLoading: true,
      isDemoFallback: true,
    })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.isDemoData).toBe(false)
    expect(lastLoadingStateCall().isDemoData).toBe(false)
  })

  it('surfaces showSkeleton from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.showSkeleton).toBe(true)
  })

  it('sets error when fetch failed and no VM data is available', () => {
    setupCacheReturn({
      data: NOT_DETECTED_DATA,
      isFailed: true,
      consecutiveFailures: 2,
    })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.error).toBe(true)
    expect(result.current.consecutiveFailures).toBe(2)
  })

  it('does not set error when fetch failed but stale VM data remains', () => {
    setupCacheReturn({
      data: HEALTHY_DATA,
      isFailed: true,
      consecutiveFailures: 1,
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })

    const { result } = renderHook(() => useLimaStatus())

    expect(result.current.error).toBe(false)
    expect(result.current.consecutiveFailures).toBe(1)
  })
})
