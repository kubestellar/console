/**
 * Tests for useRefreshIndicator hook.
 *
 * Validates refresh indicator timing and refetch function invocation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefreshIndicator } from '../useRefreshIndicator'

describe('useRefreshIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not show indicator initially', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() => useRefreshIndicator(refetch))

    expect(result.current.showIndicator).toBe(false)
  })

  it('should show indicator after triggerRefresh is called', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() => useRefreshIndicator(refetch))

    act(() => {
      result.current.triggerRefresh()
    })

    expect(result.current.showIndicator).toBe(true)
  })

  it('should call refetchFn when triggerRefresh is called', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() => useRefreshIndicator(refetch))

    act(() => {
      result.current.triggerRefresh()
    })

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('should hide indicator after 300ms', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() => useRefreshIndicator(refetch))

    act(() => {
      result.current.triggerRefresh()
    })
    expect(result.current.showIndicator).toBe(true)

    // Still showing at 299ms
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current.showIndicator).toBe(true)

    // Hidden at 300ms
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showIndicator).toBe(false)
  })

  it('should reset timer on rapid successive triggers', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() => useRefreshIndicator(refetch))

    // First trigger
    act(() => {
      result.current.triggerRefresh()
    })

    // Advance 200ms
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.showIndicator).toBe(true)

    // Second trigger - resets timer
    act(() => {
      result.current.triggerRefresh()
    })
    expect(refetch).toHaveBeenCalledTimes(2)

    // 200ms after second trigger (total 400ms from first), still showing
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.showIndicator).toBe(true)

    // 300ms after second trigger, hides
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.showIndicator).toBe(false)
  })

  it('should provide callable triggerRefresh after re-render', () => {
    const refetch = vi.fn()
    const { result, rerender } = renderHook(() => useRefreshIndicator(refetch))
    rerender()
    // React Compiler handles memoization — just verify triggerRefresh is still callable
    expect(typeof result.current.triggerRefresh).toBe('function')
  })

  it('should update triggerRefresh when refetchFn changes', () => {
    const refetch1 = vi.fn()
    const refetch2 = vi.fn()

    const { result, rerender } = renderHook(
      ({ fn }) => useRefreshIndicator(fn),
      { initialProps: { fn: refetch1 } },
    )

    act(() => {
      result.current.triggerRefresh()
    })
    expect(refetch1).toHaveBeenCalledTimes(1)
    expect(refetch2).not.toHaveBeenCalled()

    // Change the refetch function
    rerender({ fn: refetch2 })

    act(() => {
      result.current.triggerRefresh()
    })
    expect(refetch2).toHaveBeenCalledTimes(1)
  })
})
