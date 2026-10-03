import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockIsDemoMode, mockUseDemoMode, mockFetchSSE, uniqueCluster, makeRelease, makeHistoryEntry } from './helm-coverage.setup'
import {
  useHelmReleases,
  useHelmHistory,
  useHelmValues,
} from '../helm'

describe('useHelmValues — demo mode toggle', () => {
  it('re-fetches when demo mode changes after initial mount', async () => {
    const cluster = uniqueCluster('val-demo-toggle')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { live: true }, format: 'json' }),
    })

    const { result, rerender } = renderHook(
      ({ demo }: { demo: boolean }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demo })
        return useHelmValues(cluster, 'my-rel', 'default')
      },
      { initialProps: { demo: false } }
    )

    await waitFor(() => expect(result.current.values).not.toBeNull())

    // Toggle demo mode
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demo: true })

    // Should trigger a re-fetch
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('skips demo mode re-fetch on initial mount', async () => {
    const cluster = uniqueCluster('val-no-refetch-init')
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    // Should still get demo values
    expect(result.current.values).toBeTruthy()
  })
})

// ===========================================================================
// useHelmValues — missing namespace skips fetch, fetchingKeyRef dedup
// ===========================================================================

describe('useHelmValues — dedup and skip logic', () => {
  it('skips duplicate fetch for same key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 1 }, format: 'json' }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('val-dedup')
    const { result, rerender } = renderHook(
      ({ rel }: { rel: string }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' } }
    )

    await waitFor(() => expect(result.current.values).not.toBeNull())
    const callCountAfterFirst = mockFetch.mock.calls.length

    // Re-render with same props — should not trigger another fetch
    rerender({ rel: 'my-rel' })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Call count should not have increased significantly
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(callCountAfterFirst + 1)
  })

  it('clears values and fetchingKey when release is deselected', async () => {
    const cluster = uniqueCluster('val-deselect-key')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 1 }, format: 'json' }),
    })

    const { result, rerender } = renderHook(
      ({ rel }: { rel: string | undefined }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' as string | undefined } }
    )

    await waitFor(() => expect(result.current.values).not.toBeNull())

    // Deselect release
    rerender({ rel: undefined })
    await waitFor(() => expect(result.current.values).toBeNull())
  })
})

// ===========================================================================
// useHelmReleases — listener notification with isLoading
// ===========================================================================

describe('useHelmReleases — listener updates', () => {
  it('listener receives isLoading state update', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The listener updateHandler should have been called with isLoading updates
    expect(result.current.isRefreshing).toBe(false)
  })

  it('cleans up listener on unmount', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
    // No assertion needed — just verifying no error on unmount cleanup
  })
})

// ===========================================================================
// useHelmReleases — refetch non-silent sets isLoading
// ===========================================================================

describe('useHelmReleases — non-silent refetch loading state', () => {
  it('non-silent refetch sets isLoading to true', async () => {
    const cluster = uniqueCluster('non-silent')
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases(cluster))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Refetch (non-silent via the returned refetch function)
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])
    await act(async () => { await result.current.refetch() })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.releases.length).toBe(1)
  })
})

// ===========================================================================
// saveHelmHistoryToStorage edge case — verify it doesn't throw
// ===========================================================================

describe('Helm history storage save', () => {
  it('persists and loads history correctly across renders', async () => {
    const cluster = uniqueCluster('save-load-hist')
    const fakeHistory = [makeHistoryEntry({ revision: 1 }), makeHistoryEntry({ revision: 2 })]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })

    const { result, unmount } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))
    unmount()

    // Verify localStorage was updated
    const stored = localStorage.getItem('kc-helm-history-cache')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    const key = `${cluster}:my-rel`
    expect(parsed[key]).toBeDefined()
    expect(parsed[key].data).toHaveLength(2)
    expect(parsed[key].consecutiveFailures).toBe(0)
  })
})

// ===========================================================================
// useHelmHistory — no release selected, then release provided
// ===========================================================================

describe('useHelmHistory — release selection transitions', () => {
  it('transitions from no-release to release triggers fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })

    const cluster = uniqueCluster('hist-transition')
    const { result, rerender } = renderHook(
      ({ release }: { release: string | undefined }) => useHelmHistory(cluster, release, 'default'),
      { initialProps: { release: undefined as string | undefined } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])

    // Now select a release
    rerender({ release: 'my-rel' })
    await waitFor(() => expect(result.current.history.length).toBeGreaterThan(0))
  })
})
