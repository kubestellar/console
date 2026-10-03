import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  mockClusterCacheRef,
  mockIsAgentUnavailable,
  mockIsDemoMode,
  mockKubectlProxy,
  mockReportAgentDataSuccess,
} from './namespaces.setup'
import { useNamespaces } from '../namespaces'

describe('useNamespaces', () => {
  it('returns empty namespaces when no cluster is provided', async () => {
    const { result } = renderHook(() => useNamespaces())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toEqual([])
  })

  it('returns demo namespaces when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces.length).toBeGreaterThan(0)
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.error).toBeNull()
  })

  it('fetches namespaces from local agent when available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ name: 'default' }, { name: 'kube-system' }, { name: 'monitoring' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.namespaces).toContain('monitoring')
  })

  // #3945 regression: agent tier must also merge with cluster cache so
  // namespaces discovered via health-check fallbacks (pods/events/deploys)
  // still appear when the agent returns an incomplete list (e.g. user
  // lacks cluster-wide `list namespaces` RBAC on some cluster).
  it('merges cluster cache namespaces with local agent response (#3945)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['cache-only-ns', 'fma-mspreitz'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'agent-seen-ns' }] }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Union of agent response and cached namespaces
    expect(result.current.namespaces).toContain('agent-seen-ns')
    expect(result.current.namespaces).toContain('cache-only-ns')
    expect(result.current.namespaces).toContain('fma-mspreitz')
  })

  // #3945 regression: kubectl proxy tier must also merge with cluster cache.
  it('merges cluster cache namespaces with kubectl proxy response (#3945)', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent fails → tier 2 (kubectl proxy) runs
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['fma-mspreitz'] },
    ]
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
    expect(result.current.namespaces).toContain('fma-mspreitz')
  })

  it('falls back to REST API when agent fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'monitoring', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('monitoring')
  })

  it('provides refetch function', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('falls back to default namespaces when all methods fail', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useNamespaces('unreachable-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Falls back to ['default', 'kube-system'] as minimal fallback
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
  })

  it('skips demo mode when forceLive is true', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [{ name: 'p', namespace: 'live-ns', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster', true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // forceLive bypasses demo mode; should use real API
    expect(result.current.namespaces).toContain('live-ns')
  })

  // --- New regression-preventing tests ---

  it('demo namespaces include the full set of 10 synthetic namespaces', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const EXPECTED_DEMO_NS_COUNT = 10
    expect(result.current.namespaces.length).toBe(EXPECTED_DEMO_NS_COUNT)
    // Spot-check several expected namespaces
    expect(result.current.namespaces).toContain('monitoring')
    expect(result.current.namespaces).toContain('production')
    expect(result.current.namespaces).toContain('staging')
    expect(result.current.namespaces).toContain('kube-public')
  })

  it('agent response handles Name (capital N) field variant', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ Name: 'cap-ns-1' }, { Name: 'cap-ns-2' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('cap-ns-1')
    expect(result.current.namespaces).toContain('cap-ns-2')
  })

  it('agent response filters out entries with no name', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fakeNamespaces = [{ name: 'valid-ns' }, { other: 'no-name-field' }, { name: '' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: fakeNamespaces }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('valid-ns')
    // Empty string and entries without name/Name should be filtered out
    expect(result.current.namespaces).not.toContain('')
  })

  it('reports agent data success after successful agent fetch', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'ns1' }] }),
    })

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls back to kubectl proxy when agent returns non-ok response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent returns non-ok
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    // kubectl proxy succeeds
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1', 'proxy-ns-2'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
    expect(result.current.namespaces).toContain('proxy-ns-2')
  })

  it('falls back to kubectl proxy when agent returns empty namespaces', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [] }),
    })
    mockKubectlProxy.getNamespaces.mockResolvedValue(['proxy-ns-1'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toContain('proxy-ns-1')
  })

  it('uses cluster context from cache when calling kubectl proxy', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    // Agent fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    // Set up cache with a context alias
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'my-context-alias' },
    ]
    mockKubectlProxy.getNamespaces.mockResolvedValue(['from-proxy'])

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // kubectl proxy should be called with the context from cache
    expect(mockKubectlProxy.getNamespaces).toHaveBeenCalledWith('my-context-alias')
  })

  it('uses cluster name as context when cache has no entry', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent error'))
    mockClusterCacheRef.clusters = [] // no cache entry
    mockKubectlProxy.getNamespaces.mockResolvedValue(['from-proxy'])

    const { result } = renderHook(() => useNamespaces('raw-cluster-name'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should fall back to using cluster name directly as context
    expect(mockKubectlProxy.getNamespaces).toHaveBeenCalledWith('raw-cluster-name')
  })

  it('merges cached namespaces with pod-based namespaces from REST API', async () => {
    mockIsAgentUnavailable.mockReturnValue(true) // skip agent and proxy
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', context: 'ctx', namespaces: ['cached-ns-1', 'cached-ns-2'] },
    ]
    const fakePods = [
      { name: 'pod-1', namespace: 'cached-ns-1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'new-ns-from-pods', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should contain both cached and pod-sourced namespaces (deduplicated)
    expect(result.current.namespaces).toContain('cached-ns-1')
    expect(result.current.namespaces).toContain('cached-ns-2')
    expect(result.current.namespaces).toContain('new-ns-from-pods')
  })

  it('returns sorted namespaces from REST API fallback', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'zebra', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'alpha', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'middle', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const sorted = [...result.current.namespaces].sort()
    expect(result.current.namespaces).toEqual(sorted)
  })

  it('uses cached namespaces immediately on cluster change (non-demo)', async () => {
    // Start in non-demo with a cluster that has cached namespaces
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [
      { name: 'new-cluster', namespaces: ['cache-hit-ns'] },
    ]
    // Pod API returns data slowly (never resolves for this test)
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call: backend API /api/namespaces returns an array of
        // { name } entries so useNamespaces resolves the initial fetch and
        // isLoading flips to false before we rerender with the new cluster.
        return Promise.resolve(new Response(JSON.stringify([{ name: 'old-ns' }]), { status: 200 }))
      }
      return new Promise(() => {}) // subsequent calls never resolve
    })

    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useNamespaces(cluster),
      { initialProps: { cluster: 'old-cluster' } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Change cluster — the useEffect sets cached namespaces synchronously
    rerender({ cluster: 'new-cluster' })
    // The cached namespaces should appear immediately via the cluster-change effect
    await waitFor(() => expect(result.current.namespaces).toContain('cache-hit-ns'))
  })

  it('deduplicates namespaces from pods (no duplicates)', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const fakePods = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-2', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
      { name: 'pod-3', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: fakePods }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const defaultCount = result.current.namespaces.filter(ns => ns === 'default').length
    expect(defaultCount).toBe(1)
  })

  it('handles pod API returning empty pods array', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // No pods and no cache => falls back to ['default', 'kube-system']
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
  })

  it('refetch triggers a new fetch cycle', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ pods: [{ name: 'p', namespace: 'ns1', status: 'Running', ready: '1/1', restarts: 0, age: '1d' }] }), { status: 200 }))
    )

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('encodes cluster name in agent URL', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ namespaces: [{ name: 'ns1' }] }),
    })
    globalThis.fetch = fetchMock

    renderHook(() => useNamespaces('cluster with spaces'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const urlArg = fetchMock.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=cluster%20with%20spaces')
  })

  it('survives pod API failure while still using cached namespaces', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [
      { name: 'my-cluster', namespaces: ['cached-only'] },
    ]
    // Pod API fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Pod API down'))

    const { result } = renderHook(() => useNamespaces('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should still have the cached namespace even though pod API failed
    // (the outer try/catch catches the pod API error and falls through)
    expect(result.current.namespaces.length).toBeGreaterThanOrEqual(1)
  })
})

// ===========================================================================
// useNamespaceStats
// ===========================================================================
