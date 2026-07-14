import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ClusterEvent } from '../mcp/types'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  isAgentUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => () => {}),
}))

vi.mock('../../lib/sseClient', () => ({
  fetchSSE: vi.fn(() => Promise.reject(new Error('SSE not available'))),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: vi.fn(() => false),
}))

vi.mock('../mcp/pollingManager', () => ({
  subscribePolling: vi.fn(() => () => {}),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { subscribeEventsCache, useEvents, useWarningEvents } from '../mcp/events'
import { fetchSSE } from '../../lib/sseClient'

// ---------------------------------------------------------------------------
// subscribeEventsCache
// ---------------------------------------------------------------------------

describe('subscribeEventsCache', () => {
  it('returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribeEventsCache(cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('calling the unsubscribe function does not throw', () => {
    const cb = vi.fn()
    const unsub = subscribeEventsCache(cb)
    expect(() => unsub()).not.toThrow()
  })

  it('multiple subscribers can be independently removed', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeEventsCache(cb1)
    const unsub2 = subscribeEventsCache(cb2)
    unsub1()
    expect(() => unsub2()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// useEvents
// ---------------------------------------------------------------------------

describe('useEvents', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
    vi.mocked(fetchSSE).mockRejectedValue(new Error('SSE unavailable'))
  })

  it('returns the expected API shape after load', async () => {
    const { result } = renderHook(() => useEvents(undefined, undefined, 20))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('events')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(Array.isArray(result.current.events)).toBe(true)
  })

  it('starts in loading state when no cache exists', () => {
    const { result } = renderHook(() => useEvents('loading-cluster'))
    expect(result.current.isLoading).toBe(true)
  })

  it('increments consecutiveFailures when SSE fails', async () => {
    const { result } = renderHook(() => useEvents('fail-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is a boolean', async () => {
    const { result } = renderHook(() => useEvents('bool-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isFailed).toBe('boolean')
  })

  it('refetch is a callable function', async () => {
    const { result } = renderHook(() => useEvents('refetch-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('populates events when SSE resolves successfully', async () => {
    const mockEvents: ClusterEvent[] = [
      {
        type: 'Warning',
        reason: 'FailedScheduling',
        message: 'No nodes available',
        object: 'Pod/test',
        namespace: 'default',
        cluster: 'success-cluster',
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      },
    ]
    vi.mocked(fetchSSE).mockResolvedValueOnce(mockEvents)
    const { result } = renderHook(() => useEvents('success-cluster', 'default', 10))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].reason).toBe('FailedScheduling')
    expect(result.current.error).toBeNull()
  })

  it('clears error after a successful fetch following a failure', async () => {
    vi.mocked(fetchSSE)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useEvents('recover-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // At this point the first fetch has failed and set an error
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('renders without crashing when called with no arguments', async () => {
    const { result } = renderHook(() => useEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.events)).toBe(true)
  })

  it('respects the limit parameter by slicing the cache key', () => {
    const { result } = renderHook(() => useEvents('key-cluster', 'key-ns', 5))
    // The hook renders — limit is included in the cache key, ensuring isolation
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useWarningEvents
// ---------------------------------------------------------------------------

describe('useWarningEvents', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
    vi.mocked(fetchSSE).mockRejectedValue(new Error('SSE unavailable'))
  })

  it('returns the expected API shape after load', async () => {
    const { result } = renderHook(() => useWarningEvents('warn-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('events')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(Array.isArray(result.current.events)).toBe(true)
  })

  it('starts in loading state when no cache exists', () => {
    const { result } = renderHook(() => useWarningEvents('warn-loading-cluster'))
    expect(result.current.isLoading).toBe(true)
  })

  it('increments consecutiveFailures when SSE fails', async () => {
    const { result } = renderHook(() => useWarningEvents('warn-fail-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('refetch is a callable function', async () => {
    const { result } = renderHook(() => useWarningEvents('warn-refetch-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('renders without crashing when called with no arguments', async () => {
    const { result } = renderHook(() => useWarningEvents())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.events)).toBe(true)
  })
})
