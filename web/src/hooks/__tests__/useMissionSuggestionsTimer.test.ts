/**
 * Tests for useMissionSuggestionsTimer hook.
 *
 * Validates countdown timer behaviour: auto-collapse after 20s,
 * pause on hover, resume on leave, reset on re-show, cleanup on unmount,
 * and stability when onAutoCollapse is stable vs unstable.
 *
 * Run from web/: npx vitest run src/hooks/__tests__/useMissionSuggestionsTimer.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMissionSuggestionsTimer } from '../useMissionSuggestionsTimer'

const AUTO_COLLAPSE_SECONDS = 20
const TICK_MS = 1000

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useMissionSuggestionsTimer', () => {
  it('starts countdown at AUTO_COLLAPSE_SECONDS when not minimized and has suggestions', () => {
    const onAutoCollapse = vi.fn()
    const { result } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('counts down by 1 each second', () => {
    const onAutoCollapse = vi.fn()
    const { result } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * 3) })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 3)
  })

  it('calls onAutoCollapse when countdown reaches zero', () => {
    const onAutoCollapse = vi.fn()
    renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * AUTO_COLLAPSE_SECONDS) })
    expect(onAutoCollapse).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onAutoCollapse before countdown reaches zero', () => {
    const onAutoCollapse = vi.fn()
    renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * (AUTO_COLLAPSE_SECONDS - 1)) })
    expect(onAutoCollapse).not.toHaveBeenCalled()
  })

  it('does NOT start countdown when minimized is true', () => {
    const onAutoCollapse = vi.fn()
    renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: true,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * AUTO_COLLAPSE_SECONDS * 2) })
    expect(onAutoCollapse).not.toHaveBeenCalled()
  })

  it('does NOT start countdown when hasSuggestions is false', () => {
    const onAutoCollapse = vi.fn()
    renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: false,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * AUTO_COLLAPSE_SECONDS * 2) })
    expect(onAutoCollapse).not.toHaveBeenCalled()
  })

  it('handleMouseEnter pauses the countdown', () => {
    const onAutoCollapse = vi.fn()
    const { result } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * 5) })
    const countdownAfter5 = result.current.countdown

    act(() => { result.current.handleMouseEnter() })
    act(() => { vi.advanceTimersByTime(TICK_MS * 10) })

    expect(result.current.countdown).toBe(countdownAfter5)
    expect(onAutoCollapse).not.toHaveBeenCalled()
  })

  it('handleMouseLeave resumes countdown after pause', () => {
    const onAutoCollapse = vi.fn()
    const { result } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { result.current.handleMouseEnter() })
    act(() => { vi.advanceTimersByTime(TICK_MS * 10) })
    expect(onAutoCollapse).not.toHaveBeenCalled()

    act(() => { result.current.handleMouseLeave() })
    act(() => { vi.advanceTimersByTime(TICK_MS * AUTO_COLLAPSE_SECONDS) })
    expect(onAutoCollapse).toHaveBeenCalledTimes(1)
  })

  it('resets countdown when minimized goes false → true → false', () => {
    const onAutoCollapse = vi.fn()
    const { result, rerender } = renderHook(
      ({ minimized }) =>
        useMissionSuggestionsTimer({
          minimized,
          hasSuggestions: true,
          onAutoCollapse,
        }),
      { initialProps: { minimized: false } }
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * 10) })
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 10)

    rerender({ minimized: true })
    rerender({ minimized: false })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('cleans up interval on unmount — onAutoCollapse not called after unmount', () => {
    const onAutoCollapse = vi.fn()
    const { unmount } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * 5) })
    unmount()
    act(() => { vi.advanceTimersByTime(TICK_MS * AUTO_COLLAPSE_SECONDS) })

    expect(onAutoCollapse).not.toHaveBeenCalled()
  })

  it('countdown stays stable across re-renders when onAutoCollapse is stable', () => {
    const onAutoCollapse = vi.fn()
    // stable ref — same function every render
    const { result, rerender } = renderHook(() =>
      useMissionSuggestionsTimer({
        minimized: false,
        hasSuggestions: true,
        onAutoCollapse,
      })
    )

    act(() => { vi.advanceTimersByTime(TICK_MS * 5) })
    const before = result.current.countdown

    // force a re-render
    rerender()

    // countdown should continue from where it was, not reset
    act(() => { vi.advanceTimersByTime(TICK_MS * 2) })
    expect(result.current.countdown).toBe(before - 2)
  })
})
