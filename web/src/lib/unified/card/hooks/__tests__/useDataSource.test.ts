import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  registerDataHook,
  getDataHook,
  getRegisteredDataHooks,
  subscribeRegistryChange,
  getRegistryVersion,
  useDataHookRegistryVersion,
} from '../useDataSource'
import useDataSource from '../useDataSource'

/**
 * Tests for useDataSource pure functions and registry logic.
 *
 * The React hooks (useDataSource, useDataHookRegistryVersion) are not tested
 * here because they require renderHook from @testing-library/react-hooks.
 * This file focuses on the non-hook exports: registry operations, listener
 * management, and version tracking.
 */

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

vi.mock('../../../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('registerDataHook', () => {
  it('registers a hook that can be retrieved by name', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [{ id: 1 }],
      isLoading: false,
      error: null,
    })

    registerDataHook('testHook1', mockHook)
    expect(getDataHook('testHook1')).toBe(mockHook)
  })

  it('overwrites a previously registered hook with the same name', () => {
    const hookA = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    const hookB = vi.fn().mockReturnValue({ data: [1], isLoading: false, error: null })

    registerDataHook('overwriteHook', hookA)
    registerDataHook('overwriteHook', hookB)

    expect(getDataHook('overwriteHook')).toBe(hookB)
  })

  it('increments the registry version on each registration', () => {
    const before = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })

    registerDataHook('versionTestHook', mockHook)
    expect(getRegistryVersion()).toBe(before + 1)
  })

  it('notifies all listeners when a hook is registered', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    subscribeRegistryChange(listenerA)
    subscribeRegistryChange(listenerB)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('listenerNotifyHook', mockHook)

    expect(listenerA).toHaveBeenCalled()
    expect(listenerB).toHaveBeenCalled()

    // Clean up subscriptions
    subscribeRegistryChange(listenerA)
    subscribeRegistryChange(listenerB)
  })
})

// ---------------------------------------------------------------------------
// getDataHook
// ---------------------------------------------------------------------------

describe('getDataHook', () => {
  it('returns undefined for an unregistered hook name', () => {
    expect(getDataHook('nonExistentHook_xyz_99')).toBeUndefined()
  })

  it('returns the correct hook after multiple registrations', () => {
    const hooks = Array.from({ length: 3 }, (_, i) => {
      const fn = vi.fn().mockReturnValue({ data: [i], isLoading: false, error: null })
      registerDataHook(`multi_${i}`, fn)
      return fn
    })

    hooks.forEach((fn, i) => {
      expect(getDataHook(`multi_${i}`)).toBe(fn)
    })
  })
})

// ---------------------------------------------------------------------------
// getRegisteredDataHooks
// ---------------------------------------------------------------------------

