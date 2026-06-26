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
    STORAGE_KEY_TOKEN: 'kc-token',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
  }
})

import { useWorkloadMonitor } from '../useWorkloadMonitor'
import type { WorkloadMonitorResponse } from '../../types/workloadMonitor'

function makeMonitorResponse(overrides: Partial<WorkloadMonitorResponse> = {}): WorkloadMonitorResponse {
  return {
    workload: 'my-app',
    kind: 'Deployment',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'healthy',
    resources: [
      {
        id: 'Deployment/default/my-app',
        kind: 'Deployment',
        name: 'my-app',
        namespace: 'default',
        cluster: 'cluster-1',
        status: 'healthy',
        category: 'workload',
        lastChecked: new Date().toISOString(),
        optional: false,
        order: 0,
      },
    ],
    issues: [],
    warnings: [],
    ...overrides,
  }
}

describe('useWorkloadMonitor', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns expected shape with all fields', () => {
    const { result } = renderHook(() => useWorkloadMonitor())
    expect(result.current).toHaveProperty('resources')
    expect(result.current).toHaveProperty('issues')
    expect(result.current).toHaveProperty('overallStatus')
    expect(result.current).toHaveProperty('workloadKind')
    expect(result.current).toHaveProperty('warnings')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('does not fetch when cluster/namespace/workload are undefined', () => {
    renderHook(() => useWorkloadMonitor())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fetch when enabled is false', () => {
    renderHook(() => useWorkloadMonitor('cluster', 'ns', 'wl', { enabled: false }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches on mount when cluster, namespace, and workload are provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    renderHook(() => useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 }))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/workloads/monitor/cluster-1/default/my-app')
  })

  it('populates resources, issues, and status from response', async () => {
    const response = makeMonitorResponse({
      status: 'degraded',
      kind: 'StatefulSet',
      issues: [
        {
          id: 'issue-1',
          resource: {
            id: 'Pod/default/my-app-0',
            kind: 'Pod',
            name: 'my-app-0',
            namespace: 'default',
            cluster: 'cluster-1',
            status: 'unhealthy',
            category: 'workload',
            lastChecked: new Date().toISOString(),
            optional: false,
            order: 1,
          },
          severity: 'warning',
          title: 'Pod Restarting',
          description: 'Pod has restarted 5 times',
          detectedAt: new Date().toISOString(),
        },
      ],
      warnings: ['Some CRDs not found'],
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    })

    const { result } = renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(result.current.overallStatus).toBe('degraded')
    })

    expect(result.current.resources.length).toBe(1)
    expect(result.current.issues.length).toBe(1)
    expect(result.current.workloadKind).toBe('StatefulSet')
    expect(result.current.warnings).toEqual(['Some CRDs not found'])
    expect(result.current.error).toBeNull()
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  it('sets error and increments consecutiveFailures on fetch error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: 'cluster unreachable' }),
    })

    const { result } = renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })

    expect(result.current.error?.message).toBe('cluster unreachable')
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 })
    )

    // First failure
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(1)
    })

    // Manually refetch to trigger more failures
    await act(async () => { result.current.refetch() })
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(2)
    })

    await act(async () => { result.current.refetch() })
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(3)
    })

    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures on successful fetch', async () => {
    let callCount = 0
    fetchMock.mockImplementation(() => {
      callCount++
      if (callCount <= 2) {
        return Promise.reject(new Error('fail'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeMonitorResponse()),
      })
    })

    const { result } = renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 })
    )

    // First call fails
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(1)
    })

    // Second call fails
    await act(async () => { result.current.refetch() })
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(2)
    })

    // Third call succeeds
    await act(async () => { result.current.refetch() })
    await vi.waitFor(() => {
      expect(result.current.consecutiveFailures).toBe(0)
    })
  })

  it('auto-refreshes at the configured interval', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    const refreshMs = 5000
    renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: refreshMs })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    // Advance time by refresh interval
    act(() => { vi.advanceTimersByTime(refreshMs) })

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('does not auto-refresh when autoRefreshMs is 0', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    renderHook(() =>
      useWorkloadMonitor('cluster-1', 'default', 'my-app', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    act(() => { vi.advanceTimersByTime(60000) })

    // Should still only be 1 call
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retains last-known state when disabled (initRef guard)', async () => {
    // The hook uses an initRef guard that runs the fetch effect only once.
    // When `enabled` toggles to false after data has loaded, the hook retains
    // the last-known state rather than resetting to unknown.
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse({ status: 'healthy' })),
    })

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWorkloadMonitor('c1', 'ns', 'wl', { enabled, autoRefreshMs: 0 }),
      { initialProps: { enabled: true } }
    )

    await vi.waitFor(() => {
      expect(result.current.overallStatus).toBe('healthy')
    })

    rerender({ enabled: false })

    // State is retained — no reset to 'unknown'
    expect(result.current.overallStatus).toBe('healthy')
    expect(result.current.error).toBeNull()
  })

  it('sends Authorization header when token is in localStorage', async () => {
    localStorage.setItem('kc-token', 'my-jwt-token')

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    renderHook(() =>
      useWorkloadMonitor('c1', 'ns', 'wl', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const headers = fetchMock.mock.calls[0][1]?.headers
    expect(headers).toHaveProperty('Authorization', 'Bearer my-jwt-token')
  })

  it('does not send Authorization header when no token exists', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    renderHook(() =>
      useWorkloadMonitor('c1', 'ns', 'wl', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('URL-encodes cluster, namespace, and workload names', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    renderHook(() =>
      useWorkloadMonitor('my/cluster', 'kube-system', 'my app', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('my/cluster'))
    expect(url).toContain('kube-system')
    expect(url).toContain(encodeURIComponent('my app'))
  })

  it('handles non-JSON error response gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    })

    const { result } = renderHook(() =>
      useWorkloadMonitor('c1', 'ns', 'wl', { autoRefreshMs: 0 })
    )

    await vi.waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })

    expect(result.current.error?.message).toContain('Bad Gateway')
  })

  it('cleans up interval on unmount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeMonitorResponse()),
    })

    const { unmount } = renderHook(() =>
      useWorkloadMonitor('c1', 'ns', 'wl', { autoRefreshMs: 5000 })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    act(() => { vi.advanceTimersByTime(10000) })

    // No additional fetches after unmount
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
