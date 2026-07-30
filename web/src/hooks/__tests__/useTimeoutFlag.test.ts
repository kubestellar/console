/**
 * useTimeoutFlag / useConditionalTimeout — timer behavior used by CardWrapper.
 *
 * Run from web/:  npm run test:card-wrapper
 * (Do not run npx vitest from repo root — that skips vite.config.ts jsdom + @/ aliases.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimeoutFlag, useConditionalTimeout } from '../useTimeoutFlag'

const FLAG_DELAY_MS = 50
const CONDITIONAL_DELAY_MS = 80

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useTimeoutFlag', () => {
  it('starts false then becomes true after delay', () => {
    const { result } = renderHook(() => useTimeoutFlag(FLAG_DELAY_MS))

    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(FLAG_DELAY_MS)
    })

    expect(result.current).toBe(true)
  })

  it('returns true immediately when skip is true', () => {
    const { result } = renderHook(() => useTimeoutFlag(FLAG_DELAY_MS, true))

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(FLAG_DELAY_MS * 2)
    })

    expect(result.current).toBe(true)
  })

  it('does not flip true before delay elapses', () => {
    const { result } = renderHook(() => useTimeoutFlag(FLAG_DELAY_MS))

    act(() => {
      vi.advanceTimersByTime(FLAG_DELAY_MS - 1)
    })

    expect(result.current).toBe(false)
  })
})

describe('useConditionalTimeout', () => {
  it('stays false while condition is false', () => {
    const { result } = renderHook(() => useConditionalTimeout(false, CONDITIONAL_DELAY_MS))

    act(() => {
      vi.advanceTimersByTime(CONDITIONAL_DELAY_MS * 2)
    })

    expect(result.current).toBe(false)
  })

  it('becomes true after delay when condition is true', () => {
    const { result } = renderHook(() => useConditionalTimeout(true, CONDITIONAL_DELAY_MS))

    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(CONDITIONAL_DELAY_MS)
    })

    expect(result.current).toBe(true)
  })

  it('resets to false when condition turns off', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useConditionalTimeout(active, CONDITIONAL_DELAY_MS),
      { initialProps: { active: true } },
    )

    act(() => {
      vi.advanceTimersByTime(CONDITIONAL_DELAY_MS)
    })
    expect(result.current).toBe(true)

    rerender({ active: false })
    expect(result.current).toBe(false)
  })
})
