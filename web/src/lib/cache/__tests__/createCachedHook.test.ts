import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
}))

vi.mock('../index', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

import { createCachedHook } from '../createCachedHook'
import type { CreateCachedHookConfig } from '../createCachedHook'

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
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
  clearAndRefetch: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCacheResult)
})

// ---------------------------------------------------------------------------
// createCachedHook
// ---------------------------------------------------------------------------

describe('createCachedHook', () => {
  it('returns a function (React hook)', () => {
    const hook = createCachedHook<TestData>({
      key: 'test',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })
    expect(typeof hook).toBe('function')
  })

  it('calls useCache with the correct config', () => {
    const fetcher = vi.fn()
    const hook = createCachedHook<TestData>({
      key: 'test-key',
      category: 'pods',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      fetcher,
      persist: false,
    })

    renderHook(() => hook())

    expect(mockUseCache).toHaveBeenCalledWith({
      key: 'test-key',
      category: 'pods',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      persist: false,
      fetcher,
    })
  })

  it('defaults category to "default" and persist to true', () => {
    const fetcher = vi.fn()
    const hook = createCachedHook<TestData>({
      key: 'default-test',
      initialData: INITIAL_DATA,
      fetcher,
    })

    renderHook(() => hook())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'default',
        persist: true,
      })
    )
  })

  it('returns CachedHookResult without clearAndRefetch', () => {
    const hook = createCachedHook<TestData>({
      key: 'result-test',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })

    const { result } = renderHook(() => hook())

    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).not.toHaveProperty('clearAndRefetch')
  })

  it('sets isDemoFallback to false when isLoading is true', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isDemoFallback: true,
      isLoading: true,
    })

    const hook = createCachedHook<TestData>({
      key: 'demo-loading',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })

    const { result } = renderHook(() => hook())
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('sets isDemoFallback to true when demo is active and not loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult,
      isDemoFallback: true,
      isLoading: false,
    })

    const hook = createCachedHook<TestData>({
      key: 'demo-ready',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })

    const { result } = renderHook(() => hook())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('uses getDemoData factory when provided', () => {
    const getDemoData = vi.fn(() => ({ items: ['dynamic'], count: 42 }))
    const hook = createCachedHook<TestData>({
      key: 'dynamic-demo',
      initialData: INITIAL_DATA,
      getDemoData,
      fetcher: vi.fn(),
    })

    renderHook(() => hook())

    expect(getDemoData).toHaveBeenCalled()
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        demoData: { items: ['dynamic'], count: 42 },
      })
    )
  })

  it('prefers getDemoData over static demoData', () => {
    const getDemoData = vi.fn(() => ({ items: ['factory'], count: 99 }))
    const hook = createCachedHook<TestData>({
      key: 'prefer-factory',
      initialData: INITIAL_DATA,
      demoData: DEMO_DATA,
      getDemoData,
      fetcher: vi.fn(),
    })

    renderHook(() => hook())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        demoData: { items: ['factory'], count: 99 },
      })
    )
  })

  it('passes undefined demoData when neither demoData nor getDemoData provided', () => {
    const hook = createCachedHook<TestData>({
      key: 'no-demo',
      initialData: INITIAL_DATA,
      fetcher: vi.fn(),
    })

    renderHook(() => hook())

    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({
        demoData: undefined,
      })
    )
  })
})
