import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAsyncData } from '../useAsyncData'

describe('useAsyncData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves data on success', async () => {
    const fetcher = vi.fn().mockResolvedValue('hello')
    const { result } = renderHook(() =>
      useAsyncData(fetcher, []),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBe('hello')
    expect(result.current.error).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sets error on failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'))
    const { result } = renderHook(() =>
      useAsyncData(fetcher, []),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('fetch failed')
  })

  it('uses initialData before first fetch completes', () => {
    const fetcher = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    )
    const { result } = renderHook(() =>
      useAsyncData(fetcher, [], { initialData: 'cached' }),
    )

    expect(result.current.data).toBe('cached')
    expect(result.current.loading).toBe(true)
  })

  it('does not auto-fetch when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue('manual')
    const { result } = renderHook(() =>
      useAsyncData(fetcher, [], { enabled: false }),
    )

    await waitFor(() => {
      expect(fetcher).not.toHaveBeenCalled()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.data).toBe('manual')
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetch returns a promise and cancels the previous in-flight request', async () => {
    let resolveFirst: (value: string) => void = () => {}
    let resolveSecond: (value: string) => void = () => {}
    const fetcher = vi.fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { result } = renderHook(() =>
      useAsyncData(fetcher, [], { enabled: false }),
    )

    let firstPromise: Promise<void> | undefined
    act(() => {
      firstPromise = result.current.refetch()
    })

    await act(async () => {
      const secondPromise = result.current.refetch()
      resolveSecond('second')
      await secondPromise
    })

    await act(async () => {
      resolveFirst('stale-first')
      await firstPromise
    })

    await waitFor(() => {
      expect(result.current.data).toBe('second')
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('ignores stale results after dependencies change when enabled is false', async () => {
    let resolveFetch: (value: string) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { result, rerender } = renderHook(
      ({ dep }) => useAsyncData(fetcher, [dep], { enabled: false }),
      { initialProps: { dep: 'first' } },
    )

    act(() => {
      void result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })

    rerender({ dep: 'second' })
    resolveFetch('late')

    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.data).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ignores stale results after unmount when enabled is false', async () => {
    let resolveFetch: (value: string) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { result, unmount } = renderHook(() =>
      useAsyncData(fetcher, [], { enabled: false }),
    )

    act(() => {
      void result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })

    unmount()
    resolveFetch('late')

    await new Promise((r) => setTimeout(r, 10))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
