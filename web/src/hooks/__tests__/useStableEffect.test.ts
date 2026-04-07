/**
 * Tests for useStableEffect hook.
 *
 * Covers:
 * - Skips effect when fingerprint hasn't changed
 * - Runs effect when fingerprint changes
 * - Runs cleanup before re-firing effect
 * - Handles various dep types (null, undefined, arrays, objects, Dates, functions)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStableEffect } from '../useStableEffect'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useStableEffect', () => {
  it('fires effect on initial render', () => {
    const effectFn = vi.fn()
    renderHook(() => useStableEffect(effectFn, ['value1']))

    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it('does not re-fire when deps are reference-different but value-same', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: ['hello', 42] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    // New array with same values — different reference
    rerender({ deps: ['hello', 42] })

    // Should NOT re-fire because fingerprint is identical
    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it('re-fires when dep values actually change', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: ['a'] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    rerender({ deps: ['b'] })
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it('handles null and undefined deps', () => {
    const effectFn = vi.fn()
    renderHook(() => useStableEffect(effectFn, [null, undefined]))

    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it('treats arrays with same length as stable', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: [[1, 2, 3]] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    // New array with same length — fingerprint is "[3]"
    rerender({ deps: [[4, 5, 6]] })
    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it('detects array length changes', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: [[1, 2]] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    rerender({ deps: [[1, 2, 3]] })
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it('treats functions as stable (always "fn")', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: [() => 1] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    // New function reference — fingerprint should still be "fn"
    rerender({ deps: [() => 2] })
    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it('detects Date changes', () => {
    const effectFn = vi.fn()
    const date1 = new Date('2025-01-01')
    const date2 = new Date('2025-06-15')

    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: [date1] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    rerender({ deps: [date2] })
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it('runs cleanup function when re-firing effect', () => {
    const cleanup = vi.fn()
    const effectFn = vi.fn(() => cleanup)

    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: ['a'] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()

    rerender({ deps: ['b'] })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it('runs cleanup on unmount', () => {
    const cleanup = vi.fn()
    const effectFn = vi.fn(() => cleanup)

    const { unmount } = renderHook(() => useStableEffect(effectFn, ['stable']))

    expect(effectFn).toHaveBeenCalledTimes(1)
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('handles objects by serializing them', () => {
    const effectFn = vi.fn()
    const { rerender } = renderHook(
      ({ deps }) => useStableEffect(effectFn, deps),
      { initialProps: { deps: [{ a: 1, b: 2 }] as readonly unknown[] } },
    )

    expect(effectFn).toHaveBeenCalledTimes(1)

    // Same values, new reference
    rerender({ deps: [{ a: 1, b: 2 }] })
    expect(effectFn).toHaveBeenCalledTimes(1)

    // Different values
    rerender({ deps: [{ a: 1, b: 3 }] })
    expect(effectFn).toHaveBeenCalledTimes(2)
  })
})
