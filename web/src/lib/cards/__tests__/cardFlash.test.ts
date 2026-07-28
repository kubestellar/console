/**
 * Tests for useCardFlash hook.
 *
 * Validates threshold, cooldown, direction (increase vs decrease),
 * auto-reset, and the resetFlash callback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import {
  useCardFlash,
  DEFAULT_FLASH_THRESHOLD_RATIO,
  DEFAULT_FLASH_COOLDOWN_MS,
} from '../cardFlash'
import { FLASH_ANIMATION_MS } from '../../constants/network'

describe('useCardFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Anchor Date.now() so cooldown math is deterministic.
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not flash on initial render', () => {
    const { result } = renderHook(() => useCardFlash(10))
    expect(result.current.flashType).toBe('none')
  })

  it('exposes default threshold and cooldown constants', () => {
    expect(DEFAULT_FLASH_THRESHOLD_RATIO).toBe(0.1)
    expect(DEFAULT_FLASH_COOLDOWN_MS).toBe(5_000)
  })

  it('flashes info when value increases past default 10% threshold', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    expect(result.current.flashType).toBe('none')

    rerender({ v: 120 }) // +20%
    expect(result.current.flashType).toBe('info')
  })

  it('flashes info when value decreases past default 10% threshold', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 80 }) // -20%
    expect(result.current.flashType).toBe('info')
  })

  it('does not flash when change is below threshold', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 105 }) // +5%, below default 10%
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when value is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 42 } },
    )
    rerender({ v: 42 })
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when value is zero', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 5 } },
    )
    rerender({ v: 0 })
    expect(result.current.flashType).toBe('none')
  })

  it('uses increaseType when value goes up', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v, { increaseType: 'error', decreaseType: 'info' }),
      { initialProps: { v: 10 } },
    )
    rerender({ v: 100 })
    expect(result.current.flashType).toBe('error')
  })

  it('uses decreaseType when value goes down', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v, { increaseType: 'error', decreaseType: 'warning' }),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 10 })
    expect(result.current.flashType).toBe('warning')
  })

  it('respects a custom threshold (higher threshold suppresses small change)', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v, { threshold: 0.5 }),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 120 }) // +20% < 50%
    expect(result.current.flashType).toBe('none')

    rerender({ v: 200 }) // +67% >= 50% (compared against prev 120)
    expect(result.current.flashType).toBe('info')
  })

  it('auto-resets flashType to none after FLASH_ANIMATION_MS', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 200 })
    expect(result.current.flashType).toBe('info')

    // Just before animation ends — still flashing.
    act(() => {
      vi.advanceTimersByTime(FLASH_ANIMATION_MS - 1)
    })
    expect(result.current.flashType).toBe('info')

    // At/after animation end — resets to none.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.flashType).toBe('none')
  })

  it('enforces cooldown: a second big change within cooldown does not flash', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 200 })
    expect(result.current.flashType).toBe('info')

    // Let the auto-reset run so flashType returns to 'none'.
    act(() => {
      vi.advanceTimersByTime(FLASH_ANIMATION_MS)
    })
    expect(result.current.flashType).toBe('none')

    // Still within default 5s cooldown from the first flash.
    rerender({ v: 400 })
    expect(result.current.flashType).toBe('none')
  })

  it('allows a new flash once cooldown has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v, { cooldown: 1_000 }),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 200 })
    expect(result.current.flashType).toBe('info')

    // Advance past animation reset and the custom 1s cooldown.
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.flashType).toBe('none')

    rerender({ v: 400 })
    expect(result.current.flashType).toBe('info')
  })

  it('resetFlash clears an active flash immediately', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 200 })
    expect(result.current.flashType).toBe('info')

    act(() => {
      result.current.resetFlash()
    })
    expect(result.current.flashType).toBe('none')
  })

  it('returns a stable resetFlash reference across renders', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    const first = result.current.resetFlash
    rerender({ v: 101 }) // sub-threshold, still re-renders
    expect(result.current.resetFlash).toBe(first)
  })

  it('does not throw when the auto-reset timer fires after unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ v }) => useCardFlash(v),
      { initialProps: { v: 100 } },
    )
    rerender({ v: 200 })
    expect(result.current.flashType).toBe('info')

    unmount()

    // Advancing timers after unmount should not throw.
    act(() => {
      vi.advanceTimersByTime(FLASH_ANIMATION_MS + 100)
    })
  })
})
