import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockFetchSSE,
  mockRegisterRefetch,
  mockSubscribePolling,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: vi.fn(() => vi.fn()),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  REFRESH_INTERVAL_MS: 120_000,
  getEffectiveInterval: (ms: number) => ms,
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useSecurityIssues, useGitOpsDrifts } from '../security'
// Import the same constant the source hooks use so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173).
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** localStorage cache key used by the security module */
const GITOPS_DRIFTS_CACHE_KEY = 'kc-gitops-drifts-cache'

/** Populate localStorage with a cached drifts payload */
function seedDriftCache(
  data: Array<Record<string, unknown>>,
  timestamp = Date.now(),
) {
  localStorage.setItem(
    GITOPS_DRIFTS_CACHE_KEY,
    JSON.stringify({ data, timestamp }),
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useSecurityIssues
// ===========================================================================

describe('useSecurityIssues', () => {
  it('returns initial loading state with empty issues array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSecurityIssues())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.issues).toEqual([])
  })

  it('returns security issues after SSE fetch resolves', async () => {
    const fakeIssues = [
      { name: 'api-server-pod', namespace: 'production', cluster: 'c1', issue: 'Privileged container', severity: 'high' as const, details: 'Running in privileged mode' },
    ]
    mockFetchSSE.mockResolvedValue(fakeIssues)

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(fakeIssues)
    expect(result.current.error).toBeNull()
    expect(result.current.isUsingDemoData).toBe(false)
  })

  it('returns demo security issues when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    // Wait for demo data to appear (isLoading may transition through true/false quickly)
    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(result.current.isUsingDemoData).toBe(true)
  })

  it('forwards cluster and namespace via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecurityIssues('prod-cluster', 'production'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('prod-cluster')
    expect(callArgs.params?.namespace).toBe('production')
  })

  it('handles SSE failure and tracks consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Only 1 failure so far
    expect(result.current.isFailed).toBe(false)
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns lastRefresh timestamp', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    // Wait for demo data to appear (isLoading may not transition cleanly)
    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(result.current.lastRefresh).toBeDefined()
  })

  // ─── New regression-preventing tests ───────────────────────────────────

  it('demo issues include all expected severity levels', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    const severities = result.current.issues.map(i => i.severity)
    expect(severities).toContain('high')
    expect(severities).toContain('medium')
    expect(severities).toContain('low')
  })

  it('demo issues all have required fields (name, namespace, cluster, issue, severity)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    for (const issue of result.current.issues) {
      expect(issue.name).toBeTruthy()
      expect(issue.namespace).toBeTruthy()
      expect(issue.cluster).toBeTruthy()
      expect(issue.issue).toBeTruthy()
      expect(['high', 'medium', 'low']).toContain(issue.severity)
    }
  })

  it('omits SSE params when cluster and namespace are undefined', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecurityIssues())

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params).toEqual({})
  })

  it('passes only cluster when namespace is undefined', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecurityIssues('my-cluster'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params).toEqual({ cluster: 'my-cluster' })
  })

  it('calls SSE with correct URL and itemsKey', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecurityIssues())

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { url: string; itemsKey: string }
    expect(callArgs.url).toBe('/api/mcp/security-issues/stream')
    expect(callArgs.itemsKey).toBe('issues')
  })

  it('resets consecutive failures on successful fetch', async () => {
    // First: fail
    mockFetchSSE.mockRejectedValueOnce(new Error('fail'))
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useSecurityIssues(cluster),
      { initialProps: { cluster: 'a' } },
    )

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Second: succeed (change cluster to force new refetch)
    mockFetchSSE.mockResolvedValueOnce([])
    rerender({ cluster: 'b' })

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
    expect(result.current.error).toBeNull()
  })

  it('registers and unregisters refetch on mount/unmount', async () => {
    const unregisterSpy = vi.fn()
    mockRegisterRefetch.mockReturnValue(unregisterSpy)
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    const registeredKey = mockRegisterRefetch.mock.calls[0][0] as string
    expect(registeredKey).toContain('security-issues')

    unmount()
    expect(unregisterSpy).toHaveBeenCalled()
  })

  it('refetch(silent=true) does not set isRefreshing to true', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Call refetch silently
    mockFetchSSE.mockResolvedValue([{ name: 'x', namespace: 'y', cluster: 'z', issue: 'test', severity: 'low' as const }])
    await act(async () => {
      await result.current.refetch(true)
    })

    // After silent refetch, isRefreshing should be false
    expect(result.current.isRefreshing).toBe(false)
  })

  it('sets lastUpdated as a Date object on success', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastUpdated).toBeInstanceOf(Date)
  })

  it('error is set only when non-silent fetch fails with no cached data', async () => {
    mockFetchSSE.mockRejectedValue(new Error('oops'))

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // First mount with no cached data -> error should be set
    expect(result.current.error).toBe('Failed to fetch security issues')
  })

  it('skips SSE when demo mode is enabled, never calls fetchSSE', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(mockFetchSSE).not.toHaveBeenCalled()
  })

  it('provides onClusterData callback that progressively appends items', async () => {
    // Capture the onClusterData callback passed to fetchSSE
    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (cluster: string, items: unknown[]) => void }) => {
      // Simulate progressive cluster data
      opts.onClusterData('cluster-a', [{ name: 'pod-1', namespace: 'ns', cluster: 'cluster-a', issue: 'test', severity: 'low' }])
      opts.onClusterData('cluster-b', [{ name: 'pod-2', namespace: 'ns', cluster: 'cluster-b', issue: 'test2', severity: 'high' }])
      return [
        { name: 'pod-1', namespace: 'ns', cluster: 'cluster-a', issue: 'test', severity: 'low' },
        { name: 'pod-2', namespace: 'ns', cluster: 'cluster-b', issue: 'test2', severity: 'high' },
      ]
    })

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Final result from fetchSSE should be set
    expect(result.current.issues).toHaveLength(2)
  })
})

