import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useMissionSuggestionsTimer } from '../useMissionSuggestionsTimer'

const AUTO_COLLAPSE_SECONDS = 20
const COUNTDOWN_TICK_MS = 1000
const TOTAL_COUNTDOWN_MS = AUTO_COLLAPSE_SECONDS * COUNTDOWN_TICK_MS
const FIRST_TICK_MS = COUNTDOWN_TICK_MS
const PRE_FINAL_TICK_MS = TOTAL_COUNTDOWN_MS - COUNTDOWN_TICK_MS
const FIVE_SECONDS_MS = 5 * COUNTDOWN_TICK_MS
const REMAINING_AFTER_FIVE_SECONDS_MS = TOTAL_COUNTDOWN_MS - FIVE_SECONDS_MS

interface TimerHookProps {
  minimized: boolean
  hasSuggestions: boolean
  onAutoCollapse: () => void
}

function renderTimerHook(initialProps: TimerHookProps) {
  return renderHook((props: TimerHookProps) => useMissionSuggestionsTimer(props), {
    initialProps,
  })
}

describe('useMissionSuggestionsTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps handleMouseLeave stable when onAutoCollapse changes', () => {
    const onAutoCollapseA = vi.fn()
    const onAutoCollapseB = vi.fn()
    const { result, rerender } = renderTimerHook({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: onAutoCollapseA,
    })

    const initialHandleMouseLeave = result.current.handleMouseLeave

    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: onAutoCollapseB,
    })

    expect(result.current.handleMouseLeave).toBe(initialHandleMouseLeave)
  })

  it('calls onAutoCollapse when the countdown reaches zero', () => {
    const onAutoCollapse = vi.fn()
    renderTimerHook({ minimized: false, hasSuggestions: true, onAutoCollapse })

    act(() => {
      vi.advanceTimersByTime(TOTAL_COUNTDOWN_MS)
    })

    expect(onAutoCollapse).toHaveBeenCalledTimes(1)
  })

  it('resets the countdown when minimized toggles', () => {
    const onAutoCollapse = vi.fn()
    const { result, rerender } = renderTimerHook({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse,
    })

    act(() => {
      vi.advanceTimersByTime(FIRST_TICK_MS)
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 1)

    rerender({ minimized: true, hasSuggestions: true, onAutoCollapse })
    rerender({ minimized: false, hasSuggestions: true, onAutoCollapse })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS)
  })

  it('pauses on mouse enter and resumes on mouse leave', () => {
    const onAutoCollapse = vi.fn()
    const { result } = renderTimerHook({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse,
    })

    act(() => {
      vi.advanceTimersByTime(FIVE_SECONDS_MS)
    })

    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)

    act(() => {
      result.current.handleMouseEnter()
      vi.advanceTimersByTime(TOTAL_COUNTDOWN_MS)
    })

    expect(onAutoCollapse).not.toHaveBeenCalled()
    expect(result.current.countdown).toBe(AUTO_COLLAPSE_SECONDS - 5)

    act(() => {
      result.current.handleMouseLeave()
      vi.advanceTimersByTime(REMAINING_AFTER_FIVE_SECONDS_MS)
    })

    expect(onAutoCollapse).toHaveBeenCalledTimes(1)
  })

  it('uses the latest onAutoCollapse callback from the ref', () => {
    const onAutoCollapseA = vi.fn()
    const onAutoCollapseB = vi.fn()
    const { rerender } = renderTimerHook({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: onAutoCollapseA,
    })

    act(() => {
      vi.advanceTimersByTime(PRE_FINAL_TICK_MS)
    })

    rerender({
      minimized: false,
      hasSuggestions: true,
      onAutoCollapse: onAutoCollapseB,
    })

    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_TICK_MS)
    })

    expect(onAutoCollapseA).not.toHaveBeenCalled()
    expect(onAutoCollapseB).toHaveBeenCalledTimes(1)
  })
})
