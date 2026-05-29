import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMissionSuggestionsTimer } from '../useMissionSuggestionsTimer'

// ---------------------------------------------------------------------------
// Constants (mirror hook internals for assertions)
// ---------------------------------------------------------------------------

const AUTO_COLLAPSE_SECONDS = 20
const COUNTDOWN_TICK_MS = 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(overrides: Partial<Parameters<typeof useMissionSuggestionsTimer>[0]> = {}) {
  const onAutoCollapse = vi.fn()
  const defaultProps = {
    minimized: false,
    hasSuggestions: true,
    onAutoCollapse,
    ...overrides,
  }
  const hookResult = renderHook(
    (props) => useMissionSuggestionsTimer(props),
    { initialProps: defaultProps },
  )
  return { ...hookResult, onAutoCollapse }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMissionSuggestionsTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes countdown at AUTO_COLLAPSE_SECONDS', () => {
    const { result } = setup()
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('decrements countdown every second', () => {
    const { result } = setup()

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 3)
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 3)
  })

  it('calls onAutoCollapse when countdown reaches 0', () => {
    const { result, onAutoCollapse } = setup()

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * AUTO_COLLAPSE_SECONDS)
    })

    expect(onAutoCollapse).toHaveBeenCalledTimes(1)
    // Countdown resets after collapse
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('does NOT reset countdown when onAutoCollapse reference is stable (fix for #16000)', () => {
    // The fix wraps onAutoCollapse in useCallback at the call site so the
    // reference stays stable across re-renders. This test verifies that when
    // the same reference is passed on re-render, the countdown continues
    // uninterrupted (the core guarantee of the fix).
    const stableOnAutoCollapse = vi.fn()

    const { result, rerender } = renderHook(
      (props) => useMissionSuggestionsTimer(props),
      {
        initialProps: {
          minimized: false,
          hasSuggestions: true,
          onAutoCollapse: stableOnAutoCollapse,
        },
      },
    )

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 5)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)

    // Simulate multiple parent re-renders with the SAME stable reference
    // (this is what useCallback(() => setMinimized(true), []) provides)
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: stableOnAutoCollapse,
    })
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: stableOnAutoCollapse,
    })
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: stableOnAutoCollapse,
    })

    // Countdown should NOT have reset — still at 15 (20 - 5)
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)

    // Continue ticking — reaches 0 and triggers collapse
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 15)
    })

    expect(stableOnAutoCollapse).toHaveBeenCalledTimes(1)
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('countdown resets when onAutoCollapse reference changes (demonstrates the original bug)', () => {
    // This test documents the behavior that triggered #16000: if the caller
    // passes a new function reference, the countdown resets. The fix ensures
    // the caller never does this (via useCallback), but the hook itself still
    // has this dependency chain by design.
    const onAutoCollapse1 = vi.fn()
    const onAutoCollapse2 = vi.fn()

    const { result, rerender } = renderHook(
      (props) => useMissionSuggestionsTimer(props),
      {
        initialProps: {
          minimized: false,
          hasSuggestions: true,
          onAutoCollapse: onAutoCollapse1,
        },
      },
    )

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 5)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)

    // Pass a NEW reference (simulates the bug: inline arrow without useCallback)
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: onAutoCollapse2,
    })

    // Countdown resets because startCountdown dependency changed
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('resets countdown when minimized changes from true to false', () => {
    const { result, rerender, onAutoCollapse } = setup({ minimized: true })

    // No countdown while minimized
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 5)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)

    // Expand the panel
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse,
    })

    // Countdown starts fresh at 20
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)

    // Now it ticks
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 3)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 3)
  })

  it('resets countdown when hasSuggestions changes to true', () => {
    const { result, rerender, onAutoCollapse } = setup({ hasSuggestions: false })

    // No countdown without suggestions
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 5)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)

    // Suggestions appear
    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse,
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 2)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 2)
  })

  it('pauses countdown on mouse enter and resumes on mouse leave', () => {
    const { result } = setup()

    // Tick 3 seconds
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 3)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 3)

    // Hover pauses
    act(() => {
      result.current.handleMouseEnter()
    })

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 5)
    })
    // Should still be 17 — no decrement while paused
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 3)

    // Mouse leave resumes
    act(() => {
      result.current.handleMouseLeave()
    })

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 2)
    })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)
  })

  it('does not start countdown when minimized', () => {
    const { result } = setup({ minimized: true })

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 10)
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('does not start countdown when hasSuggestions is false', () => {
    const { result } = setup({ hasSuggestions: false })

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 10)
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('cleans up interval on unmount', () => {
    const { unmount } = setup()

    // Should not throw or leak
    unmount()

    // Advancing timers after unmount should be safe
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS * 30)
    })
  })
})
