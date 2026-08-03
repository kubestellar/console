import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ── Mock the clipboard side-effect ──────────────────────────────────────────
const copyToClipboardMock = vi.fn(async (_text: string) => true)
vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: (t: string) => copyToClipboardMock(t),
}))

import { useCopyFeedback } from './useCopyFeedback'

const UI_FEEDBACK_TIMEOUT_MS = 2_000

beforeEach(() => {
  vi.useFakeTimers()
  copyToClipboardMock.mockClear()
  copyToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCopyFeedback', () => {
  it('initial state has copiedField === null and a stable handleCopy', () => {
    const { result, rerender } = renderHook(() => useCopyFeedback())
    expect(result.current.copiedField).toBeNull()
    const firstHandle = result.current.handleCopy
    rerender()
    // handleCopy is wrapped in useCallback with an empty dep array — reference
    // must be stable across re-renders (safe to pass to memoized children).
    expect(result.current.handleCopy).toBe(firstHandle)
  })

  it('handleCopy writes the value to the clipboard', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('email', 'me@example.com')
    })
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
    expect(copyToClipboardMock).toHaveBeenCalledWith('me@example.com')
  })

  it('sets copiedField to the field name after copying', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('podName', 'my-pod-abc')
    })
    expect(result.current.copiedField).toBe('podName')
  })

  it('clears copiedField after UI_FEEDBACK_TIMEOUT_MS elapses', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('image', 'nginx:latest')
    })
    expect(result.current.copiedField).toBe('image')
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)
    })
    expect(result.current.copiedField).toBeNull()
  })

  it('does not clear copiedField before the timeout elapses', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('image', 'nginx:latest')
    })
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 1)
    })
    expect(result.current.copiedField).toBe('image')
  })

  it('successive copies reset the timer (only the most recent field remains)', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('podName', 'p1')
    })
    // Almost expire the first timer
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 100)
    })
    expect(result.current.copiedField).toBe('podName')

    // Trigger a second copy — the original timer should be cleared and replaced
    act(() => {
      result.current.handleCopy('image', 'nginx:latest')
    })
    expect(result.current.copiedField).toBe('image')

    // Advance past the ORIGINAL first-timer expiry; second field should still be shown
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.copiedField).toBe('image')

    // Advance past the second timer's expiry
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)
    })
    expect(result.current.copiedField).toBeNull()
  })

  it('cleanup on unmount cancels the pending timer', () => {
    const { result, unmount } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('field', 'value')
    })
    expect(result.current.copiedField).toBe('field')

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()

    // Advancing timers after unmount is safe — no unhandled state updates or errors.
    expect(() => vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS)).not.toThrow()
  })

  it('unmount before any copy does not throw (null ref path)', () => {
    const { unmount } = renderHook(() => useCopyFeedback())
    expect(() => unmount()).not.toThrow()
  })

  it('handles empty string field and value', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('', '')
    })
    expect(copyToClipboardMock).toHaveBeenCalledWith('')
    expect(result.current.copiedField).toBe('')
  })

  it('supports the same field being copied twice (re-triggers timer)', () => {
    const { result } = renderHook(() => useCopyFeedback())
    act(() => {
      result.current.handleCopy('sha', 'abc123')
    })
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 1)
    })
    expect(result.current.copiedField).toBe('sha')

    // Re-copy the same field — timer resets, field stays set
    act(() => {
      result.current.handleCopy('sha', 'abc123')
    })
    act(() => {
      vi.advanceTimersByTime(UI_FEEDBACK_TIMEOUT_MS - 1)
    })
    expect(result.current.copiedField).toBe('sha')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.copiedField).toBeNull()
  })
})
