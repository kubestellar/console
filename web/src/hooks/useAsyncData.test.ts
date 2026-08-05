import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncData } from './useAsyncData'

describe('useAsyncData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with initialData when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue('done')
    const { result } = renderHook(() =>
      useAsyncData(fetcher, [], { initialData: 'seed', enabled: false }),
    )

    expect(result.current.data).toBe('seed')
    expect(result.current.error).toBeNull()
  })

  it('defaults data to null when no initialData is provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(null)
    const { result } = renderHook(() => useAsyncData(fetcher, [], { enabled: false }))
    expect(result.current.data).toBeNull()
  })

  it('runs the fetcher on mount and updates data on success', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2, 3] })
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual({ items: [1, 2, 3] })
    expect(result.current.error).toBeNull()
  })

  it('captures error message from Error instances', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.data).toBeNull()
  })

  it('stringifies non-Error rejections', async () => {
    const fetcher = vi.fn().mockRejectedValue('nope')
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('nope')
  })

  it('skips auto-fetch when enabled is false', () => {
    const fetcher = vi.fn().mockResolvedValue('x')
    const { result } = renderHook(() =>
      useAsyncData(fetcher, [], { enabled: false, initialData: 'seed' }),
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('seed')
  })

  it('refetch triggers a new fetch and resolves', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')

    const { result } = renderHook(() => useAsyncData(fetcher, []))
    await waitFor(() => expect(result.current.data).toBe('first'))

    await act(async () => {
      await result.current.refetch()
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe('second')
  })

  it('ignores stale success when a newer run started (cancellation)', async () => {
    let resolveFirst: (v: string) => void = () => {}
    const first = new Promise<string>((res) => {
      resolveFirst = res
    })
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce('second')

    const { result } = renderHook(() => useAsyncData(fetcher, []))
    // Kick off refetch before the first resolves; this should cancel the first.
    await act(async () => {
      const p = result.current.refetch()
      resolveFirst('first-late')
      await p
    })
    await waitFor(() => expect(result.current.data).toBe('second'))
    expect(result.current.data).not.toBe('first-late')
  })

  it('does not update state after unmount', async () => {
    let resolveFn: (v: string) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<string>((res) => {
          resolveFn = res
        }),
    )
    const { result, unmount } = renderHook(() => useAsyncData(fetcher, []))
    expect(result.current.loading).toBe(true)
    unmount()
    resolveFn('late')
    // Give the microtask queue a chance to run
    await Promise.resolve()
    // No assertion errors / warnings should occur; data stays null.
    expect(result.current.data).toBeNull()
  })
})
