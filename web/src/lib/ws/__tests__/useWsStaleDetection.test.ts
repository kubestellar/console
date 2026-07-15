import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createWsStaleDetection,
  DEFAULT_WS_STALE_TIMEOUT_MS,
  WS_STALE_CHECK_INTERVAL_MS,
} from '../useWsStaleDetection'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── exports ───────────────────────────────────────────────────────

describe('module constants', () => {
  it('exports DEFAULT_WS_STALE_TIMEOUT_MS as 45000', () => {
    expect(DEFAULT_WS_STALE_TIMEOUT_MS).toBe(45_000)
  })

  it('exports WS_STALE_CHECK_INTERVAL_MS as 5000', () => {
    expect(WS_STALE_CHECK_INTERVAL_MS).toBe(5_000)
  })
})

// ── createWsStaleDetection ────────────────────────────────────────

describe('createWsStaleDetection', () => {
  it('returns an object with the expected controller interface', () => {
    const ctrl = createWsStaleDetection({ onStale: vi.fn() })
    expect(ctrl).toHaveProperty('markMessageReceived')
    expect(ctrl).toHaveProperty('start')
    expect(ctrl).toHaveProperty('stop')
    expect(ctrl).toHaveProperty('getLastMessageAgeMs')
    expect(ctrl).toHaveProperty('handleDigest')
  })

  // ── getLastMessageAgeMs ──────────────────────────────────────

  describe('getLastMessageAgeMs', () => {
    it('returns 0 before any message is received', () => {
      const ctrl = createWsStaleDetection({ onStale: vi.fn() })
      expect(ctrl.getLastMessageAgeMs()).toBe(0)
    })

    it('returns elapsed ms since last markMessageReceived', () => {
      const ctrl = createWsStaleDetection({ onStale: vi.fn() })
      ctrl.markMessageReceived()
      vi.advanceTimersByTime(3000)
      expect(ctrl.getLastMessageAgeMs()).toBeGreaterThanOrEqual(3000)
    })

    it('resets to 0 after stop()', () => {
      const ctrl = createWsStaleDetection({ onStale: vi.fn() })
      ctrl.markMessageReceived()
      vi.advanceTimersByTime(1000)
      ctrl.stop()
      expect(ctrl.getLastMessageAgeMs()).toBe(0)
    })
  })

  // ── onStale not fired when no message received ────────────────

  describe('stale detection — no message received', () => {
    it('does not call onStale when lastMessageTime is 0', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale })
      ctrl.start()
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS * 2)
      expect(onStale).not.toHaveBeenCalled()
      ctrl.stop()
    })
  })

  // ── onStale fires after timeout ───────────────────────────────

  describe('stale detection — fires after timeout', () => {
    it('calls onStale when elapsed exceeds timeoutMs and not connected', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => false })
      ctrl.markMessageReceived()
      ctrl.start()
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS)
      expect(onStale).toHaveBeenCalledOnce()
    })

    it('passes elapsedMs to onStale', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({
        onStale,
        timeoutMs: 10_000,
        isConnected: () => false,
      })
      ctrl.markMessageReceived()
      ctrl.start()
      vi.advanceTimersByTime(15_000 + WS_STALE_CHECK_INTERVAL_MS)
      expect(onStale).toHaveBeenCalledWith(expect.any(Number))
      const elapsed = onStale.mock.calls[0][0] as number
      expect(elapsed).toBeGreaterThan(10_000)
    })

    it('stops the interval after firing onStale (fires only once)', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => false })
      ctrl.markMessageReceived()
      ctrl.start()
      vi.advanceTimersByTime((DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS) * 3)
      expect(onStale).toHaveBeenCalledOnce()
    })

    it('respects custom timeoutMs', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({
        onStale,
        timeoutMs: 5_000,
        isConnected: () => false,
      })
      ctrl.markMessageReceived()
      ctrl.start()
      // Not yet stale at 4s
      vi.advanceTimersByTime(4_000)
      expect(onStale).not.toHaveBeenCalled()
      // Stale at 5s + one check interval
      vi.advanceTimersByTime(2_000 + WS_STALE_CHECK_INTERVAL_MS)
      expect(onStale).toHaveBeenCalledOnce()
    })
  })

  // ── isConnected suppresses onStale ───────────────────────────

  describe('isConnected guard', () => {
    it('does not call onStale while isConnected returns true', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => true })
      ctrl.markMessageReceived()
      ctrl.start()
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS * 3)
      expect(onStale).not.toHaveBeenCalled()
      ctrl.stop()
    })

    it('fires onStale once isConnected returns false', () => {
      const onStale = vi.fn()
      let connected = true
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => connected })
      ctrl.markMessageReceived()
      ctrl.start()
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS - 1000)
      connected = false
      vi.advanceTimersByTime(2000 + WS_STALE_CHECK_INTERVAL_MS)
      expect(onStale).toHaveBeenCalledOnce()
    })
  })

  // ── shouldCheck stops the interval ───────────────────────────

  describe('shouldCheck guard', () => {
    it('stops the timer when shouldCheck returns false', () => {
      const onStale = vi.fn()
      let active = true
      const ctrl = createWsStaleDetection({
        onStale,
        isConnected: () => false,
        shouldCheck: () => active,
      })
      ctrl.markMessageReceived()
      ctrl.start()
      active = false
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS * 3)
      expect(onStale).not.toHaveBeenCalled()
    })
  })

  // ── start idempotency ─────────────────────────────────────────

  describe('start idempotency', () => {
    it('calling start twice does not create duplicate intervals', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => false })
      ctrl.markMessageReceived()
      ctrl.start()
      ctrl.start() // second call should be a no-op
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS)
      expect(onStale).toHaveBeenCalledOnce()
    })
  })

  // ── stop ──────────────────────────────────────────────────────

  describe('stop', () => {
    it('prevents onStale from being called after stop', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => false })
      ctrl.markMessageReceived()
      ctrl.start()
      ctrl.stop()
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS * 3)
      expect(onStale).not.toHaveBeenCalled()
    })

    it('is safe to call stop multiple times', () => {
      const ctrl = createWsStaleDetection({ onStale: vi.fn() })
      ctrl.start()
      expect(() => { ctrl.stop(); ctrl.stop() }).not.toThrow()
    })
  })

  // ── handleDigest ──────────────────────────────────────────────

  describe('handleDigest', () => {
    it('marks message received (resets stale timer)', () => {
      const onStale = vi.fn()
      const ctrl = createWsStaleDetection({ onStale, isConnected: () => false })
      ctrl.start()
      // Advance close to timeout then receive a digest — should reset
      vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS - 1000)
      ctrl.handleDigest({ clusterA: 'v1' })
      vi.advanceTimersByTime(WS_STALE_CHECK_INTERVAL_MS * 2)
      // Not stale yet — message was just received
      expect(onStale).not.toHaveBeenCalled()
      ctrl.stop()
    })

    it('calls onDrift with received versions', () => {
      const onDrift = vi.fn()
      const ctrl = createWsStaleDetection({ onStale: vi.fn(), onDrift })
      ctrl.handleDigest({ clusterA: 'v2', clusterB: 'v5' })
      expect(onDrift).toHaveBeenCalledWith({ clusterA: 'v2', clusterB: 'v5' })
    })

    it('does not throw when onDrift is not provided', () => {
      const ctrl = createWsStaleDetection({ onStale: vi.fn() })
      expect(() => ctrl.handleDigest({ clusterA: 'v1' })).not.toThrow()
    })
  })
})
