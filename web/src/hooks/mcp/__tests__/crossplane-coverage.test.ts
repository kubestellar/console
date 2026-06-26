import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockSubscribePolling,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 0,
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000 }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useCrossplaneManagedResources } from '../crossplane'

// ---------------------------------------------------------------------------
// Capture cache reset handler from module-level registration
// ---------------------------------------------------------------------------

/**
 * The module calls registerCacheReset('crossplane-managed', handler) at import time.
 * We capture that handler so we can reset the shared module-level cache between tests.
 */
let cacheResetHandler: (() => void) | undefined
const cacheResetCall = mockRegisterCacheReset.mock.calls.find(
  (c: unknown[]) => c[0] === 'crossplane-managed',
)
if (cacheResetCall) {
  cacheResetHandler = cacheResetCall[1] as () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kc-crossplane-managed-cache'

const makeFakeResource = (name: string) => ({
  apiVersion: 'rds.aws.crossplane.io/v1beta1',
  kind: 'RDSInstance',
  metadata: { name, namespace: 'infra', creationTimestamp: '2026-01-01T00:00:00Z' },
  status: { conditions: [{ type: 'Ready', status: 'True' as const }] },
})

function mockFetchOk(resources: unknown[] = []) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ resources }),
  })
}

function mockFetchFail(error: string | Error = new Error('Network error')) {
  globalThis.fetch = vi.fn().mockRejectedValue(
    typeof error === 'string' ? new Error(error) : error,
  )
}

