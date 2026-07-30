import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to reset module state between tests since pollingRegistry is
// module-level state. Use dynamic import after vi.resetModules().
let subscribePolling: typeof import('../pollingManager').subscribePolling

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const mod = await import('../pollingManager')
  subscribePolling = mod.subscribePolling
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pollingManager', () => {
  describe('subscribePolling', () => {
    it('calls the callback on each interval tick', () => {
      const cb = vi.fn()
      subscribePolling('test-key', 1000, cb)

      expect(cb).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      expect(cb).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1000)
      expect(cb).toHaveBeenCalledTimes(2)
    })

    it('deduplicates intervals for the same cache key', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      subscribePolling('shared-key', 500, cb1)
      subscribePolling('shared-key', 500, cb2)

      vi.advanceTimersByTime(500)
      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledTimes(1)
    })

    it('stops the interval when the last subscriber unsubscribes', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      const unsub1 = subscribePolling('cleanup-key', 200, cb1)
      const unsub2 = subscribePolling('cleanup-key', 200, cb2)

      unsub1()
      vi.advanceTimersByTime(200)
      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledTimes(1)

      unsub2()
      vi.advanceTimersByTime(1000)
      expect(cb2).toHaveBeenCalledTimes(1) // no more ticks
    })

    it('unsubscribe is idempotent — calling twice does not throw', () => {
      const cb = vi.fn()
      const unsub = subscribePolling('idem-key', 100, cb)

      unsub()
      expect(() => unsub()).not.toThrow()

      vi.advanceTimersByTime(500)
      expect(cb).not.toHaveBeenCalled()
    })

    it('uses separate intervals for different keys', () => {
      const cbA = vi.fn()
      const cbB = vi.fn()

      subscribePolling('key-a', 100, cbA)
      subscribePolling('key-b', 300, cbB)

      vi.advanceTimersByTime(300)
      expect(cbA).toHaveBeenCalledTimes(3)
      expect(cbB).toHaveBeenCalledTimes(1)
    })

    it('re-creates interval after all subscribers leave and a new one joins', () => {
      const cb1 = vi.fn()
      const unsub1 = subscribePolling('reuse-key', 100, cb1)

      vi.advanceTimersByTime(100)
      expect(cb1).toHaveBeenCalledTimes(1)

      unsub1()

      const cb2 = vi.fn()
      subscribePolling('reuse-key', 100, cb2)

      vi.advanceTimersByTime(100)
      expect(cb2).toHaveBeenCalledTimes(1)
      expect(cb1).toHaveBeenCalledTimes(1) // not called again
    })

    it('returns a function (unsubscribe handle)', () => {
      const unsub = subscribePolling('type-key', 100, vi.fn())
      expect(typeof unsub).toBe('function')
    })

    it('handles many subscribers subscribing and unsubscribing', () => {
      const callbacks = Array.from({ length: 10 }, () => vi.fn())
      const unsubs = callbacks.map((cb) => subscribePolling('multi-key', 50, cb))

      vi.advanceTimersByTime(50)
      callbacks.forEach((cb) => expect(cb).toHaveBeenCalledTimes(1))

      // Remove half
      unsubs.slice(0, 5).forEach((u) => u())

      vi.advanceTimersByTime(50)
      callbacks.slice(0, 5).forEach((cb) => expect(cb).toHaveBeenCalledTimes(1))
      callbacks.slice(5).forEach((cb) => expect(cb).toHaveBeenCalledTimes(2))
    })
  })
})
