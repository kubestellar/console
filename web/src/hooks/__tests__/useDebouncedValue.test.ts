import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from '../useDebouncedValue'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('does not update value before delay elapses', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } },
    )
    rerender({ value: 'updated' })
    expect(result.current).toBe('initial')
    vi.useRealTimers()
  })

  it('updates value after delay elapses', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } },
    )
    rerender({ value: 'updated' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('updated')
    vi.useRealTimers()
  })

  it('resets the timer when value changes rapidly', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    )
    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(200) })
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(200) })
    // Only 200ms since last change — not debounced yet
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('c')
    vi.useRealTimers()
  })

  it('updates synchronously when delayMs is 0', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: 'initial' } },
    )
    act(() => { rerender({ value: 'instant' }) })
    expect(result.current).toBe('instant')
    vi.useRealTimers()
  })

  it('updates synchronously when delayMs is negative', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, -1),
      { initialProps: { value: 'initial' } },
    )
    act(() => { rerender({ value: 'instant' }) })
    expect(result.current).toBe('instant')
    vi.useRealTimers()
  })

  it('works with non-string values', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 42 } },
    )
    rerender({ value: 99 })
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe(99)
    vi.useRealTimers()
  })

  it('works with object values', () => {
    vi.useFakeTimers()
    const obj1 = { x: 1 }
    const obj2 = { x: 2 }
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: obj1 } },
    )
    rerender({ value: obj2 })
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toEqual({ x: 2 })
    vi.useRealTimers()
  })
})
