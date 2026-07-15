import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  notifyPatternChange,
  subscribeToPatternChanges,
} from '../patternChangeEmitter'

describe('patternChangeEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear localStorage to ensure clean test state
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('notifyPatternChange', () => {
    it('triggers subscriber callbacks with pattern', () => {
      const callback = vi.fn()
      subscribeToPatternChanges(callback)

      notifyPatternChange('test-pattern-1')
      expect(callback).toHaveBeenCalledWith('test-pattern-1')
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('triggers multiple subscribers', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      subscribeToPatternChanges(callback1)
      subscribeToPatternChanges(callback2)

      notifyPatternChange('multi-test')
      expect(callback1).toHaveBeenCalledWith('multi-test')
      expect(callback2).toHaveBeenCalledWith('multi-test')
    })

    it('stores pattern in localStorage for cross-tab sync', () => {
      notifyPatternChange('cross-tab-pattern')

      const stored = localStorage.getItem('__quantum_pattern_change')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed.pattern).toBe('cross-tab-pattern')
      expect(typeof parsed.ts).toBe('number')
    })

    it('handles localStorage quota exceeded gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => notifyPatternChange('safe-pattern')).not.toThrow()
    })
  })

  describe('subscribeToPatternChanges', () => {
    it('returns unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToPatternChanges(callback)

      expect(typeof unsubscribe).toBe('function')

      notifyPatternChange('before-unsub')
      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()

      notifyPatternChange('after-unsub')
      expect(callback).toHaveBeenCalledTimes(1) // Should not increase
    })

    it('handles cross-tab storage events', () => {
      const callback = vi.fn()
      subscribeToPatternChanges(callback)

      // Simulate storage event from another tab
      const event = new StorageEvent('storage', {
        key: '__quantum_pattern_change',
        newValue: JSON.stringify({ pattern: 'from-other-tab', ts: Date.now() }),
      })

      window.dispatchEvent(event)
      expect(callback).toHaveBeenCalledWith('from-other-tab')
    })

    it('ignores storage events for other keys', () => {
      const callback = vi.fn()
      subscribeToPatternChanges(callback)

      const event = new StorageEvent('storage', {
        key: 'some-other-key',
        newValue: 'value',
      })

      window.dispatchEvent(event)
      expect(callback).not.toHaveBeenCalled()
    })

    it('ignores malformed storage event JSON', () => {
      const callback = vi.fn()
      subscribeToPatternChanges(callback)

      const event = new StorageEvent('storage', {
        key: '__quantum_pattern_change',
        newValue: 'not-json',
      })

      // Should not throw
      expect(() => window.dispatchEvent(event)).not.toThrow()
      expect(callback).not.toHaveBeenCalled()
    })

    it('cleans up storage event listener on unsubscribe', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToPatternChanges(callback)

      unsubscribe()

      const event = new StorageEvent('storage', {
        key: '__quantum_pattern_change',
        newValue: JSON.stringify({ pattern: 'after-cleanup', ts: Date.now() }),
      })

      window.dispatchEvent(event)
      expect(callback).not.toHaveBeenCalled()
    })

    it('supports multiple independent subscriptions', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsub1 = subscribeToPatternChanges(callback1)
      const unsub2 = subscribeToPatternChanges(callback2)

      notifyPatternChange('both-receive')
      expect(callback1).toHaveBeenCalledWith('both-receive')
      expect(callback2).toHaveBeenCalledWith('both-receive')

      unsub1()

      notifyPatternChange('only-second')
      expect(callback2).toHaveBeenCalledWith('only-second')
      expect(callback1).toHaveBeenCalledTimes(1) // No new calls
    })
  })
})
