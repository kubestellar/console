import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
  }
})

import { usePrometheusMetrics } from '../usePrometheusMetrics'

/** Build a mock Prometheus response for a single metric with one pod */
function makePromResponse(podName: string, value: number) {
  return {
    status: 'success' as const,
    data: {
      resultType: 'vector' as const,
      result: [
        {
          metric: { pod: podName },
          value: [Date.now() / 1000, String(value)],
        },
      ],
    },
  }
}

/** Build an empty success response (no data) */
function makeEmptyResponse() {
  return {
    status: 'success' as const,
    data: { resultType: 'vector' as const, result: [] },
  }
}

describe('usePrometheusMetrics', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns initial state with null metrics and no error', () => {
    const { result } = renderHook(() => usePrometheusMetrics(undefined, undefined))
    expect(result.current.metrics).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does not fetch when cluster is undefined', () => {
    renderHook(() => usePrometheusMetrics(undefined, 'ns'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fetch when namespace is undefined', () => {
    renderHook(() => usePrometheusMetrics('cluster-1', undefined))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches all 6 metric queries when cluster and namespace are provided', async () => {
    // Return a valid response for each query
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('vllm-pod-0', 0.5)),
    })

    renderHook(() => usePrometheusMetrics('cluster-1', 'vllm-ns', 60000))

    // 6 parallel metric queries
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6)
    })
  })

  it('builds correct query URL with cluster and namespace params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('pod-1', 1)),
    })

    renderHook(() => usePrometheusMetrics('my-cluster', 'my-ns', 60000))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const firstCallUrl = fetchMock.mock.calls[0][0] as string
    expect(firstCallUrl).toContain('http://localhost:8585/prometheus/query')
    expect(firstCallUrl).toContain('cluster=my-cluster')
    expect(firstCallUrl).toContain('namespace=my-ns')
  })

  it('populates per-pod metrics from responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('vllm-pod-0', 0.75)),
    })

    const { result } = renderHook(() => usePrometheusMetrics('cluster-1', 'ns', 60000))

    await vi.waitFor(() => {
      expect(result.current.metrics).not.toBeNull()
    })

    expect(result.current.metrics).toHaveProperty('vllm-pod-0')
    expect(result.current.error).toBeNull()
  })

  it('sets error and null metrics when all queries return empty results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeEmptyResponse()),
    })

    const { result } = renderHook(() => usePrometheusMetrics('cluster-1', 'ns', 60000))

    await vi.waitFor(() => {
      expect(result.current.error).toBe('No Prometheus data available')
    })

    expect(result.current.metrics).toBeNull()
  })

  it('sets error when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePrometheusMetrics('cluster-1', 'ns', 60000))

    // All 6 queries are wrapped in Promise.allSettled, so individual rejections
    // are caught as rejected results. When every query fails, hasAnyData stays
    // false and the hook reports 'No Prometheus data available'.
    await vi.waitFor(() => {
      expect(result.current.error).toBe('No Prometheus data available')
    })

    expect(result.current.metrics).toBeNull()
  })

  it('sets error when fetch returns non-ok status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    })

    const { result } = renderHook(() => usePrometheusMetrics('cluster-1', 'ns', 60000))

    // queryPrometheus throws 'Agent returned 503' per query, but all 6 calls
    // are inside Promise.allSettled, so the rejections are caught individually.
    // With no fulfilled data, the hook surfaces the generic no-data message.
    await vi.waitFor(() => {
      expect(result.current.error).toBe('No Prometheus data available')
    })
  })

  it('handles mixed fulfilled and rejected queries gracefully', async () => {
    let callCount = 0
    fetchMock.mockImplementation(() => {
      callCount++
      // First 3 succeed, last 3 fail
      if (callCount <= 3) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makePromResponse('pod-1', callCount)),
        })
      }
      return Promise.reject(new Error('timeout'))
    })

    const { result } = renderHook(() => usePrometheusMetrics('cluster-1', 'ns', 60000))

    await vi.waitFor(() => {
      // Should have data from the successful queries
      expect(result.current.metrics).not.toBeNull()
    })
  })

  it('polls at the specified interval', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('pod-1', 1)),
    })

    const pollMs = 10000
    renderHook(() => usePrometheusMetrics('cluster-1', 'ns', pollMs))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const initialCallCount = fetchMock.mock.calls.length

    // Advance by poll interval
    act(() => { vi.advanceTimersByTime(pollMs) })

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  it('resets state when cluster or namespace becomes undefined', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('pod-1', 0.5)),
    })

    const { result, rerender } = renderHook(
      ({ cluster, ns }: { cluster?: string; ns?: string }) =>
        usePrometheusMetrics(cluster, ns, 60000),
      { initialProps: { cluster: 'c1', ns: 'ns1' } }
    )

    await vi.waitFor(() => {
      expect(result.current.metrics).not.toBeNull()
    })

    // Remove cluster
    rerender({ cluster: undefined, ns: 'ns1' })

    await vi.waitFor(() => {
      expect(result.current.metrics).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.loading).toBe(false)
    })
  })

  it('cleans up interval and aborts in-flight requests on unmount', async () => {
    const abortSpy = vi.fn()
    vi.stubGlobal('AbortController', class {
      signal = { aborted: false }
      abort = abortSpy
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePromResponse('pod-1', 1)),
    })

    const { unmount } = renderHook(() => usePrometheusMetrics('c1', 'ns1', 60000))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    unmount()

    // Abort should be called on unmount
    expect(abortSpy).toHaveBeenCalled()
  })

  it('skips NaN values in responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            { metric: { pod: 'pod-1' }, value: [Date.now() / 1000, 'NaN'] },
          ],
        },
      }),
    })

    const { result } = renderHook(() => usePrometheusMetrics('c1', 'ns1', 60000))

    await vi.waitFor(() => {
      // NaN values are skipped, so no data available
      expect(result.current.error).toBe('No Prometheus data available')
    })
  })

  it('extracts pod name from kubernetes_pod_name label', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            { metric: { kubernetes_pod_name: 'my-k8s-pod' }, value: [Date.now() / 1000, '42'] },
          ],
        },
      }),
    })

    const { result } = renderHook(() => usePrometheusMetrics('c1', 'ns1', 60000))

    await vi.waitFor(() => {
      expect(result.current.metrics).not.toBeNull()
    })

    expect(result.current.metrics).toHaveProperty('my-k8s-pod')
  })

  it('defaults pod name to "unknown" when no pod label exists', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            { metric: {}, value: [Date.now() / 1000, '10'] },
          ],
        },
      }),
    })

    const { result } = renderHook(() => usePrometheusMetrics('c1', 'ns1', 60000))

    await vi.waitFor(() => {
      expect(result.current.metrics).not.toBeNull()
    })

    expect(result.current.metrics).toHaveProperty('unknown')
  })
})
