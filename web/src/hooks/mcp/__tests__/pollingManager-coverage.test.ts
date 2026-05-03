/**
 * Extended coverage tests for hooks/mcp/pollingManager.ts
 *
 * Covers: subscribe/unsubscribe lifecycle, deduplication, multi-subscriber,
 * interval cleanup, callback invocation on tick.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { subscribePolling } from '../pollingManager'

describe('pollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts an interval on first subscriber', () => {
    const callback = vi.fn()
    const unsub = subscribePolling('key-1', 1000, callback)

    // Callback not called immediately
    expect(callback).not.toHaveBeenCalled()

    // After one interval tick
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    // After another tick
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('does not create a second interval for the same key', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribePolling('shared-key', 1000, cb1)
    const unsub2 = subscribePolling('shared-key', 1000, cb2)

    vi.advanceTimersByTime(1000)

    // Both callbacks should be called once (single interval, two subscribers)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('stops the interval when last subscriber unsubscribes', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribePolling('cleanup-key', 500, cb1)
    const unsub2 = subscribePolling('cleanup-key', 500, cb2)

    vi.advanceTimersByTime(500)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    // Remove first subscriber — interval should continue
    unsub1()
    vi.advanceTimersByTime(500)
    expect(cb1).toHaveBeenCalledTimes(1) // no more calls
    expect(cb2).toHaveBeenCalledTimes(2)

    // Remove last subscriber — interval should stop
    unsub2()
    vi.advanceTimersByTime(500)
    expect(cb2).toHaveBeenCalledTimes(2) // no more calls
  })

  it('can re-subscribe after all subscribers have left', () => {
    const cb1 = vi.fn()
    const unsub1 = subscribePolling('resubscribe-key', 1000, cb1)

    vi.advanceTimersByTime(1000)
    expect(cb1).toHaveBeenCalledTimes(1)
    unsub1()

    // All gone — now re-subscribe
    const cb2 = vi.fn()
    const unsub2 = subscribePolling('resubscribe-key', 1000, cb2)

    vi.advanceTimersByTime(1000)
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb1).toHaveBeenCalledTimes(1) // old callback not called again

    unsub2()
  })

  it('handles multiple independent keys', () => {
    const cbA = vi.fn()
    const cbB = vi.fn()
    const unsubA = subscribePolling('key-a', 1000, cbA)
    const unsubB = subscribePolling('key-b', 2000, cbB)

    vi.advanceTimersByTime(2000)
    expect(cbA).toHaveBeenCalledTimes(2) // 1000ms interval, 2 ticks
    expect(cbB).toHaveBeenCalledTimes(1) // 2000ms interval, 1 tick

    unsubA()
    unsubB()
  })

  it('unsubscribe is idempotent (calling twice does not throw)', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('idem-key', 1000, cb)

    unsub()
    expect(() => unsub()).not.toThrow()
  })

  it('uses unique subscriber IDs (not callback identity)', () => {
    // Same callback reference, subscribed twice — each should get its own ID
    const cb = vi.fn()
    const unsub1 = subscribePolling('id-key', 1000, cb)
    const unsub2 = subscribePolling('id-key', 1000, cb)

    vi.advanceTimersByTime(1000)
    // Called twice per tick (two subscribers with same callback)
    expect(cb).toHaveBeenCalledTimes(2)

    // Unsubscribe one — should still get called once per tick
    unsub1()
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(3) // 2 from first tick + 1 from second

    unsub2()
  })

  it('does not call callbacks after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('no-call-key', 500, cb)

    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1) // still 1
  })
})
