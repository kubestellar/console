/**
 * Tests for lib/cache/createCardCachedHook.ts
 *
 * Covers the factory function that wraps createCachedHook with
 * useCardLoadingState integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks (must come before any imports of the module under test)
// ---------------------------------------------------------------------------

const { mockUseCache, mockUseCardLoadingState } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockUseCardLoadingState: vi.fn(),
}))

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>()
  return {
    ...actual,
    useCache: (...args: unknown[]) => mockUseCache(...args),
  }
})

vi.mock('../../../components/cards/CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

import { createCardCachedHook } from '../createCardCachedHook'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestData {
  items: string[]
  count: number
}

const INITIAL_DATA: TestData = { items: [], count: 0 }
const DEMO_DATA: TestData = { items: ['demo'], count: 1 }

const defaultCacheResult = {
  data: INITIAL_DATA,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}

const defaultLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue({ ...defaultCacheResult })
  mockUseCardLoadingState.mockReturnValue({ ...defaultLoadingState })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCardCachedHook — basic shape', () => {
  it('returns a hook function', () => {
    const hook = createCardCachedHook<TestData>({
      key: 'test',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher: vi.fn(),
    })
    expect(typeof hook).toBe('function')
  })

  it('hook returns standard fields', () => {
    const hook = createCardCachedHook<TestData>({
      key: 'test',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher: vi.fn(),
    })
    const { result } = renderHook(() => hook())
    expect(result.current).toMatchObject({
      data: INITIAL_DATA,
      isLoading: false,
      isRefreshing: false,
      isDemoData: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      showSkeleton: false,
      showEmptyState: false,
      error: false,
    })
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('isDemoData — loading guard', () => {
  it('is false while isLoading even when isDemoFallback is true', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isLoading: true,
      isDemoFallback: true,
    })
    const hook = createCardCachedHook<TestData>({
      key: 'demo-guard',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher: vi.fn(),
    })
    const { result } = renderHook(() => hook())
    // effectiveIsDemoData = isDemoFallback && !isLoading → false
    expect(result.current.isDemoData).toBe(false)
  })

  it('is true when isDemoFallback and not loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isLoading: false,
      isDemoFallback: true,
    })
    const hook = createCardCachedHook<TestData>({
      key: 'demo-live',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher: vi.fn(),
    })
    const { result } = renderHook(() => hook())
    expect(result.current.isDemoData).toBe(true)
  })
})

describe('error field', () => {
  it('is false when not failed', () => {
    const hook = createCardCachedHook<TestData>({
      key: 'no-fail',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBe(false)
  })

  it('is true when isFailed and hasAnyData returns false', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isFailed: true,
      data: INITIAL_DATA, // empty
    })
    const hook = createCardCachedHook<TestData>({
      key: 'failed',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
      hasAnyData: (data) => data.items.length > 0,
    })
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBe(true)
  })

  it('is false when isFailed but hasAnyData returns true', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isFailed: true,
      data: DEMO_DATA, // has items
    })
    const hook = createCardCachedHook<TestData>({
      key: 'failed-with-data',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
      hasAnyData: (data) => data.items.length > 0,
    })
    const { result } = renderHook(() => hook())
    expect(result.current.error).toBe(false)
  })
})

describe('getDemoData factory option', () => {
  it('calls getDemoData on each render when provided', () => {
    const getDemoData = vi.fn(() => ({ items: ['fresh-demo'], count: 99 }))
    const hook = createCardCachedHook<TestData>({
      key: 'dynamic-demo',
      initialData: INITIAL_DATA,
      getDemoData,
      fetcher: vi.fn(),
    })
    renderHook(() => hook())
    expect(getDemoData).toHaveBeenCalled()
  })
})

describe('useCache is called with correct options', () => {
  it('passes key, category, initialData, persist, fetcher', () => {
    const fetcher = vi.fn()
    const hook = createCardCachedHook<TestData>({
      key: 'my-key',
      category: 'services',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher,
      persist: false,
    })
    renderHook(() => hook())
    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.key).toBe('my-key')
    expect(callArg.category).toBe('services')
    expect(callArg.persist).toBe(false)
    expect(callArg.fetcher).toBe(fetcher)
    expect(callArg.demoData).toEqual(DEMO_DATA)
  })

  it('defaults category to "default" and persist to true', () => {
    const hook = createCardCachedHook<TestData>({
      key: 'defaults',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })
    renderHook(() => hook())
    const callArg = mockUseCache.mock.calls[0][0]
    expect(callArg.category).toBe('default')
    expect(callArg.persist).toBe(true)
  })
})

describe('showSkeleton / showEmptyState passthrough', () => {
  it('passes showSkeleton from useCardLoadingState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    const hook = createCardCachedHook<TestData>({
      key: 'skel',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })
    const { result } = renderHook(() => hook())
    expect(result.current.showSkeleton).toBe(true)
    expect(result.current.showEmptyState).toBe(false)
  })
})
