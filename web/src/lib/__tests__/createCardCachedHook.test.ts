/**
 * Tests for lib/cache/createCardCachedHook.ts — hook factory for card data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createCardCachedHook } from '../cache/createCardCachedHook'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCache = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../cache/index', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

function makeUseCacheResult(overrides = {}) {
  return {
    data: { items: [] },
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function makeCardLoadingState(overrides = {}) {
  return {
    showSkeleton: false,
    showEmptyState: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(makeUseCacheResult())
  mockUseCardLoadingState.mockReturnValue(makeCardLoadingState())
})

describe('createCardCachedHook — basic result shape', () => {
  const initialData = { items: [] as string[] }
  const demoData = { items: ['demo'] }
  const fetcher = vi.fn().mockResolvedValue({ items: ['live'] })

  it('returns all expected fields', () => {
    const useHook = createCardCachedHook({
      key: 'test-hook',
      initialData,
      demoData,
      fetcher,
    })

    const { result } = renderHook(() => useHook())

    expect(result.current).toMatchObject({
      data: expect.anything(),
      isLoading: expect.any(Boolean),
      isRefreshing: expect.any(Boolean),
      isDemoData: expect.any(Boolean),
      isFailed: expect.any(Boolean),
      consecutiveFailures: expect.any(Number),
      lastRefresh: null,
      showSkeleton: expect.any(Boolean),
      showEmptyState: expect.any(Boolean),
      error: expect.any(Boolean),
      refetch: expect.any(Function),
    })
  })

  it('passes key and category to useCache', () => {
    const useHook = createCardCachedHook({
      key: 'my-card',
      category: 'services' as import('../cache/index').RefreshCategory,
      initialData,
      fetcher,
    })

    renderHook(() => useHook())

    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.key).toBe('my-card')
    expect(callArgs.category).toBe('services')
  })

  it('defaults category to default when not supplied', () => {
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    renderHook(() => useHook())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.category).toBe('default')
  })

  it('defaults persist to true', () => {
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    renderHook(() => useHook())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.persist).toBe(true)
  })

  it('honours persist: false', () => {
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher, persist: false })
    renderHook(() => useHook())
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.persist).toBe(false)
  })
})

describe('createCardCachedHook — isDemoData flag', () => {
  const initialData = { count: 0 }
  const fetcher = vi.fn()

  it('isDemoData is false while isLoading even if isDemoFallback=true', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isDemoFallback: true, isLoading: true }))
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    const { result } = renderHook(() => useHook())
    expect(result.current.isDemoData).toBe(false)
  })

  it('isDemoData is true when isDemoFallback=true and isLoading=false', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isDemoFallback: true, isLoading: false }))
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    const { result } = renderHook(() => useHook())
    expect(result.current.isDemoData).toBe(true)
  })

  it('isDemoData is false when isDemoFallback=false', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isDemoFallback: false, isLoading: false }))
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    const { result } = renderHook(() => useHook())
    expect(result.current.isDemoData).toBe(false)
  })
})

describe('createCardCachedHook — error flag', () => {
  const initialData = { items: [] as string[] }
  const fetcher = vi.fn()

  it('error=true when isFailed=true and hasAnyData=false', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isFailed: true, data: { items: [] } }))
    const useHook = createCardCachedHook({
      key: 'k',
      initialData,
      fetcher,
      hasAnyData: (d) => d.items.length > 0,
    })
    const { result } = renderHook(() => useHook())
    expect(result.current.error).toBe(true)
  })

  it('error=false when isFailed=true but hasAnyData=true (partial data)', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isFailed: true, data: { items: ['a'] } }))
    const useHook = createCardCachedHook({
      key: 'k',
      initialData,
      fetcher,
      hasAnyData: (d) => d.items.length > 0,
    })
    const { result } = renderHook(() => useHook())
    expect(result.current.error).toBe(false)
  })

  it('error=false when isFailed=false', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isFailed: false, data: { items: [] } }))
    const useHook = createCardCachedHook({
      key: 'k',
      initialData,
      fetcher,
      hasAnyData: (d) => d.items.length > 0,
    })
    const { result } = renderHook(() => useHook())
    expect(result.current.error).toBe(false)
  })
})

describe('createCardCachedHook — getDemoData factory', () => {
  it('calls getDemoData on each render instead of using static demoData', () => {
    const getDemoData = vi.fn().mockReturnValue({ count: 42 })
    const fetcher = vi.fn()
    const initialData = { count: 0 }

    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher, getDemoData })
    renderHook(() => useHook())

    expect(getDemoData).toHaveBeenCalled()
    const callArgs = mockUseCache.mock.calls[0][0]
    expect(callArgs.demoData).toEqual({ count: 42 })
  })
})

describe('createCardCachedHook — showSkeleton / showEmptyState from useCardLoadingState', () => {
  const initialData = { x: 0 }
  const fetcher = vi.fn()

  it('forwards showSkeleton=true from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue(makeCardLoadingState({ showSkeleton: true }))
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    const { result } = renderHook(() => useHook())
    expect(result.current.showSkeleton).toBe(true)
  })

  it('forwards showEmptyState=true from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue(makeCardLoadingState({ showEmptyState: true }))
    const useHook = createCardCachedHook({ key: 'k', initialData, fetcher })
    const { result } = renderHook(() => useHook())
    expect(result.current.showEmptyState).toBe(true)
  })

  it('passes isLoading:false to useCardLoadingState when hasAnyData=true even if cache isLoading', () => {
    mockUseCache.mockReturnValue(makeUseCacheResult({ isLoading: true, data: { x: 1 } }))
    const useHook = createCardCachedHook({
      key: 'k',
      initialData,
      fetcher,
      hasAnyData: () => true,
    })
    renderHook(() => useHook())
    const loadingArg = mockUseCardLoadingState.mock.calls[0][0]
    // isLoading && !hasAnyData = true && !true = false
    expect(loadingArg.isLoading).toBe(false)
  })
})