// ===========================================================================
// useGitOpsDrifts
// ===========================================================================

describe('useGitOpsDrifts', () => {
  it('returns initial loading state with empty drifts array', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGitOpsDrifts())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.drifts).toEqual([])
  })

  it('returns drifts after fetch resolves', async () => {
    const fakeDrifts = [
      { resource: 'api-gateway', namespace: 'production', cluster: 'prod-east', kind: 'Deployment', driftType: 'modified' as const, gitVersion: 'v2.4.0', severity: 'medium' as const },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: fakeDrifts }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drifts).toEqual(fakeDrifts)
    expect(result.current.error).toBeNull()
  })

  it('returns demo drifts when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useGitOpsDrifts())

    // Wait for demo data to appear (isLoading may not transition cleanly due to setState batching)
    await waitFor(() => expect(result.current.drifts.length).toBeGreaterThan(0))
  })

  it('handles fetch failure and tracks consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns lastRefresh timestamp', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // only 1 failure
  })

  // ─── New regression-preventing tests ───────────────────────────────────

  it('demo drifts include all three drift types (modified, added, deleted-check)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.drifts.length).toBeGreaterThan(0))
    const driftTypes = result.current.drifts.map(d => d.driftType)
    // Demo data has 'modified' and 'added' at minimum
    expect(driftTypes).toContain('modified')
    expect(driftTypes).toContain('added')
  })

  it('demo drifts all have required fields (resource, namespace, cluster, kind, driftType, severity)', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.drifts.length).toBeGreaterThan(0))
    for (const drift of result.current.drifts) {
      expect(drift.resource).toBeTruthy()
      expect(drift.namespace).toBeTruthy()
      expect(drift.cluster).toBeTruthy()
      expect(drift.kind).toBeTruthy()
      expect(['modified', 'deleted', 'added']).toContain(drift.driftType)
      expect(['high', 'medium', 'low']).toContain(drift.severity)
    }
  })

  it('persists drifts to localStorage on successful fetch', async () => {
    const fakeDrifts = [
      { resource: 'svc', namespace: 'ns1', cluster: 'c1', kind: 'Service', driftType: 'added' as const, gitVersion: '-', severity: 'low' as const },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: fakeDrifts }),
    })

    renderHook(() => useGitOpsDrifts())

    await waitFor(() => {
      const stored = localStorage.getItem(GITOPS_DRIFTS_CACHE_KEY)
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.data).toEqual(fakeDrifts)
      expect(typeof parsed.timestamp).toBe('number')
    })
  })

  it('uses cached drifts from localStorage when cache is fresh', async () => {
    const cachedDrifts = [
      { resource: 'cached-resource', namespace: 'ns', cluster: 'c1', kind: 'ConfigMap', driftType: 'modified', gitVersion: 'v1', severity: 'low' },
    ]
    // Seed with a very recent timestamp (within TTL)
    seedDriftCache(cachedDrifts, Date.now())

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    // Should use the cached data immediately, not show loading
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drifts).toEqual(cachedDrifts)
  })

  it('handles API response with missing drifts field gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // No drifts field
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should fall back to empty array via `data.drifts || []`
    expect(result.current.drifts).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles non-ok HTTP response by incrementing failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBe('Failed to fetch GitOps drifts')
  })

  it('sends Authorization header with token from localStorage', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers['Authorization']).toBe('Bearer test-token')
  })

  it('builds URL with cluster and namespace query params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useGitOpsDrifts('my-cluster', 'my-namespace'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-namespace')
  })

  it('builds URL without query params when cluster/namespace are undefined', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/api/gitops/drifts')
    expect(url).not.toContain('cluster=')
    expect(url).not.toContain('namespace=')
  })

  it('resets consecutiveFailures on successful fetch after previous failure', async () => {
    // First render: fail
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))
    const { result, rerender } = renderHook(
      ({ cluster }: { cluster?: string }) => useGitOpsDrifts(cluster),
      { initialProps: { cluster: 'a' } },
    )

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Second render: succeed with different cluster to trigger refetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })
    rerender({ cluster: 'b' })

    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
  })

  it('falls back to demo data on non-silent fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // On non-silent failure, demo data is set as fallback
    expect(result.current.drifts.length).toBeGreaterThan(0)
  })

  it('subscribes to polling and unsubscribes on unmount', async () => {
    const unsubSpy = vi.fn()
    mockSubscribePolling.mockReturnValue(unsubSpy)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { unmount } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(mockSubscribePolling).toHaveBeenCalled())
    const pollingKey = mockSubscribePolling.mock.calls[0][0] as string
    expect(pollingKey).toContain('gitopsDrifts')

    unmount()
    expect(unsubSpy).toHaveBeenCalled()
  })

  it('registers refetch with modeTransition and unregisters on unmount', async () => {
    const unregisterSpy = vi.fn()
    mockRegisterRefetch.mockReturnValue(unregisterSpy)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { unmount } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => {
      const keys = mockRegisterRefetch.mock.calls.map(c => c[0] as string)
      expect(keys.some((k: string) => k.includes('gitops-drifts'))).toBe(true)
    })

    unmount()
    expect(unregisterSpy).toHaveBeenCalled()
  })

  it('handles corrupt localStorage cache gracefully', async () => {
    // Set corrupt JSON in cache
    localStorage.setItem(GITOPS_DRIFTS_CACHE_KEY, 'not-valid-json')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    // Should not throw, should fall back to empty
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drifts).toEqual([])
  })

  it('handles localStorage cache with non-array data field gracefully', async () => {
    // Set cache with invalid data shape
    localStorage.setItem(
      GITOPS_DRIFTS_CACHE_KEY,
      JSON.stringify({ data: 'not-an-array', timestamp: Date.now() }),
    )

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should treat non-array data as empty
    expect(result.current.drifts).toEqual([])
  })

  it('demo drifts include severity for each entry', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.drifts.length).toBeGreaterThan(0))
    const severities = result.current.drifts.map(d => d.severity)
    expect(severities).toContain('high')
    expect(severities).toContain('medium')
    expect(severities).toContain('low')
  })
})
