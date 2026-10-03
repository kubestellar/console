import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { importHooks, installBrokenIDBMock } from './hooks.setup'

describe('useIndexedData', () => {
  it('starts in loading state with defaultValue', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'test-data', defaultValue: [] })
    )
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])
    expect(result.current.lastSaved).toBeNull()
  })

  it('transitions to not-loading after initial load', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'load-test', defaultValue: 'default' })
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('save() updates data and lastSaved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'save-test', defaultValue: [] as number[] })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save([1, 2, 3])
    })

    expect(result.current.data).toEqual([1, 2, 3])
    expect(result.current.lastSaved).not.toBeNull()
    expect(typeof result.current.lastSaved).toBe('number')
  })

  it('clear() resets to defaultValue and nulls lastSaved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'clear-test', defaultValue: 'empty' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('some data')
    })
    expect(result.current.data).toBe('some data')

    await act(async () => {
      await result.current.clear()
    })

    expect(result.current.data).toBe('empty')
    expect(result.current.lastSaved).toBeNull()
  })

  it('isStale is false when no data saved', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'stale-none', defaultValue: null })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isStale).toBe(false)
  })

  it('isStale is false immediately after save (within maxAge)', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'stale-fresh', defaultValue: null, maxAge: 60_000 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('fresh')
    })

    expect(result.current.isStale).toBe(false)
  })

  it('isStale is true when lastSaved exceeds maxAge', async () => {
    const VERY_SHORT_MAX_AGE_MS = 1
    const { useIndexedData } = await importHooks()

    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result, rerender } = renderHook(() =>
      useIndexedData({ key: 'stale-old', defaultValue: null, maxAge: VERY_SHORT_MAX_AGE_MS })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save('old data')
    })

    // Advance time past maxAge and re-render to pick up new Date.now()
    const STALENESS_ADVANCE_MS = 100
    vi.spyOn(Date, 'now').mockReturnValue(now + STALENESS_ADVANCE_MS)

    rerender()

    // isStale is computed on every render: lastSaved !== null && Date.now() - lastSaved > maxAge
    expect(result.current.isStale).toBe(true)
  })

  it('uses default maxAge of 5 minutes when not specified', async () => {
    const { useIndexedData } = await importHooks()

    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result, rerender } = renderHook(() =>
      useIndexedData({ key: 'default-maxage', defaultValue: 0 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save(42)
    })

    // Not stale at 4 minutes
    const FOUR_MINUTES_MS = 4 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now + FOUR_MINUTES_MS)
    rerender()
    expect(result.current.isStale).toBe(false)

    // Stale at 6 minutes
    const SIX_MINUTES_MS = 6 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now + SIX_MINUTES_MS)
    rerender()
    expect(result.current.isStale).toBe(true)
  })

  it('handles indexedDB errors during load gracefully', async () => {
    installBrokenIDBMock()

    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'err-load', defaultValue: 'fallback' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBe('fallback')
  })

  it('handles indexedDB errors during save gracefully', async () => {
    const { useIndexedData } = await importHooks()
    const { result } = renderHook(() =>
      useIndexedData({ key: 'err-save', defaultValue: '' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Now break IDB for save
    installBrokenIDBMock()

    // save should not throw — it sets local state even if IDB fails
    await act(async () => {
      await result.current.save('new-data')
    })

    // The in-memory state should still update
    expect(result.current.data).toBe('new-data')
  })
})

// ===========================================================================
// useTrendHistory
// ===========================================================================

describe('useTrendHistory', () => {
  it('starts with empty history', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-empty' })
    )
    expect(result.current.history).toEqual([])
  })

  it('addPoint appends a data point', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-add' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    expect(result.current.history).toEqual([{ time: '12:00', cpu: 10 }])
  })

  it('skips duplicate consecutive points with same numeric values', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-dedup' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    await act(async () => {
      // Same cpu value, different time — should be skipped
      await result.current.addPoint({ time: '12:01', cpu: 10 })
    })

    expect(result.current.history).toHaveLength(1)
  })

  it('adds point when numeric values differ from last', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-diff' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 10 })
    })

    await act(async () => {
      await result.current.addPoint({ time: '12:01', cpu: 20 })
    })

    expect(result.current.history).toHaveLength(2)
  })

  it('trims history to maxPoints', async () => {
    const MAX_POINTS = 3
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-trim', maxPoints: MAX_POINTS })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Add 5 points with different values
    const TOTAL_POINTS = 5
    for (let i = 0; i < TOTAL_POINTS; i++) {
      await act(async () => {
        await result.current.addPoint({ time: `t${i}`, value: i })
      })
    }

    // Should only have the last 3
    expect(result.current.history).toHaveLength(MAX_POINTS)
    expect(result.current.history[0]).toEqual({ time: 't2', value: 2 })
    expect(result.current.history[2]).toEqual({ time: 't4', value: 4 })
  })

  it('clear() resets history to empty', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-clear' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.addPoint({ time: '12:00', cpu: 5 })
    })
    expect(result.current.history).toHaveLength(1)

    await act(async () => {
      await result.current.clear()
    })
    expect(result.current.history).toEqual([])
  })

  it('uses default maxPoints of 50', async () => {
    const { useTrendHistory } = await importHooks()
    const { result } = renderHook(() =>
      useTrendHistory({ key: 'trend-default-max' })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Add 55 points
    const TOTAL_POINTS = 55
    const DEFAULT_MAX_POINTS = 50
    for (let i = 0; i < TOTAL_POINTS; i++) {
      await act(async () => {
        await result.current.addPoint({ time: `t${i}`, value: i })
      })
    }

    expect(result.current.history).toHaveLength(DEFAULT_MAX_POINTS)
  })
})

// ===========================================================================
// getStorageStats
// ===========================================================================
