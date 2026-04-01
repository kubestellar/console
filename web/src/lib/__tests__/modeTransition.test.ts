import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerCacheReset,
  unregisterCacheReset,
  clearAllRegisteredCaches,
  getRegisteredCacheCount,
  registerRefetch,
  getModeTransitionVersion,
  triggerAllRefetches,
  incrementModeTransitionVersion,
} from '../modeTransition'

describe('cache reset registry', () => {
  beforeEach(() => {
    // Clean up by unregistering test keys
    unregisterCacheReset('test-cache-1')
    unregisterCacheReset('test-cache-2')
  })

  it('registers and counts caches', () => {
    const initialCount = getRegisteredCacheCount()
    registerCacheReset('test-cache-1', vi.fn())
    expect(getRegisteredCacheCount()).toBe(initialCount + 1)
  })

  it('unregisters caches', () => {
    registerCacheReset('test-cache-1', vi.fn())
    const countAfterAdd = getRegisteredCacheCount()
    unregisterCacheReset('test-cache-1')
    expect(getRegisteredCacheCount()).toBe(countAfterAdd - 1)
  })

  it('clearAllRegisteredCaches calls all reset functions', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    registerCacheReset('test-cache-1', fn1)
    registerCacheReset('test-cache-2', fn2)

    clearAllRegisteredCaches()

    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })

  it('handles errors in reset functions gracefully', () => {
    const fn1 = vi.fn().mockImplementation(() => { throw new Error('boom') })
    const fn2 = vi.fn()
    registerCacheReset('test-cache-1', fn1)
    registerCacheReset('test-cache-2', fn2)

    // Should not throw
    expect(() => clearAllRegisteredCaches()).not.toThrow()
    expect(fn2).toHaveBeenCalledOnce()
  })
})

describe('refetch registry', () => {
  it('registerRefetch returns an unsubscribe function', () => {
    const fn = vi.fn()
    const unsub = registerRefetch('test-refetch', fn)

    triggerAllRefetches()
    expect(fn).toHaveBeenCalledOnce()

    unsub()
    fn.mockClear()
    triggerAllRefetches()
    // Should not be called after unsubscribe
    expect(fn).not.toHaveBeenCalled()
  })

  it('triggerAllRefetches calls all registered functions', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    const unsub1 = registerRefetch('test-refetch-1', fn1)
    const unsub2 = registerRefetch('test-refetch-2', fn2)

    triggerAllRefetches()

    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()

    unsub1()
    unsub2()
  })

  it('handles errors in refetch functions gracefully', () => {
    const fn = vi.fn().mockImplementation(() => { throw new Error('refetch error') })
    const unsub = registerRefetch('test-refetch-err', fn)

    expect(() => triggerAllRefetches()).not.toThrow()

    unsub()
  })
})

describe('mode transition version', () => {
  it('starts at a number', () => {
    expect(typeof getModeTransitionVersion()).toBe('number')
  })

  it('increments on each call', () => {
    const before = getModeTransitionVersion()
    incrementModeTransitionVersion()
    expect(getModeTransitionVersion()).toBe(before + 1)
  })
})
