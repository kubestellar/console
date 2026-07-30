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

import { useFluxStatus, __testables } from '../useFluxStatus'
import { FLUX_DEMO_DATA } from '../demoData'
import type { FluxResourceStatus } from '../demoData'

const refetch = vi.fn(async () => {})

const syncedSource: FluxResourceStatus = {
  kind: 'GitRepository',
  name: 'flux-system',
  namespace: 'flux-system',
  cluster: 'dev',
  ready: true,
  revision: 'main@sha1:abc',
}

const syncedKustomization: FluxResourceStatus = {
  kind: 'Kustomization',
  name: 'apps',
  namespace: 'flux-system',
  cluster: 'dev',
  ready: true,
  revision: 'main@sha1:abc',
}

const failedKustomization: FluxResourceStatus = {
  kind: 'Kustomization',
  name: 'monitoring',
  namespace: 'flux-system',
  cluster: 'dev',
  ready: false,
  reason: 'ReconciliationFailed',
}

const HEALTHY_DATA = __testables.buildFluxStatus(
  [syncedSource],
  [syncedKustomization],
  [],
)

const DEGRADED_DATA = __testables.buildFluxStatus(
  [syncedSource],
  [syncedKustomization, failedKustomization],
  [],
)

const NOT_INSTALLED_DATA = __testables.buildFluxStatus([], [], [])

function lastLoadingStateCall() {
  const calls = mockUseCardLoadingState.mock.calls
  return calls[calls.length - 1][0] as Record<string, unknown>
}

describe('useFluxStatus', () => {
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

  it('uses gitops cache category for Flux status', () => {
    renderHook(() => useFluxStatus())

    expect(mockUseCache).toHaveBeenCalledWith(expect.objectContaining({
      key: 'flux-status',
      category: 'gitops',
    }))
  })

  it('returns healthy data when all resources are ready', () => {
    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.data.health).toBe('healthy')
    expect(result.current.data.kustomizations.notReady).toBe(0)
  })

  it('returns degraded data when kustomization sync failed', () => {
    mockUseCache.mockReturnValue({
      data: DEGRADED_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.data.health).toBe('degraded')
    expect(result.current.data.kustomizations.notReady).toBe(1)
  })

  it('returns not-installed health when no Flux resources exist', () => {
    mockUseCache.mockReturnValue({
      data: NOT_INSTALLED_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.data.health).toBe('not-installed')
  })

  it('exposes isDemoData when cache reports demo fallback and not loading', () => {
    mockUseCache.mockReturnValue({
      data: FLUX_DEMO_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: true,
      refetch,
    })

    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.isDemoData).toBe(true)
    expect(lastLoadingStateCall().isDemoData).toBe(true)
  })

  it('isDemoData is false during loading even when isDemoFallback is true', () => {
    mockUseCache.mockReturnValue({
      data: FLUX_DEMO_DATA,
      isLoading: true,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: true,
      refetch,
    })

    const { result } = renderHook(() => useFluxStatus())

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

    renderHook(() => useFluxStatus())

    expect(lastLoadingStateCall().hasAnyData).toBe(true)
    expect(lastLoadingStateCall().isLoading).toBe(false)
  })

  it('surfaces showSkeleton from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.showSkeleton).toBe(true)
  })

  it('forwards consecutiveFailures from cache', () => {
    mockUseCache.mockReturnValue({
      data: HEALTHY_DATA,
      isLoading: false,
      isRefreshing: false,
      isFailed: true,
      consecutiveFailures: 3,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFluxStatus())

    expect(result.current.consecutiveFailures).toBe(3)
  })
})
