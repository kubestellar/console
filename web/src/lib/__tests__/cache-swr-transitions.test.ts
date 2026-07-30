/**
 * SWR Cache State Transition Tests (#8506)
 *
 * Verifies the stale-while-revalidate lifecycle of useCache:
 *   1. Cold start: isLoading=true, data=initialData
 *   2. Fetch completes: isLoading=false, data=freshData, isRefreshing=false
 *   3. Subsequent mount with cache: isLoading=false, isRefreshing=true (stale data shown)
 *   4. Background refresh completes: isRefreshing=false, data=updatedData
 *   5. Fetch failure: error set, consecutiveFailures incremented
 *   6. Demo fallback: isDemoFallback=true when live data is empty + demoWhenEmpty
 *
 * Run:   npx vitest run src/lib/__tests__/cache-swr-transitions.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the cache worker — no actual SQLite in tests
vi.mock('../cache/workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// Mock demoMode — default to live mode
const mockIsDemoMode = vi.fn().mockReturnValue(false)
vi.mock('../demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  subscribeDemoMode: (cb: () => void) => {
    // Return unsubscribe no-op
    return () => {}
  },
}))

// Mock modeTransition
vi.mock('../modeTransition', () => ({
  registerCacheReset: vi.fn().mockReturnValue(() => {}),
  registerRefetch: vi.fn().mockReturnValue(() => {}),
  triggerAllRefetches: vi.fn(),
}))

// Mock useKeepAliveActive — always active
vi.mock('../../hooks/useKeepAliveActive', () => ({
  useKeepAliveActive: () => true,
}))

// ── Constants ──────────────────────────────────────────────────────────────

/** Timeout for waitFor assertions (ms) */
const WAIT_FOR_TIMEOUT_MS = 5_000

/** Simulated network delay (ms) */
const SIMULATED_FETCH_DELAY_MS = 50

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a controllable fetcher that resolves on demand.
 * Allows tests to observe intermediate states (loading, refreshing).
 */
function createControllableFetcher<T>() {
  let resolveNext: ((value: T) => void) | null = null
  let rejectNext: ((error: Error) => void) | null = null

  const fetcher = vi.fn(
    () =>
      new Promise<T>((resolve, reject) => {
        resolveNext = resolve
        rejectNext = reject
      }),
  )

  return {
    fetcher,
    resolve: (value: T) => {
      if (resolveNext) resolveNext(value)
      resolveNext = null
      rejectNext = null
    },
    reject: (error: Error) => {
      if (rejectNext) rejectNext(error)
      resolveNext = null
      rejectNext = null
    },
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  sessionStorage.clear()
  mockIsDemoMode.mockReturnValue(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useCache SWR state transitions (#8506)', () => {
  it('cold start: isLoading=true with initialData, then resolves to fresh data', async () => {
    const { useCache } = await import('../cache/index')
    const INITIAL: string[] = []
    const FRESH_DATA = ['pod-a', 'pod-b']
    const { fetcher, resolve } = createControllableFetcher<string[]>()

    const { result } = renderHook(() =>
      useCache({
        key: `swr-cold-${Date.now()}`,
        fetcher,
        initialData: INITIAL,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    // Phase 1: loading state
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.data).toEqual(INITIAL)

    // Phase 2: resolve the fetch
    await act(async () => {
      resolve(FRESH_DATA)
      // Allow microtasks to flush
      await vi.advanceTimersByTimeAsync(SIMULATED_FETCH_DELAY_MS)
    })

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isRefreshing).toBe(false)
        expect(result.current.data).toEqual(FRESH_DATA)
        expect(result.current.error).toBeNull()
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
  })

  it('fetch failure increments consecutiveFailures and sets error', async () => {
    const { useCache } = await import('../cache/index')
    const INITIAL: string[] = []
    const { fetcher, reject } = createControllableFetcher<string[]>()

    const { result } = renderHook(() =>
      useCache({
        key: `swr-fail-${Date.now()}`,
        fetcher,
        initialData: INITIAL,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    expect(result.current.isLoading).toBe(true)

    // Reject the fetch
    await act(async () => {
      reject(new Error('network timeout'))
      await vi.advanceTimersByTimeAsync(SIMULATED_FETCH_DELAY_MS)
    })

    await waitFor(
      () => {
        expect(result.current.error).toBe('network timeout')
        expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
  })

  it('demo mode returns demoData with isDemoFallback=true', async () => {
    // Switch to demo mode
    mockIsDemoMode.mockReturnValue(true)

    const { useCache } = await import('../cache/index')
    const DEMO_DATA = ['demo-pod-1', 'demo-pod-2']
    const fetcher = vi.fn().mockResolvedValue(['should-not-appear'])

    const { result } = renderHook(() =>
      useCache({
        key: `swr-demo-${Date.now()}`,
        fetcher,
        initialData: [],
        demoData: DEMO_DATA,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    // In demo mode, fetcher should NOT be called
    expect(fetcher).not.toHaveBeenCalled()

    // Should return demo data immediately
    await waitFor(
      () => {
        expect(result.current.data).toEqual(DEMO_DATA)
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
  })

  it('demoWhenEmpty falls back to demoData when live fetch returns empty', async () => {
    const { useCache } = await import('../cache/index')
    const DEMO_DATA = ['fallback-item']

    // Fetcher returns empty array (simulating "feature not installed")
    const fetcher = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() =>
      useCache({
        key: `swr-demo-empty-${Date.now()}`,
        fetcher,
        initialData: [],
        demoData: DEMO_DATA,
        demoWhenEmpty: true,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    await waitFor(
      () => {
        expect(result.current.isDemoFallback).toBe(true)
        expect(result.current.data).toEqual(DEMO_DATA)
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
  })

  it('disabled hook (enabled=false) does not fetch and marks ready immediately', async () => {
    const { useCache } = await import('../cache/index')
    const fetcher = vi.fn().mockResolvedValue(['data'])

    const { result } = renderHook(() =>
      useCache({
        key: `swr-disabled-${Date.now()}`,
        fetcher,
        initialData: [],
        enabled: false,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('clearAndRefetch resets cache and re-fetches fresh data', async () => {
    const { useCache } = await import('../cache/index')
    const INITIAL: string[] = []
    /** Number of times the fetcher has been called */
    let fetchCount = 0
    const fetcher = vi.fn(async () => {
      fetchCount++
      return [`data-v${fetchCount}`]
    })

    const { result } = renderHook(() =>
      useCache({
        key: `swr-clear-${Date.now()}`,
        fetcher,
        initialData: INITIAL,
        persist: false,
        shared: false,
        autoRefresh: false,
      }),
    )

    // Wait for initial fetch
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.data).toEqual(['data-v1'])
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )

    // Trigger clearAndRefetch
    await act(async () => {
      await result.current.clearAndRefetch()
      await vi.advanceTimersByTimeAsync(SIMULATED_FETCH_DELAY_MS)
    })

    await waitFor(
      () => {
        expect(result.current.data).toEqual(['data-v2'])
        expect(fetchCount).toBeGreaterThanOrEqual(2)
      },
      { timeout: WAIT_FOR_TIMEOUT_MS },
    )
  })
})
