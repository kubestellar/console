/**
 * Tests for useNetworkStatus hook.
 *
 * Validates online/offline tracking, wasOffline reconnection feedback,
 * and the getNetworkStatus utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// The hook module uses module-level global state, so we need to reset it
// between tests by re-importing.
let useNetworkStatus: typeof import('../useNetworkStatus').useNetworkStatus
let getNetworkStatus: typeof import('../useNetworkStatus').getNetworkStatus

describe('useNetworkStatus', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    // Reset module-level global state by clearing the module cache
    vi.resetModules()
    const mod = await import('../useNetworkStatus')
    useNetworkStatus = mod.useNetworkStatus
    getNetworkStatus = mod.getNetworkStatus
    // Default to online
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return isOnline true when browser is online', () => {
    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(true)
    expect(result.current.wasOffline).toBe(false)
  })

  it('should detect offline when offline event fires', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
  })

  it('should detect online when online event fires after being offline', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOnline).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.isOnline).toBe(true)
  })

  it('should set wasOffline=true for 3 seconds after reconnection', () => {
    const { result } = renderHook(() => useNetworkStatus())

    // Go offline
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // Come back online
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.wasOffline).toBe(true)

    // After 2999ms, still showing wasOffline
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(result.current.wasOffline).toBe(true)

    // After 3000ms, wasOffline clears
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.wasOffline).toBe(false)
  })

  it('should not set wasOffline when going offline only', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // wasOffline only triggers on offline->online transition
    expect(result.current.wasOffline).toBe(false)
  })

  it('should reset wasOffline timer on rapid reconnection', () => {
    const { result } = renderHook(() => useNetworkStatus())

    // First cycle: offline -> online
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.wasOffline).toBe(true)

    // Advance 1500ms (half the timer)
    act(() => {
      vi.advanceTimersByTime(1500)
    })

    // Second cycle: offline -> online (resets the timer)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    // After another 2999ms from second reconnect, still showing
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(result.current.wasOffline).toBe(true)

    // After full 3000ms from second reconnect, clears
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.wasOffline).toBe(false)
  })

  it('getNetworkStatus returns current online state', () => {
    // Initially online
    expect(getNetworkStatus()).toBe(true)

    // After mounting and going offline
    renderHook(() => useNetworkStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(getNetworkStatus()).toBe(false)
  })

  it('should clean up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus())

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    unmount()

    // When last subscriber unmounts, global listeners should be removed
    const removedEvents = removeEventListenerSpy.mock.calls.map(c => c[0])
    expect(removedEvents).toContain('online')
    expect(removedEvents).toContain('offline')

    removeEventListenerSpy.mockRestore()
  })
})