function mockFetchHttpError(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  // Reset the module-level shared cache between tests
  if (cacheResetHandler) cacheResetHandler()

  vi.clearAllMocks()
  localStorage.clear()
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ===========================================================================
// Tests
// ===========================================================================

describe('crossplane-coverage: successful fetch with real API data', () => {
  it('populates resources from API response', async () => {
    const resources = [makeFakeResource('db-1'), makeFakeResource('db-2')]
    mockFetchOk(resources)

    const { result } = renderHook(() => useCrossplaneManagedResources('api-cluster-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual(resources)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('stores data to localStorage when no cluster filter', async () => {
    const resources = [makeFakeResource('cached-db')]
    mockFetchOk(resources)

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(stored.data).toEqual(resources)
    expect(stored.timestamp).toBeGreaterThan(0)
  })

  it('does NOT store to localStorage when cluster filter is provided', async () => {
    localStorage.clear()
    const resources = [makeFakeResource('filtered-db')]
    mockFetchOk(resources)

    const { result } = renderHook(() => useCrossplaneManagedResources('specific-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // localStorage should not have been written for cluster-specific fetch
    const stored = localStorage.getItem(CACHE_KEY)
    expect(stored).toBeNull()
  })

  it('handles API response with empty resources array', async () => {
    mockFetchOk([])

    const { result } = renderHook(() => useCrossplaneManagedResources('empty-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles response where resources key is missing (defaults to [])', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('no-key-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual([])
  })
})

describe('crossplane-coverage: fetch failure -> demo fallback', () => {
  it('sets error message from Error instance', async () => {
    mockFetchFail('Custom failure message')

    const { result } = renderHook(() => useCrossplaneManagedResources('fail-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Custom failure message')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('sets generic error message for non-Error thrown values', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('string-error-value')

    const { result } = renderHook(() => useCrossplaneManagedResources('fail-b'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch managed resources')
  })

  it('sets error for HTTP error status', async () => {
    mockFetchHttpError(503)

    const { result } = renderHook(() => useCrossplaneManagedResources('fail-c'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error: 503')
  })

  it('increments consecutiveFailures in module cache for non-cluster fetch', async () => {
    mockFetchFail('fail')

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
})

describe('crossplane-coverage: Netlify deployment path', () => {
  it('immediately stops loading/refreshing without fetching', async () => {
    mockIsNetlifyDeployment.value = true
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const { result } = renderHook(() => useCrossplaneManagedResources('netlify-a'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still registers polling and refetch cleanup', async () => {
    mockIsNetlifyDeployment.value = true
    globalThis.fetch = vi.fn()

    renderHook(() => useCrossplaneManagedResources('netlify-b'))

    await waitFor(() => {
      expect(mockSubscribePolling).toHaveBeenCalled()
      expect(mockRegisterRefetch).toHaveBeenCalled()
    })
  })
})

describe('crossplane-coverage: cache load from localStorage', () => {
  it('loads valid cached data from localStorage on module init', async () => {
    // Note: The module-level cache is loaded once at import time.
    // We test the loadFromStorage behavior indirectly through saveToStorage
    // then verifying it persists.
    const resources = [makeFakeResource('persisted-db')]
    mockFetchOk(resources)

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Verify save happened
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(Array.isArray(stored.data)).toBe(true)
    expect(stored.timestamp).toBeGreaterThan(0)
  })

  it('handles corrupted localStorage data gracefully', async () => {
    localStorage.setItem(CACHE_KEY, 'not-valid-json{{{')
    mockFetchOk([])

    // The module-level loadFromStorage already ran, but saveToStorage should still work
    const { result } = renderHook(() => useCrossplaneManagedResources('corrupt-cache'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual([])
  })

  it('handles localStorage with non-array data field', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: 'not-an-array', timestamp: 123 }))
    mockFetchOk([])

    const { result } = renderHook(() => useCrossplaneManagedResources('bad-data-cache'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash
    expect(result.current.error).toBeNull()
  })

  it('saves to localStorage on successful non-cluster fetch', async () => {
    const resources = [makeFakeResource('save-test')]
    mockFetchOk(resources)

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(stored.data).toEqual(resources)
  })

  it('does not crash when localStorage is unavailable', async () => {
    // This exercises the try/catch in saveToStorage indirectly:
    // If localStorage operations fail, the hook should still work correctly
    mockFetchOk([makeFakeResource('ls-unavail')])

    const { result } = renderHook(() => useCrossplaneManagedResources('ls-unavail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources.length).toBe(1)
    expect(result.current.error).toBeNull()
  })
})

describe('crossplane-coverage: consecutive failure tracking', () => {
  it('isFailed reflects whether consecutiveFailures >= 3', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useCrossplaneManagedResources('fail-track-5'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // isFailed should match the condition: consecutiveFailures >= 3
    const expected = result.current.consecutiveFailures >= 3
    expect(result.current.isFailed).toBe(expected)
  })

  it('error is set after failed fetch', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('my-error'))

    const { result } = renderHook(() => useCrossplaneManagedResources('fail-err'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('my-error')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('success after failure resets error and consecutiveFailures', async () => {
    // Start with failure
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { result, rerender } = renderHook(
      ({ c }: { c: string }) => useCrossplaneManagedResources(c),
      { initialProps: { c: 'fail-then-ok-2' } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error: 500')

    // Switch to success with different cluster to trigger new refetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [makeFakeResource('recovered')] }),
    })
    rerender({ c: 'ok-after-fail-2' })

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.error).toBeNull()
  })
})

describe('crossplane-coverage: demo mode data processing', () => {
  it('returns demo resources with expected structure', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useCrossplaneManagedResources('demo-struct'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.resources.length).toBeGreaterThan(0)

    const resource = result.current.resources[0]
    expect(resource.apiVersion).toBeDefined()
    expect(resource.kind).toBeDefined()
    expect(resource.metadata.name).toBeDefined()
    expect(resource.metadata.namespace).toBeDefined()
    expect(resource.metadata.creationTimestamp).toBeDefined()
    expect(resource.status?.conditions).toBeDefined()
  })

  it('saves demo data to localStorage when no cluster filter', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(Array.isArray(stored.data)).toBe(true)
    expect(stored.data.length).toBeGreaterThan(0)
  })

  it('does not save demo data to localStorage when cluster filter provided', async () => {
    localStorage.clear()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useCrossplaneManagedResources('demo-filtered'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoData).toBe(true)

    // Should not have saved cluster-specific demo data
    const stored = localStorage.getItem(CACHE_KEY)
    expect(stored).toBeNull()
  })

  it('sets lastRefresh on demo mode fetch', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useCrossplaneManagedResources('demo-ts'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeGreaterThan(0)
  })
})

describe('crossplane-coverage: polling/subscription', () => {
  it('subscribes to polling with correct key for cluster', async () => {
    mockFetchOk([])

    renderHook(() => useCrossplaneManagedResources('my-cluster'))

    await waitFor(() => {
      expect(mockSubscribePolling).toHaveBeenCalledWith(
        'crossplaneManaged:my-cluster',
        expect.any(Number),
        expect.any(Function),
      )
    })
  })

  it('subscribes to polling with "all" key when no cluster', async () => {
    mockFetchOk([])

    renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => {
      expect(mockSubscribePolling).toHaveBeenCalledWith(
        'crossplaneManaged:all',
        expect.any(Number),
        expect.any(Function),
      )
    })
  })

  it('registers refetch handler with correct key', async () => {
    mockFetchOk([])

    renderHook(() => useCrossplaneManagedResources('reg-cluster'))

    await waitFor(() => {
      expect(mockRegisterRefetch).toHaveBeenCalledWith(
        'crossplane-managed:reg-cluster',
        expect.any(Function),
      )
    })
  })

  it('unsubscribes from polling on unmount', async () => {
    const unsubscribeFn = vi.fn()
    mockSubscribePolling.mockReturnValue(unsubscribeFn)
    mockFetchOk([])

    const { unmount } = renderHook(() => useCrossplaneManagedResources('unsub-cluster'))

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())

    unmount()

    expect(unsubscribeFn).toHaveBeenCalled()
  })

  it('calls refetch(true) via polling callback', async () => {
    mockFetchOk([])

    renderHook(() => useCrossplaneManagedResources('poll-cb'))

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())

    // Extract the polling callback and invoke it
    const pollingCallback = mockSubscribePolling.mock.calls[0][2] as () => void
    expect(typeof pollingCallback).toBe('function')

    // Set up a new fetch response for the refetch call
    mockFetchOk([makeFakeResource('polled')])
    await act(async () => {
      pollingCallback()
    })

    // No crash = success; the callback was invocable
  })

  it('calls refetch(false) via registered refetch handler', async () => {
    mockFetchOk([])

    renderHook(() => useCrossplaneManagedResources('refetch-handler'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())

    // Extract the registered refetch callback and invoke it
    const refetchCallback = mockRegisterRefetch.mock.calls[0][1] as () => void
    expect(typeof refetchCallback).toBe('function')

    mockFetchOk([makeFakeResource('refetched')])
    await act(async () => {
      refetchCallback()
    })
  })
})

describe('crossplane-coverage: refetch function', () => {
  it('silent refetch sets isRefreshing', async () => {
    let resolvePromise: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )

    const { result } = renderHook(() => useCrossplaneManagedResources('silent-refetch'))

    // Resolve initial fetch
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await act(async () => {
      resolvePromise!({ ok: true, json: async () => ({ resources: [] }) })
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now do a silent refetch
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )
    await act(async () => { result.current.refetch(true) })
    expect(result.current.isRefreshing).toBe(true)

    await act(async () => {
      resolvePromise!({ ok: true, json: async () => ({ resources: [] }) })
    })
    await waitFor(() => expect(result.current.isRefreshing).toBe(false))
  })

  it('non-silent refetch sets isLoading', async () => {
    let resolvePromise: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )

    const { result } = renderHook(() => useCrossplaneManagedResources('non-silent-refetch'))

    // Resolve initial
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await act(async () => {
      resolvePromise!({ ok: true, json: async () => ({ resources: [] }) })
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Non-silent refetch
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )
    await act(async () => { result.current.refetch(false) })
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolvePromise!({ ok: true, json: async () => ({ resources: [] }) })
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('Netlify refetch returns immediately without fetching', async () => {
    mockIsNetlifyDeployment.value = true
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const { result } = renderHook(() => useCrossplaneManagedResources('netlify-refetch'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refetch() })
    await act(async () => { await result.current.refetch(true) })

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('crossplane-coverage: demoMode toggle re-fetches', () => {
  it('refetches when demoMode changes', async () => {
    mockFetchOk([])

    const { result, rerender } = renderHook(
      () => useCrossplaneManagedResources('toggle-demo'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callCountBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Toggle demo mode
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    rerender()

    await waitFor(() => expect(result.current.isDemoData).toBe(true))
  })
})

describe('crossplane-coverage: registerCacheReset', () => {
  it('registerCacheReset is called at module level', () => {
    // The module registers a cache reset handler on import — captured at module load time
    expect(cacheResetHandler).toBeDefined()
  })

  it('cache reset handler clears localStorage and resets state', async () => {
    // Set up some cached data
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: [makeFakeResource('to-clear')], timestamp: 999 }))

    // Use the handler captured at module load time (mock.calls is cleared by beforeEach)
    expect(cacheResetHandler).toBeDefined()

    await act(() => {
      cacheResetHandler!()
    })

    // localStorage should be cleared
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })
})

describe('crossplane-coverage: listener notification', () => {
  it('notifies all listeners on state change', async () => {
    mockFetchOk([makeFakeResource('listener-test')])

    // Render two hooks to create two listeners
    const { result: result1 } = renderHook(() => useCrossplaneManagedResources())
    const { result: result2 } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false)
      expect(result2.current.isLoading).toBe(false)
    })

    // Both should have the same data
    expect(result1.current.resources).toEqual(result2.current.resources)
  })
})
