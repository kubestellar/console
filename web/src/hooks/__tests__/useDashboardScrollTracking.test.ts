/**
 * Tests for useDashboardScrollTracking hook.
 *
 * Validates debounced scroll analytics for shallow and deep scroll depths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock the analytics module
vi.mock('../../lib/analytics', () => ({
  emitDashboardScrolled: vi.fn(),
}))

import { useDashboardScrollTracking } from '../useDashboardScrollTracking'
import { emitDashboardScrolled } from '../../lib/analytics'

const mockedEmit = vi.mocked(emitDashboardScrolled)

describe('useDashboardScrollTracking', () => {
  let mainEl: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
    mockedEmit.mockClear()

    // Create a <main> element as the scroll container
    mainEl = document.createElement('main')
    Object.defineProperty(mainEl, 'clientHeight', { value: 800, configurable: true })
    Object.defineProperty(mainEl, 'scrollTop', { value: 0, writable: true, configurable: true })
    document.body.appendChild(mainEl)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (mainEl && mainEl.isConnected) {
      mainEl.remove()
    }
  })

  function simulateScroll(scrollTop: number) {
    Object.defineProperty(mainEl, 'scrollTop', { value: scrollTop, writable: true, configurable: true })
    mainEl.dispatchEvent(new Event('scroll'))
  }

  it('fires shallow event on small scroll after debounce', () => {
    renderHook(() => useDashboardScrollTracking())

    // Scroll a small amount (scrollTop=100, ratio=0.125 — above 0 but below 1.5)
    simulateScroll(100)

    expect(mockedEmit).not.toHaveBeenCalled()

    // Advance past the 2000ms debounce
    vi.advanceTimersByTime(2000)

    expect(mockedEmit).toHaveBeenCalledWith('shallow')
    expect(mockedEmit).toHaveBeenCalledTimes(1)
  })

  it('fires deep event when scroll ratio >= 1.5', () => {
    renderHook(() => useDashboardScrollTracking())

    // scrollTop = 1200 → ratio = 1200/800 = 1.5 → deep threshold
    simulateScroll(1200)
    vi.advanceTimersByTime(2000)

    expect(mockedEmit).toHaveBeenCalledWith('deep')
  })

  it('fires shallow first, then deep on further scrolling', () => {
    renderHook(() => useDashboardScrollTracking())

    // First: shallow scroll
    simulateScroll(100)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledWith('shallow')

    // Then: deep scroll
    simulateScroll(1200)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledWith('deep')
    expect(mockedEmit).toHaveBeenCalledTimes(2)
  })

  it('does not fire more than once for deep scroll', () => {
    renderHook(() => useDashboardScrollTracking())

    // Deep scroll
    simulateScroll(1200)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledTimes(1)

    // Scroll again — should not fire again
    simulateScroll(2000)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledTimes(1)
  })

  it('does not fire shallow more than once', () => {
    renderHook(() => useDashboardScrollTracking())

    simulateScroll(50)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledTimes(1)

    // Another shallow scroll — should not re-fire shallow
    simulateScroll(100)
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid scroll events', () => {
    renderHook(() => useDashboardScrollTracking())

    // Rapid scrolling within the debounce window
    simulateScroll(50)
    vi.advanceTimersByTime(500)
    simulateScroll(100)
    vi.advanceTimersByTime(500)
    simulateScroll(200)

    // Not fired yet — still within debounce
    expect(mockedEmit).not.toHaveBeenCalled()

    // Fire after full debounce from last scroll
    vi.advanceTimersByTime(2000)
    expect(mockedEmit).toHaveBeenCalledTimes(1)
    expect(mockedEmit).toHaveBeenCalledWith('shallow')
  })

  it('does not fire when scrollTop is 0', () => {
    renderHook(() => useDashboardScrollTracking())

    simulateScroll(0)
    vi.advanceTimersByTime(2000)

    expect(mockedEmit).not.toHaveBeenCalled()
  })

  it('cleans up event listener and timer on unmount', () => {
    const { unmount } = renderHook(() => useDashboardScrollTracking())

    simulateScroll(100)
    // Unmount before debounce fires
    unmount()

    vi.advanceTimersByTime(2000)
    // Should not fire since hook was unmounted
    expect(mockedEmit).not.toHaveBeenCalled()
  })

  it('falls back to window when no <main> element exists', () => {
    // Remove the main element before rendering the hook
    document.body.removeChild(mainEl)

    renderHook(() => useDashboardScrollTracking())

    // Simulate scroll on window with documentElement
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 100,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 800,
      configurable: true,
    })

    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(2000)

    expect(mockedEmit).toHaveBeenCalledWith('shallow')

    // Re-add main so afterEach cleanup doesn't fail
    document.body.appendChild(mainEl)
  })
})
