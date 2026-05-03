/**
 * Tests for workloadSubscriptions.ts
 *
 * Covers the pub/sub state management for workloads cache reset notifications.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  notifyWorkloadsSubscribers,
  subscribeWorkloadsCache,
  getWorkloadsSharedState,
  setWorkloadsSharedState,
  type WorkloadsSharedState,
  type WorkloadsSubscriber,
} from '../workloadSubscriptions'

// ---------------------------------------------------------------------------
// Reset module state between tests to avoid leakage
// ---------------------------------------------------------------------------

// We manipulate module-level state directly, so reset via setWorkloadsSharedState
// and unsubscribe all callbacks using the unsubscribe handles returned by subscribe.
beforeEach(() => {
  setWorkloadsSharedState({ cacheVersion: 0, isResetting: false })
})

// ---------------------------------------------------------------------------
// getWorkloadsSharedState / setWorkloadsSharedState
// ---------------------------------------------------------------------------

describe('getWorkloadsSharedState / setWorkloadsSharedState', () => {
  it('returns the initial default state', () => {
    const state = getWorkloadsSharedState()
    expect(state.cacheVersion).toBe(0)
    expect(state.isResetting).toBe(false)
  })

  it('merges partial state updates', () => {
    setWorkloadsSharedState({ cacheVersion: 3 })
    expect(getWorkloadsSharedState().cacheVersion).toBe(3)
    expect(getWorkloadsSharedState().isResetting).toBe(false)
  })

  it('sets isResetting to true without touching cacheVersion', () => {
    setWorkloadsSharedState({ cacheVersion: 5 })
    setWorkloadsSharedState({ isResetting: true })
    const state = getWorkloadsSharedState()
    expect(state.cacheVersion).toBe(5)
    expect(state.isResetting).toBe(true)
  })

  it('overwrites both fields when both are provided', () => {
    setWorkloadsSharedState({ cacheVersion: 7, isResetting: true })
    const state = getWorkloadsSharedState()
    expect(state.cacheVersion).toBe(7)
    expect(state.isResetting).toBe(true)
  })

  it('returns a reference to the current state object', () => {
    setWorkloadsSharedState({ cacheVersion: 1 })
    const s1 = getWorkloadsSharedState()
    setWorkloadsSharedState({ cacheVersion: 2 })
    const s2 = getWorkloadsSharedState()
    // State after second set should differ from first capture
    expect(s2.cacheVersion).toBe(2)
    // s1 was captured before the update — its value may differ
    expect(s1.cacheVersion).not.toBe(s2.cacheVersion)
  })
})

// ---------------------------------------------------------------------------
// subscribeWorkloadsCache / unsubscribe
// ---------------------------------------------------------------------------

describe('subscribeWorkloadsCache', () => {
  it('returns an unsubscribe function', () => {
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('registers a callback that is called on notify', () => {
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)

    notifyWorkloadsSubscribers()

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(getWorkloadsSharedState())
    unsub()
  })

  it('callback receives the current shared state', () => {
    setWorkloadsSharedState({ cacheVersion: 42, isResetting: true })
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)

    notifyWorkloadsSubscribers()

    const received = (cb as ReturnType<typeof vi.fn>).mock.calls[0][0] as WorkloadsSharedState
    expect(received.cacheVersion).toBe(42)
    expect(received.isResetting).toBe(true)
    unsub()
  })

  it('multiple subscribers all receive the notification', () => {
    const cb1: WorkloadsSubscriber = vi.fn()
    const cb2: WorkloadsSubscriber = vi.fn()
    const cb3: WorkloadsSubscriber = vi.fn()

    const u1 = subscribeWorkloadsCache(cb1)
    const u2 = subscribeWorkloadsCache(cb2)
    const u3 = subscribeWorkloadsCache(cb3)

    notifyWorkloadsSubscribers()

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb3).toHaveBeenCalledTimes(1)

    u1(); u2(); u3()
  })

  it('unsubscribed callback is NOT called on subsequent notifies', () => {
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)

    notifyWorkloadsSubscribers()
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
    notifyWorkloadsSubscribers()
    expect(cb).toHaveBeenCalledTimes(1) // still 1 — not called again
  })

  it('unsubscribing one does not affect other subscribers', () => {
    const cb1: WorkloadsSubscriber = vi.fn()
    const cb2: WorkloadsSubscriber = vi.fn()

    const u1 = subscribeWorkloadsCache(cb1)
    const u2 = subscribeWorkloadsCache(cb2)

    u1() // unsubscribe cb1 only
    notifyWorkloadsSubscribers()

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)

    u2()
  })

  it('calling unsubscribe twice is safe (no throw)', () => {
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)
    expect(() => { unsub(); unsub() }).not.toThrow()
  })

  it('notifying with no subscribers is safe', () => {
    // All subscribers from previous tests should be cleaned up via beforeEach
    // Re-confirm: notify with zero subscribers should not throw
    expect(() => notifyWorkloadsSubscribers()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// notifyWorkloadsSubscribers
// ---------------------------------------------------------------------------

describe('notifyWorkloadsSubscribers', () => {
  it('calls subscribers multiple times when called multiple times', () => {
    const cb: WorkloadsSubscriber = vi.fn()
    const unsub = subscribeWorkloadsCache(cb)

    notifyWorkloadsSubscribers()
    notifyWorkloadsSubscribers()
    notifyWorkloadsSubscribers()

    expect(cb).toHaveBeenCalledTimes(3)
    unsub()
  })

  it('notified state reflects the latest setWorkloadsSharedState call', () => {
    const states: WorkloadsSharedState[] = []
    const cb: WorkloadsSubscriber = (s) => states.push({ ...s })
    const unsub = subscribeWorkloadsCache(cb)

    setWorkloadsSharedState({ cacheVersion: 1 })
    notifyWorkloadsSubscribers()

    setWorkloadsSharedState({ cacheVersion: 2, isResetting: true })
    notifyWorkloadsSubscribers()

    expect(states).toHaveLength(2)
    expect(states[0].cacheVersion).toBe(1)
    expect(states[1].cacheVersion).toBe(2)
    expect(states[1].isResetting).toBe(true)

    unsub()
  })
})
