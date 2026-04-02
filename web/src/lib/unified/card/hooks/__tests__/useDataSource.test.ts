import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerDataHook,
  getDataHook,
  getRegisteredDataHooks,
  subscribeRegistryChange,
  getRegistryVersion,
} from '../useDataSource'

/**
 * Tests for useDataSource pure functions and registry logic.
 *
 * The React hooks (useDataSource, useDataHookRegistryVersion) are not tested
 * here because they require renderHook from @testing-library/react-hooks.
 * This file focuses on the non-hook exports: registry operations, listener
 * management, and version tracking.
 */

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('registerDataHook', () => {
  it('registers a hook that can be retrieved by name', () => {
    const mockHook = vi.fn().mockReturnValue({
      data: [{ id: 1 }],
      isLoading: false,
      error: null,
    })

    registerDataHook('testHook1', mockHook)
    expect(getDataHook('testHook1')).toBe(mockHook)
  })

  it('overwrites a previously registered hook with the same name', () => {
    const hookA = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    const hookB = vi.fn().mockReturnValue({ data: [1], isLoading: false, error: null })

    registerDataHook('overwriteHook', hookA)
    registerDataHook('overwriteHook', hookB)

    expect(getDataHook('overwriteHook')).toBe(hookB)
  })

  it('increments the registry version on each registration', () => {
    const before = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })

    registerDataHook('versionTestHook', mockHook)
    expect(getRegistryVersion()).toBe(before + 1)
  })

  it('notifies all listeners when a hook is registered', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    subscribeRegistryChange(listenerA)
    subscribeRegistryChange(listenerB)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('listenerNotifyHook', mockHook)

    expect(listenerA).toHaveBeenCalled()
    expect(listenerB).toHaveBeenCalled()

    // Clean up subscriptions
    subscribeRegistryChange(listenerA)
    subscribeRegistryChange(listenerB)
  })
})

// ---------------------------------------------------------------------------
// getDataHook
// ---------------------------------------------------------------------------

describe('getDataHook', () => {
  it('returns undefined for an unregistered hook name', () => {
    expect(getDataHook('nonExistentHook_xyz_99')).toBeUndefined()
  })

  it('returns the correct hook after multiple registrations', () => {
    const hooks = Array.from({ length: 3 }, (_, i) => {
      const fn = vi.fn().mockReturnValue({ data: [i], isLoading: false, error: null })
      registerDataHook(`multi_${i}`, fn)
      return fn
    })

    hooks.forEach((fn, i) => {
      expect(getDataHook(`multi_${i}`)).toBe(fn)
    })
  })
})

// ---------------------------------------------------------------------------
// getRegisteredDataHooks
// ---------------------------------------------------------------------------

describe('getRegisteredDataHooks', () => {
  it('returns an array of registered hook names', () => {
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('registeredListHook', mockHook)

    const names = getRegisteredDataHooks()
    expect(names).toContain('registeredListHook')
  })

  it('returns all hooks including previously registered ones', () => {
    const names = getRegisteredDataHooks()
    // We registered several hooks in earlier tests; ensure the list is non-empty
    expect(names.length).toBeGreaterThan(0)
    expect(Array.isArray(names)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// subscribeRegistryChange
// ---------------------------------------------------------------------------

describe('subscribeRegistryChange', () => {
  it('returns an unsubscribe function', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRegistryChange(listener)

    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })

  it('stops notifying after unsubscribe is called', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRegistryChange(listener)

    // Unsubscribe immediately
    unsubscribe()

    // Register a new hook -- listener should NOT be called
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('afterUnsubHook', mockHook)

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not throw when the same listener is subscribed twice', () => {
    const listener = vi.fn()

    // Sets deduplicate, so subscribing twice should just keep one reference
    const unsub1 = subscribeRegistryChange(listener)
    const unsub2 = subscribeRegistryChange(listener)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('doubleSubHook', mockHook)

    // Since it's a Set, the listener is only called once
    expect(listener).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('handles listeners that throw without corrupting the registry', () => {
    const throwingListener = vi.fn(() => {
      throw new Error('listener error')
    })

    const unsubThrow = subscribeRegistryChange(throwingListener)

    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })

    // The forEach will propagate the error. The important thing is the hook
    // is still registered in the registry despite the listener throwing.
    try {
      registerDataHook('throwListenerHook', mockHook)
    } catch {
      // Expected since forEach propagates
    }

    // Clean up the throwing listener BEFORE any later test triggers it
    unsubThrow()

    // The hook should still be registered regardless
    expect(getDataHook('throwListenerHook')).toBe(mockHook)
  })
})

// ---------------------------------------------------------------------------
// getRegistryVersion
// ---------------------------------------------------------------------------

describe('getRegistryVersion', () => {
  it('returns a number', () => {
    expect(typeof getRegistryVersion()).toBe('number')
  })

  it('monotonically increases with each registration', () => {
    const v1 = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('monoIncHook1', mockHook)
    const v2 = getRegistryVersion()
    registerDataHook('monoIncHook2', mockHook)
    const v3 = getRegistryVersion()

    expect(v2).toBeGreaterThan(v1)
    expect(v3).toBeGreaterThan(v2)
  })

  it('increments by exactly 1 per registration', () => {
    const before = getRegistryVersion()
    const mockHook = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null })
    registerDataHook('exactIncHook', mockHook)
    expect(getRegistryVersion()).toBe(before + 1)
  })
})