describe('getRegisteredDataHooks', () => {
  it('returns an array of registered hook names', () => {
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('registeredListHook', mockHook)

    const names = getRegisteredDataHooks()
    expect(names).toContain('registeredListHook')
  })

  it('returns all hooks including previously registered ones', () => {
    const names = getRegisteredDataHooks()
    // We registered several hooks in earlier tests; ensure the list is non-empty
    expect(names.length).toBeGreaterThan(0)
    expect(Array.isArray(names)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// subscribeRegistryChange
// ---------------------------------------------------------------------------

describe('subscribeRegistryChange', () => {
  it('returns an unsubscribe function', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRegistryChange(listener)

    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('stops notifying after unsubscribe is called', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRegistryChange(listener)

    // Unsubscribe immediately
    unsubscribe()

    // Register a new hook -- listener should NOT be called
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('afterUnsubHook', mockHook)

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not throw when the same listener is subscribed twice', () => {
    const listener = vi.fn()

    // Sets deduplicate, so subscribing twice should just keep one reference
    const unsub1 = subscribeRegistryChange(listener)
    const unsub2 = subscribeRegistryChange(listener)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('doubleSubHook', mockHook)

    // Since it's a Set, the listener is only called once
    expect(listener).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('handles listeners that throw without corrupting the registry', () => {
    const throwingListener = vi.fn(() => {
      throw new Error('listener error')
    })

    const unsubThrow = subscribeRegistryChange(throwingListener)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })

    // The forEach will propagate the error. The important thing is the hook
    // is still registered in the registry despite the listener throwing.
    try {
      registerDataHook('throwListenerHook', mockHook)
    } catch {
      // Expected since forEach propagates
    }

    // Clean up the throwing listener BEFORE any later test triggers it
    unsubThrow()

    // The hook should still be registered regardless
    expect(getDataHook('throwListenerHook')).toBe(mockHook)
  })
})

// ---------------------------------------------------------------------------
// getRegistryVersion
// ---------------------------------------------------------------------------

describe('getRegistryVersion', () => {
  it('returns a number', () => {
    expect(typeof getRegistryVersion()).toBe('number')
  })

  it('monotonically increases with each registration', () => {
    const v1 = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('monoIncHook1', mockHook)
    const v2 = getRegistryVersion()
    registerDataHook('monoIncHook2', mockHook)
    const v3 = getRegistryVersion()

    expect(v2).toBeGreaterThan(v1)
    expect(v3).toBeGreaterThan(v2)
  })

  it('increments by exactly 1 per registration', () => {
    const before = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('exactIncHook', mockHook)
    expect(getRegistryVersion()).toBe(before + 1)
  })
})

// ---------------------------------------------------------------------------
// useDataHookRegistryVersion — React hook
// ---------------------------------------------------------------------------

describe('useDataHookRegistryVersion', () => {
  it('returns the current registry version', () => {
    const currentVersion = getRegistryVersion()
    const { result } = renderHook(() => useDataHookRegistryVersion())
    expect(result.current).toBe(currentVersion)
  })

  it('updates when a new hook is registered', () => {
    const { result } = renderHook(() => useDataHookRegistryVersion())
    const versionBefore = result.current

    act(() => {
      const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
      registerDataHook('versionUpdateHook', mockHook)
    })

    expect(result.current).toBe(versionBefore + 1)
  })
})

// ---------------------------------------------------------------------------
// useDataSource — hook type
// ---------------------------------------------------------------------------

describe('useDataSource — hook type', () => {
  it('returns loading result when hook is not yet registered', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'nonExistentHook_xyz_abc' })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns data from a registered hook', () => {
    const testData = [{ id: 1, name: 'test' }]
    const mockHook = vi.fn().mockReturnValue({
      data: testData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    registerDataHook('useRegisteredTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useRegisteredTest' })
    )

    expect(result.current.data).toEqual(testData)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('passes params to the registered hook', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    registerDataHook('useParamsTest', mockHook)

    const params = { namespace: 'kube-system', limit: 100 }
    renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useParamsTest', params })
    )

    expect(mockHook).toHaveBeenCalledWith(params)
  })

  it('provides a no-op refetch when hook does not return refetch', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [1],
      isLoading: false,
      error: null,
      // no refetch property
    })
    registerDataHook('useNoRefetchTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useNoRefetchTest' })
    )

    expect(typeof result.current.refetch).toBe('function')
    // Should not throw
    result.current.refetch()
  })

  // Issues 9356 and 9357: hooks that report demo-fallback state must
  // propagate that through useDataSource so UnifiedCard can show the Demo
  // badge only for actual demo output.
  it('propagates isDemoData: true from hook return value', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [{ id: 'demo' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: true,
    })
    registerDataHook('useDemoDataTrueTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useDemoDataTrueTest' })
    )

    expect(result.current.isDemoData).toBe(true)
  })

  it('propagates isDemoData: false from hook return value', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [{ id: 'live' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isDemoData: false,
    })
    registerDataHook('useDemoDataFalseTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useDemoDataFalseTest' })
    )

    expect(result.current.isDemoData).toBe(false)
  })

  it('returns isDemoData: undefined when hook does not report it', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [{ id: 1 }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      // no isDemoData property - hook doesn't know its demo status
    })
    registerDataHook('useNoDemoDataTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useNoDemoDataTest' })
    )

    // When undefined, UnifiedCard falls back to the card config's isDemoData.
    expect(result.current.isDemoData).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// useDataSource — static type
// ---------------------------------------------------------------------------

describe('useDataSource — static type', () => {
  it('returns static data immediately with no loading', () => {
    const staticData = [{ id: 1 }, { id: 2 }]
    const { result } = renderHook(() =>
      useDataSource({ type: 'static', data: staticData })
    )

    expect(result.current.data).toEqual(staticData)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns EMPTY_RESULT when static data is undefined (optional data)', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'static' })
    )

    // data is undefined → config.data ?? null → null → EMPTY_RESULT
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useDataSource — context type
// ---------------------------------------------------------------------------

describe('useDataSource — context type', () => {
  it('returns error for context data source (not yet implemented)', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'context', contextKey: 'myContext' })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Context data source not yet implemented')
    expect(result.current.error?.message).toContain('myContext')
  })
})

