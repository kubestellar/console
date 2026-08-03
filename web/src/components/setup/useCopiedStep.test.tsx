import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ── Mock the clipboard side-effect ──────────────────────────────────────────
const copyToClipboardMock = vi.fn(async (_text: string) => true)
vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: (t: string) => copyToClipboardMock(t),
}))

import { useCopiedStep } from './useCopiedStep'

const UI_FEEDBACK_TIMEOUT_MS = 2_000

beforeEach(() => {
  vi.useFakeTimers()
  copyToClipboardMock.mockClear()
  copyToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCopiedStep', () => {
  it('initial state has copiedStep === null', () => {
    const { result } = renderHook(() => useCopiedStep())
    expect(result.current.copiedStep).toBeNull()
    expect(typeof result.current.handleCopy).toBe('function')
  })

  it('handleCopy writes text to the clipboard', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('hello', 1)
    })
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
    expect(copyToClipboardMock).toHaveBeenCalledWith('hello')
  })

  it('sets copiedStep to the pressed step key after copying', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('foo', 3)
    })
    expect(result.current.copiedStep).toBe(3)
  })

  it('clears copiedStep after UI_FEEDBACK_TIMEOUT_MS elapses', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('foo', 2)
    })
    expect(result.current.copiedStep).toBe(2)
    await act(async () => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)
    })
    expect(result.current.copiedStep).toBeNull()
  })

  it('does not clear copiedStep before the timeout elapses', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('foo', 2)
    })
    await act(async () => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 1)
    })
    expect(result.current.copiedStep).toBe(2)
  })

  it('successive copies reset the timer (only the most recent step remains)', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('first', 1)
    })
    // Almost expire the first timer
    await act(async () => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 100)
    })
    expect(result.current.copiedStep).toBe(1)

    // Start a second copy — the original timer should be cleared and replaced
    await act(async () => {
      await result.current.handleCopy('second', 2)
    })
    expect(result.current.copiedStep).toBe(2)

    // Advance past the ORIGINAL first-timer expiry; second step should still be shown
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.copiedStep).toBe(2)

    // Advance past the second timer's expiry
    await act(async () => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)
    })
    expect(result.current.copiedStep).toBeNull()
  })

  it('cleanup on unmount cancels the pending timer (no state update after unmount)', async () => {
    const { result, unmount } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('foo', 5)
    })
    expect(result.current.copiedStep).toBe(5)

    // Spy on clearTimeout to prove the unmount effect calls it.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()

    // Advancing timers after unmount is safe — no unhandled errors thrown.
    expect(() => vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)).not.toThrow()
  })

  it('unmount before any copy does not throw (clearTimeout on undefined ref)', () => {
    const { unmount } = renderHook(() => useCopiedStep())
    expect(() => unmount()).not.toThrow()
  })

  it('accepts a stepKey of 0 (falsy but valid)', async () => {
    const { result } = renderHook(() => useCopiedStep())
    await act(async () => {
      await result.current.handleCopy('zero', 0)
    })
    expect(result.current.copiedStep).toBe(0)
  })
})
