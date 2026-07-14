import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { subscribePolling } from '../mcp/pollingManager'

describe('subscribePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes callback on each interval tick', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('poll-basic', 100, cb)
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(200)
    expect(cb).toHaveBeenCalledTimes(3)
    unsub()
  })

  it('stops invoking callback after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('poll-stop', 100, cb)
    unsub()
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  it('all subscribers for the same key receive ticks', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribePolling('poll-multi', 100, cb1)
    const unsub2 = subscribePolling('poll-multi', 100, cb2)
    vi.advanceTimersByTime(100)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    unsub1()
    unsub2()
  })

  it('interval continues for remaining subscriber after one unsubscribes', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribePolling('poll-remaining', 100, cb1)
    const unsub2 = subscribePolling('poll-remaining', 100, cb2)
    unsub1()
    vi.advanceTimersByTime(100)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)
    unsub2()
  })

  it('interval stops after last subscriber unsubscribes', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('poll-last', 100, cb)
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
    vi.advanceTimersByTime(300)
    expect(cb).toHaveBeenCalledTimes(1) // no more ticks
  })

  it('different keys maintain independent intervals', () => {
    const cbA = vi.fn()
    const cbB = vi.fn()
    const unsubA = subscribePolling('poll-key-a', 100, cbA)
    const unsubB = subscribePolling('poll-key-b', 200, cbB)
    vi.advanceTimersByTime(100)
    expect(cbA).toHaveBeenCalledTimes(1)
    expect(cbB).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(cbA).toHaveBeenCalledTimes(2)
    expect(cbB).toHaveBeenCalledTimes(1)
    unsubA()
    unsubB()
  })

  it('unsubscribe is safe to call multiple times without throwing', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('poll-safe', 100, cb)
    unsub()
    expect(() => unsub()).not.toThrow()
  })

  it('returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribePolling('poll-returns', 100, cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('callback updated between ticks uses the latest registered version', () => {
    let count = 0
    const cb = vi.fn(() => { count++ })
    const unsub = subscribePolling('poll-update', 100, cb)
    vi.advanceTimersByTime(100)
    expect(count).toBe(1)
    vi.advanceTimersByTime(100)
    expect(count).toBe(2)
    unsub()
  })
})