// ---------------------------------------------------------------------------
// useDataSource — skip option
// ---------------------------------------------------------------------------

describe('useDataSource — skip option', () => {
  it('returns EMPTY_RESULT when skip is true for hook type', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [1, 2, 3],
      isLoading: false,
      error: null,
    })
    registerDataHook('useSkipTest', mockHook)

    const { result } = renderHook(() =>
      useDataSource({ type: 'hook', hook: 'useSkipTest' }, { skip: true })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns EMPTY_RESULT when skip is true for static type', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'static', data: [1, 2] }, { skip: true })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('returns EMPTY_RESULT when skip is true for api type', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/test' }, { skip: true })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns EMPTY_RESULT when skip is true for context type', () => {
    const { result } = renderHook(() =>
      useDataSource({ type: 'context', contextKey: 'key' }, { skip: true })
    )

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useDataSource — api type
// ---------------------------------------------------------------------------

describe('useDataSource — api type', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches data from endpoint and returns array response', async () => {
    const responseData = [{ id: 1 }, { id: 2 }]
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseData),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/items' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(responseData)
    expect(result.current.error).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('extracts data property from non-array JSON response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ id: 10 }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/wrapped' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual([{ id: 10 }])
  })

  it('extracts items property from non-array JSON response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items: [{ id: 20 }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/items-wrapped' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual([{ id: 20 }])
  })

  it('sets error on non-ok API response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/fail' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('500')
  })

  it('sets error when .json() returns null (invalid JSON)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(null),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/bad-json' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Invalid JSON')
  })

  it('sets error when fetch throws (network error)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/network-fail' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Failed to fetch')
  })

  it('appends query params to URL for GET requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderHook(() =>
      useDataSource({
        type: 'api',
        endpoint: '/api/search',
        method: 'GET',
        params: { q: 'test', limit: 10 },
      })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/search?')
    expect(calledUrl).toContain('q=test')
    expect(calledUrl).toContain('limit=10')
  })

  it('sends JSON body for POST requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    const params = { query: 'test' }
    renderHook(() =>
      useDataSource({
        type: 'api',
        endpoint: '/api/query',
        method: 'POST',
        params,
      })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const fetchCall = mockFetch.mock.calls[0]
    expect(fetchCall[0]).toBe('/api/query')
    expect(fetchCall[1].method).toBe('POST')
    expect(fetchCall[1].headers).toEqual({ 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' })
    expect(fetchCall[1].body).toBe(JSON.stringify(params))
  })

  it('skips undefined and null values in GET query params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderHook(() =>
      useDataSource({
        type: 'api',
        endpoint: '/api/filter',
        method: 'GET',
        params: { active: 'true', deleted: undefined, archived: null },
      })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('active=true')
    expect(calledUrl).not.toContain('deleted')
    expect(calledUrl).not.toContain('archived')
  })

  it('polls at the specified interval', async () => {
    vi.useFakeTimers()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ id: 1 }]),
    })
    vi.stubGlobal('fetch', mockFetch)

    const POLL_INTERVAL_MS = 5_000
    renderHook(() =>
      useDataSource({
        type: 'api',
        endpoint: '/api/poll',
        pollInterval: POLL_INTERVAL_MS,
      })
    )

    // Wait for the initial fetch to complete (triggered by useEffect)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    const initialCallCount = mockFetch.mock.calls.length
    expect(initialCallCount).toBeGreaterThanOrEqual(1)

    // Advance by poll interval — should trigger at least one more fetch
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount)

    vi.useRealTimers()
  })

  it('does not poll when pollInterval is 0 or negative', async () => {
    vi.useFakeTimers()

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderHook(() =>
      useDataSource({
        type: 'api',
        endpoint: '/api/no-poll',
        pollInterval: 0,
      })
    )

    // Initial fetch
    await act(async () => { await vi.runAllTimersAsync() })
    const callCount = mockFetch.mock.calls.length

    // Advance significant time — no additional polls
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(mockFetch.mock.calls.length).toBe(callCount)

    vi.useRealTimers()
  })

  it('wraps non-Error thrown values in an Error', async () => {
    const mockFetch = vi.fn().mockRejectedValue('string error')
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/string-err' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('string error')
  })

  it('returns empty array when response is object without data or items', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 5, total: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useDataSource({ type: 'api', endpoint: '/api/no-data-key' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // json.data is undefined, json.items is undefined → fallback to []
    expect(result.current.data).toEqual([])
  })
})
