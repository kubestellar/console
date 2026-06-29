import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  dispatchStaleCacheCleanupEvent,
  subscribeToStaleCacheCleanupEvents,
  type StaleCacheCleanupEventDetail,
} from '../staleCacheEvents'

const makeDetail = (
  overrides: Partial<StaleCacheCleanupEventDetail> = {},
): StaleCacheCleanupEventDetail => ({
  staleKeysFound: 5,
  staleKeysRemoved: 3,
  oldestStaleAgeMs: 86400000,
  cleanupDurationMs: 42,
  timestamp: Date.now(),
  ...overrides,
})

describe('dispatchStaleCacheCleanupEvent', () => {
  it('dispatches a custom event on window', () => {
    const spy = vi.fn()
    window.addEventListener('kc:stale-cache-cleanup', spy)

    dispatchStaleCacheCleanupEvent(makeDetail())

    expect(spy).toHaveBeenCalledTimes(1)
    const event = spy.mock.calls[0][0] as CustomEvent<StaleCacheCleanupEventDetail>
    expect(event.detail.staleKeysFound).toBe(5)
    expect(event.detail.staleKeysRemoved).toBe(3)

    window.removeEventListener('kc:stale-cache-cleanup', spy)
  })

  it('includes all detail fields', () => {
    const detail = makeDetail({
      staleKeysFound: 10,
      staleKeysRemoved: 10,
      oldestStaleAgeMs: 0,
      cleanupDurationMs: 1,
      timestamp: 1234567890,
    })
    const spy = vi.fn()
    window.addEventListener('kc:stale-cache-cleanup', spy)

    dispatchStaleCacheCleanupEvent(detail)

    const event = spy.mock.calls[0][0] as CustomEvent<StaleCacheCleanupEventDetail>
    expect(event.detail).toEqual(detail)

    window.removeEventListener('kc:stale-cache-cleanup', spy)
  })
})

describe('subscribeToStaleCacheCleanupEvents', () => {
  it('calls listener when event is dispatched', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToStaleCacheCleanupEvents(listener)

    const detail = makeDetail()
    dispatchStaleCacheCleanupEvent(detail)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(detail)

    unsubscribe()
  })

  it('stops receiving events after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToStaleCacheCleanupEvents(listener)

    dispatchStaleCacheCleanupEvent(makeDetail())
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()

    dispatchStaleCacheCleanupEvent(makeDetail())
    expect(listener).toHaveBeenCalledTimes(1) // No additional call
  })

  it('supports multiple independent subscribers', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    const unsub1 = subscribeToStaleCacheCleanupEvents(listener1)
    const unsub2 = subscribeToStaleCacheCleanupEvents(listener2)

    dispatchStaleCacheCleanupEvent(makeDetail())

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)

    unsub1()
    dispatchStaleCacheCleanupEvent(makeDetail())

    expect(listener1).toHaveBeenCalledTimes(1) // Unsubscribed
    expect(listener2).toHaveBeenCalledTimes(2) // Still active

    unsub2()
  })
})
