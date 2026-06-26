/**
 * Unit tests for lib/cards/cardFlash.ts
 *
 * Covers useCardFlash hook:
 *   - initial render (no flash)
 *   - significant increase triggers increaseType flash
 *   - significant decrease triggers decreaseType flash
 *   - change below threshold does not flash
 *   - zero value does not flash
 *   - unchanged value does not flash
 *   - cooldown prevents immediate re-flash
 *   - custom options override defaults
 *   - resetFlash sets flashType to 'none'
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardFlash } from '../cards/cardFlash'

// jsdom provides fake timers support
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useCardFlash', () => {
  it('starts with flashType "none" on first render', () => {
    const { result } = renderHook(() => useCardFlash(10))
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash on first value (no prev)', () => {
    const { result } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 100 },
    })
    expect(result.current.flashType).toBe('none')
  })

  it('flashes "info" (default increaseType) on significant increase', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 10 },
    })
    act(() => {
      rerender({ value: 20 }) // 100% increase, threshold 10%
    })
    expect(result.current.flashType).toBe('info')
  })

  it('flashes "info" (default decreaseType) on significant decrease', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 100 },
    })
    act(() => {
      rerender({ value: 50 }) // 50% decrease
    })
    expect(result.current.flashType).toBe('info')
  })

  it('does not flash when change is below threshold', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.5 }),
      { initialProps: { value: 100 } }
    )
    act(() => {
      rerender({ value: 110 }) // 10% change — below 50% threshold
    })
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when value is 0', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 10 },
    })
    act(() => {
      rerender({ value: 0 })
    })
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when value is unchanged', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 42 },
    })
    act(() => {
      rerender({ value: 42 })
    })
    expect(result.current.flashType).toBe('none')
  })

  it('uses custom increaseType', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { increaseType: 'error' }),
      { initialProps: { value: 5 } }
    )
    act(() => {
      rerender({ value: 50 }) // 900% increase
    })
    expect(result.current.flashType).toBe('error')
  })

  it('uses custom decreaseType', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { decreaseType: 'warning' }),
      { initialProps: { value: 100 } }
    )
    act(() => {
      rerender({ value: 10 }) // 90% decrease
    })
    expect(result.current.flashType).toBe('warning')
  })

  it('auto-resets to "none" after FLASH_ANIMATION_MS (1100ms)', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 10 },
    })
    act(() => {
      rerender({ value: 100 })
    })
    expect(result.current.flashType).toBe('info')

    act(() => {
      vi.advanceTimersByTime(1_100)
    })
    expect(result.current.flashType).toBe('none')
  })

  it('cooldown prevents immediate re-flash', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 10 },
    })
    // First flash
    act(() => {
      rerender({ value: 100 })
    })
    expect(result.current.flashType).toBe('info')

    // Auto-reset after animation
    act(() => {
      vi.advanceTimersByTime(1_100)
    })
    expect(result.current.flashType).toBe('none')

    // Second change within cooldown (default 5000ms) — no flash
    act(() => {
      vi.advanceTimersByTime(1_000) // 2100ms total — still within 5000ms cooldown
      rerender({ value: 200 })
    })
    expect(result.current.flashType).toBe('none')
  })

  it('allows flash after cooldown expires', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { cooldown: 1_000 }),
      { initialProps: { value: 10 } }
    )
    act(() => {
      rerender({ value: 100 })
    })
    expect(result.current.flashType).toBe('info')

    act(() => {
      vi.advanceTimersByTime(1_100) // past animation
    })
    act(() => {
      vi.advanceTimersByTime(500) // total 1600ms — past 1000ms cooldown
      rerender({ value: 200 })
    })
    expect(result.current.flashType).toBe('info')
  })

  it('resetFlash sets flashType back to "none"', () => {
    const { result, rerender } = renderHook(({ value }) => useCardFlash(value), {
      initialProps: { value: 5 },
    })
    act(() => {
      rerender({ value: 50 })
    })
    expect(result.current.flashType).toBe('info')

    act(() => {
      result.current.resetFlash()
    })
    expect(result.current.flashType).toBe('none')
  })
})
