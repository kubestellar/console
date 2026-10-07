import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRecentPRs } from './useRecentPRs'

const mockApiGet = vi.fn()

vi.mock('../../../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  RateLimitError: class RateLimitError extends Error {},
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
  }
})

import { RateLimitError } from '../../../lib/api'

describe('useRecentPRs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fetch when hasReleaseNotes is true', () => {
    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: true, isOpen: true, commitHash: 'abc123' }),
    )

    expect(result.current.prsLoading).toBe(false)
    expect(result.current.recentPRs).toEqual([])
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('does not fetch when isOpen is false', () => {
    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: false, commitHash: 'abc123' }),
    )

    expect(result.current.prsLoading).toBe(false)
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('fetches commit date then PRs, filtering to merged PRs after that date', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { commit: { committer: { date: '2026-01-01T00:00:00Z' } } } })
      .mockResolvedValueOnce({
        data: [
          { number: 1, title: 'Old PR', merged_at: '2025-12-01T00:00:00Z' },
          { number: 2, title: 'New PR', merged_at: '2026-02-01T00:00:00Z' },
          { number: 3, title: 'Unmerged PR', merged_at: null },
        ],
      })

    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: 'abc123' }),
    )

    expect(result.current.prsLoading).toBe(true)

    await waitFor(() => expect(result.current.prsLoading).toBe(false))
    expect(result.current.recentPRs).toEqual([
      { number: 2, title: 'New PR', merged_at: '2026-02-01T00:00:00Z' },
    ])
    expect(result.current.prsError).toBeNull()
  })

  it('shows all merged PRs when the commit date lookup fails', async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error('commit not found'))
      .mockResolvedValueOnce({
        data: [{ number: 5, title: 'Some PR', merged_at: '2026-01-01T00:00:00Z' }],
      })

    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: 'deadbeef' }),
    )

    await waitFor(() => expect(result.current.prsLoading).toBe(false))
    expect(result.current.recentPRs).toEqual([
      { number: 5, title: 'Some PR', merged_at: '2026-01-01T00:00:00Z' },
    ])
    expect(result.current.prsError).toBeNull()
  })

  it('skips the commit lookup when commitHash is "unknown"', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [{ number: 7, title: 'PR 7', merged_at: '2026-01-01T00:00:00Z' }],
    })

    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: 'unknown' }),
    )

    await waitFor(() => expect(result.current.prsLoading).toBe(false))
    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(result.current.recentPRs).toHaveLength(1)
  })

  it('sets a friendly error message on RateLimitError', async () => {
    mockApiGet.mockRejectedValueOnce(new RateLimitError('rate limited'))

    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: undefined }),
    )

    await waitFor(() => expect(result.current.prsLoading).toBe(false))
    expect(result.current.prsError).toMatch(/rate limit/i)
    expect(result.current.recentPRs).toEqual([])
  })

  it('sets the error message on a generic network failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: undefined }),
    )

    await waitFor(() => expect(result.current.prsLoading).toBe(false))
    expect(result.current.prsError).toBe('network down')
  })

  it('ignores results if unmounted before the fetch resolves', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => { resolveFetch = resolve }),
    )

    const { result, unmount } = renderHook(() =>
      useRecentPRs({ hasReleaseNotes: false, isOpen: true, commitHash: undefined }),
    )

    expect(result.current.prsLoading).toBe(true)
    unmount()

    resolveFetch({ data: [{ number: 1, title: 'PR', merged_at: '2026-01-01T00:00:00Z' }] })

    // Give the microtask queue a chance to run; state must not have been
    // touched on the unmounted hook (no act() warning, no throw).
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.prsLoading).toBe(true)
  })
})
