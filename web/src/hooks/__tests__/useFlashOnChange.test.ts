/**
 * Tests for useFlashOnChange hook.
 *
 * Validates flash-on-change animation trigger behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlashOnChange } from '../useFlashOnChange'

describe('useFlashOnChange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not flash on initial render', () => {
    const { result } = renderHook(() => useFlashOnChange('initial'))
    expect(result.current).toBe(false)
  })

  it('should flash when value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useFlashOnChange(value),
      { initialProps: { value: 'a' } },
    )

    expect(result.current).toBe(false)

    rerender({ value: 'b' })
    expect(result.current).toBe(true)
  })

  it('should stop flashing after default duration (1000ms)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useFlashOnChange(value),
      { initialProps: { value: 1 } },
    )

    rerender({ value: 2 })
    expect(result.current).toBe(true)

    // Still flashing at 999ms
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current).toBe(true)

    // Stops at 1000ms
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(false)
  })

  it('should use custom duration', () => {
    const { result, rerender } = renderHook(
      ({ value, duration }) => useFlashOnChange(value, duration),
      { initialProps: { value: 'x', duration: 500 } },
    )

    rerender({ value: 'y', duration: 500 })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(false)
  })

  it('should reset flash timer on rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useFlashOnChange(value, 1000),
      { initialProps: { value: 'a' } },
    )

    // First change
    rerender({ value: 'b' })
    expect(result.current).toBe(true)

    // Advance 500ms
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(true)

    // Second change - should reset timer
    rerender({ value: 'c' })
    expect(result.current).toBe(true)

    // 500ms after second change (total 1000ms from first), should still be flashing
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(true)

    // Full 1000ms after second change
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(false)
  })

  it('should not flash when value is set to same value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useFlashOnChange(value),
      { initialProps: { value: 42 } },
    )

    rerender({ value: 42 })
    expect(result.current).toBe(false)
  })

  it('should work with object references (reference equality)', () => {
    const obj1 = { count: 1 }
    const obj2 = { count: 1 } // Different reference, same content

    const { result, rerender } = renderHook(
      ({ value }) => useFlashOnChange(value),
      { initialProps: { value: obj1 as Record<string, number> } },
    )

    // Different reference triggers flash even if content is same
    rerender({ value: obj2 })
    expect(result.current).toBe(true)
  })

  it('should clean up timeout on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useFlashOnChange(value, 1000),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    expect(result.current).toBe(true)

    // Unmount while flash is active - should not throw
    unmount()

    // Advancing timers after unmount should not cause issues
    act(() => {
      vi.advanceTimersByTime(2000)
    })
  })
})
