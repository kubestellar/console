/**
 * Tests for lib/quantum/patternChangeEmitter.ts
 *
 * Covers the singleton pub/sub and localStorage cross-tab sync mechanism.
 * The module uses a module-level Set, so each test unsubscribes to prevent
 * cross-test subscriber leakage.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// Use dynamic imports so vi.mock hoisting works correctly, and to reset
// module state between test groups via resetModules when needed.
import { notifyPatternChange, subscribeToPatternChanges } from '../../lib/quantum/patternChangeEmitter'

describe('notifyPatternChange', () => {
  it('calls all registered subscribers with the pattern', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeToPatternChanges(cb1)
    const unsub2 = subscribeToPatternChanges(cb2)

    notifyPatternChange('GHZ_3')

    expect(cb1).toHaveBeenCalledWith('GHZ_3')
    expect(cb2).toHaveBeenCalledWith('GHZ_3')

    unsub1()
    unsub2()
  })

  it('does not call unsubscribed callbacks', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)
    unsub()

    notifyPatternChange('bell')

    expect(cb).not.toHaveBeenCalled()
  })

  it('calls subscribers with each successive pattern', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    notifyPatternChange('AAAA')
    notifyPatternChange('BBBB')

    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenNthCalledWith(1, 'AAAA')
    expect(cb).toHaveBeenNthCalledWith(2, 'BBBB')

    unsub()
  })

  it('writes pattern to localStorage for cross-tab sync', () => {
    const unsub = subscribeToPatternChanges(vi.fn())
    notifyPatternChange('cross-tab-pattern')
    unsub()

    const raw = window.localStorage.getItem('__quantum_pattern_change')
    expect(raw).not.toBeNull()
    expect(raw).toContain('"pattern":"cross-tab-pattern"')
  })

  it('swallows localStorage quota errors without throwing', () => {
    const origSetItem = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = () => { throw new DOMException('QuotaExceededError') }

    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    expect(() => notifyPatternChange('quantum')).not.toThrow()
    // subscriber still called even if localStorage throws
    expect(cb).toHaveBeenCalledWith('quantum')

    unsub()
    window.localStorage.setItem = origSetItem
  })
})

describe('subscribeToPatternChanges', () => {
  it('returns a function (unsubscriber)', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('unsubscriber removes callback from future notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    notifyPatternChange('before')
    unsub()
    notifyPatternChange('after')

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('before')
  })

  it('unsubscriber removes the storage event listener', () => {
    const removeEventSpy = vi.spyOn(window, 'removeEventListener')

    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)
    unsub()

    expect(removeEventSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    removeEventSpy.mockRestore()
  })

  it('multiple subscribers each get their own unsubscriber', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeToPatternChanges(cb1)
    const unsub2 = subscribeToPatternChanges(cb2)

    unsub1()
    notifyPatternChange('only-cb2')

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledWith('only-cb2')

    unsub2()
  })
})

describe('cross-tab sync via storage event', () => {
  afterEach(() => {
    // clean up any leftover event listeners added by subscribeToPatternChanges
  })

  it('calls callback when matching storage event fires', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    const event = new StorageEvent('storage', {
      key: '__quantum_pattern_change',
      newValue: JSON.stringify({ pattern: 'cross-tab', ts: Date.now() }),
    })
    window.dispatchEvent(event)

    expect(cb).toHaveBeenCalledWith('cross-tab')
    unsub()
  })

  it('ignores storage events with a different key', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    const event = new StorageEvent('storage', {
      key: 'other-key',
      newValue: JSON.stringify({ pattern: 'ignored' }),
    })
    window.dispatchEvent(event)

    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('ignores storage events with null newValue', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    const event = new StorageEvent('storage', {
      key: '__quantum_pattern_change',
      newValue: null,
    })
    window.dispatchEvent(event)

    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('ignores storage events with invalid JSON', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)

    const event = new StorageEvent('storage', {
      key: '__quantum_pattern_change',
      newValue: 'not-valid-json{{{',
    })
    window.dispatchEvent(event)

    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('does not call callback after unsubscribe for storage events', () => {
    const cb = vi.fn()
    const unsub = subscribeToPatternChanges(cb)
    unsub()

    const event = new StorageEvent('storage', {
      key: '__quantum_pattern_change',
      newValue: JSON.stringify({ pattern: 'after-unsub', ts: Date.now() }),
    })
    window.dispatchEvent(event)

    expect(cb).not.toHaveBeenCalled()
  })
})
