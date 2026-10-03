import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import './namespaces.setup'
import { useNamespaceStats } from '../namespaces'

describe('useNamespaceStats', () => {
  it('returns empty stats when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaceStats())

    expect(result.current.stats).toEqual([])
  })

  it('returns namespace stats from API after fetch resolves', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'production', status: 'Pending', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'pod-4', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '7d' },
      { name: 'pod-5', namespace: 'monitoring', status: 'Failed', ready: '0/1', restarts: 5, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBe(2)

    const prodStats = result.current.stats.find(s => s.name === 'production')
    expect(prodStats).toBeDefined()
    expect(prodStats!.podCount).toBe(3)
    expect(prodStats!.runningPods).toBe(2)
    expect(prodStats!.pendingPods).toBe(1)

    const monStats = result.current.stats.find(s => s.name === 'monitoring')
    expect(monStats).toBeDefined()
    expect(monStats!.podCount).toBe(2)
    expect(monStats!.failedPods).toBe(1)
  })

  it('sorts stats by pod count descending', async () => {
    const fakePods = [
      { name: 'pod-1', namespace: 'small', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-4', namespace: 'large', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats[0].name).toBe('large')
    expect(result.current.stats[1].name).toBe('small')
  })

  it('falls back to demo stats on API failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression-preventing tests ---

  it('counts CrashLoopBackOff pods as failed', async () => {
    const fakePods = [
      { name: 'crash-pod', namespace: 'ns1', status: 'CrashLoopBackOff', ready: '0/1', restarts: 42, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.failedPods).toBe(1)
    expect(ns1!.runningPods).toBe(0)
    expect(ns1!.pendingPods).toBe(0)
  })

  it('counts Error pods as failed', async () => {
    const fakePods = [
      { name: 'err-pod', namespace: 'ns1', status: 'Error', ready: '0/1', restarts: 0, age: '1h' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.failedPods).toBe(1)
  })

  it('assigns pods with no namespace to "default"', async () => {
    const fakePods = [
      { name: 'orphan-pod', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const defaultStats = result.current.stats.find(s => s.name === 'default')
    expect(defaultStats).toBeDefined()
    expect(defaultStats!.podCount).toBe(1)
  })

  it('handles unknown pod status (neither Running, Pending, nor Failed variants)', async () => {
    const fakePods = [
      { name: 'term-pod', namespace: 'ns1', status: 'Terminating', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'succ-pod', namespace: 'ns1', status: 'Succeeded', ready: '0/1', restarts: 0, age: '2h' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const ns1 = result.current.stats.find(s => s.name === 'ns1')
    expect(ns1).toBeDefined()
    expect(ns1!.podCount).toBe(2)
    // Neither Running, Pending, nor in the Failed group
    expect(ns1!.runningPods).toBe(0)
    expect(ns1!.pendingPods).toBe(0)
    expect(ns1!.failedPods).toBe(0)
  })

  it('handles empty pods array without error', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles null pods field gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: null }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('demo fallback stats have consistent structure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const stat of result.current.stats) {
      expect(stat.name).toBeTruthy()
      expect(typeof stat.podCount).toBe('number')
      expect(typeof stat.runningPods).toBe('number')
      expect(typeof stat.pendingPods).toBe('number')
      expect(typeof stat.failedPods).toBe('number')
      // podCount should equal sum of sub-counts plus "other" status pods
      expect(stat.podCount).toBeGreaterThanOrEqual(
        stat.runningPods + stat.pendingPods + stat.failedPods,
      )
    }
  })

  it('demo fallback stats are sorted by pod count descending', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (let i = 1; i < result.current.stats.length; i++) {
      expect(result.current.stats[i].podCount).toBeLessThanOrEqual(
        result.current.stats[i - 1].podCount,
      )
    }
  })

  it('refetch triggers a new API call', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('encodes cluster name in API URL', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    renderHook(() => useNamespaceStats('cluster/with-special'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const urlArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(urlArg).toContain('cluster%2Fwith-special')
  })

  it('fetches with limit=1000 query parameter', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const urlArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(urlArg).toContain('limit=1000')
  })

  it('correctly aggregates mixed statuses across multiple namespaces', async () => {
    const fakePods = [
      { name: 'p1', namespace: 'alpha', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'p2', namespace: 'alpha', status: 'Pending', ready: '0/1', restarts: 0, age: '1m' },
      { name: 'p3', namespace: 'alpha', status: 'Failed', ready: '0/1', restarts: 0, age: '1h' },
      { name: 'p4', namespace: 'beta', status: 'Running', ready: '1/1', restarts: 0, age: '2d' },
      { name: 'p5', namespace: 'beta', status: 'CrashLoopBackOff', ready: '0/1', restarts: 99, age: '3h' },
      { name: 'p6', namespace: 'gamma', status: 'Error', ready: '0/1', restarts: 0, age: '30m' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaceStats('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const EXPECTED_NS_COUNT = 3
    expect(result.current.stats.length).toBe(EXPECTED_NS_COUNT)

    const alpha = result.current.stats.find(s => s.name === 'alpha')!
    expect(alpha.podCount).toBe(3)
    expect(alpha.runningPods).toBe(1)
    expect(alpha.pendingPods).toBe(1)
    expect(alpha.failedPods).toBe(1)

    const beta = result.current.stats.find(s => s.name === 'beta')!
    expect(beta.podCount).toBe(2)
    expect(beta.runningPods).toBe(1)
    expect(beta.failedPods).toBe(1) // CrashLoopBackOff counts as failed

    const gamma = result.current.stats.find(s => s.name === 'gamma')!
    expect(gamma.podCount).toBe(1)
    expect(gamma.failedPods).toBe(1) // Error counts as failed
  })
})
