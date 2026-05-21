import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => mockUseCache(args),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

import { useContourStatus, __testables } from '../useContourStatus'
import { CONTOUR_DEMO_DATA } from '../demoData'
import type { ContourProxyStatus } from '../demoData'

const refetch = vi.fn(async () => {})

const validProxy: ContourProxyStatus = {
  name: 'app-proxy',
  namespace: 'default',
  cluster: 'dev',
  fqdn: 'app.example.com',
  status: 'Valid',
  conditions: [],
}

const invalidProxy: ContourProxyStatus = {
  name: 'broken-proxy',
  namespace: 'staging',
  cluster: 'dev',
  fqdn: 'broken.example.com',
  status: 'Invalid',
  conditions: ['IncompleteRule'],
}

const HEALTHY_DATA = __testables.buildContourStatus(
  [validProxy],
  { total: 2, ready: 2, notReady: 0 },
)

const DEGRADED_DATA = __testables.buildContourStatus(
  [validProxy, invalidProxy],
  { total: 3, ready: 2, notReady: 1 },
)

const NOT_INSTALLED_DATA = __testables.buildContourStatus([], { total: 0, ready: 0, notReady: 0 })

function lastLoadingStateCall() {
  const calls = mockUseCardLoadingState.mock.calls
  return calls[calls.length - 1][0] as Record<string, unknown>
}

describe('useContourStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: HEALTHY_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  it('uses services cache category for Contour status', () => {
    renderHook(() => useContourStatus())

    expect(mockUseCache).toHaveBeenCalledWith(expect.objectContaining({
      key: 'contour-status',
      category: 'services',
    }))
  })

  it('returns healthy data when all proxies are valid', () => {
    const { result } = renderHook(() => useContourStatus())

    expect(result.current.data.health).toBe('healthy')
    expect(result.current.data.summary.invalidProxies).toBe(0)
  })

  it('returns degraded data when any proxy is invalid', () => {
    mockUseCache.mockReturnValue({
      data: DEGRADED_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.data.health).toBe('degraded')
    expect(result.current.data.summary.invalidProxies).toBeGreaterThan(0)
  })

  it('returns not-installed health from cache data', () => {
    mockUseCache.mockReturnValue({
      data: NOT_INSTALLED_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.data.health).toBe('not-installed')
  })

  it('exposes isDemoData when cache reports demo fallback and not loading', () => {
    mockUseCache.mockReturnValue({
      data: CONTOUR_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: true,
      refetch,
    })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.isDemoData).toBe(true)
    expect(lastLoadingStateCall().isDemoData).toBe(true)
  })

  it('isDemoData is false during loading even when isDemoFallback is true', () => {
    mockUseCache.mockReturnValue({
      data: CONTOUR_DEMO_DATA,
      isLoading: true,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: true,
      refetch,
    })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.isDemoData).toBe(false)
    expect(lastLoadingStateCall().isDemoData).toBe(false)
  })

  it('treats not-installed as hasAnyData to avoid infinite skeleton', () => {
    mockUseCache.mockReturnValue({
      data: NOT_INSTALLED_DATA,
      isLoading: true,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    renderHook(() => useContourStatus())

    expect(lastLoadingStateCall().hasAnyData).toBe(true)
    expect(lastLoadingStateCall().isLoading).toBe(false)
  })

  it('surfaces showSkeleton from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.showSkeleton).toBe(true)
  })

  it('does not set error when fetch failed but stale healthy data remains', () => {
    mockUseCache.mockReturnValue({
      data: HEALTHY_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: true,
      consecutiveFailures: 2,
      isDemoFallback: false,
      refetch,
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.error).toBe(false)
    expect(result.current.consecutiveFailures).toBe(2)
  })

  it('sets error when fetch failed and no proxy data is available', () => {
    mockUseCache.mockReturnValue({
      data: {
        ...HEALTHY_DATA,
        health: 'healthy',
        proxies: [],
        summary: { totalProxies: 0, validProxies: 0, invalidProxies: 0 },
      },
      isLoading: false,
      isRefreshing: false,
      isFailed: true,
      consecutiveFailures: 1,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useContourStatus())

    expect(result.current.error).toBe(true)
    expect(result.current.consecutiveFailures).toBe(1)
  })
})
