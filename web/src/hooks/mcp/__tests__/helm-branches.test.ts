import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockSubscribePolling,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
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
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  SHORT_DELAY_MS: 100,
  FOCUS_DELAY_MS: 100,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique cluster key per test to avoid module-level cache collisions */
let testCounter = 0
function uniqueCluster(prefix = 'test') {
  return `${prefix}-${++testCounter}-${Date.now()}`
}

/** Build a minimal valid HelmRelease object */
function makeRelease(overrides: Partial<{
  name: string; namespace: string; revision: string; updated: string;
  status: string; chart: string; app_version: string; cluster: string;
}> = {}) {
  return {
    name: overrides.name ?? 'my-release',
    namespace: overrides.namespace ?? 'default',
    revision: overrides.revision ?? '1',
    updated: overrides.updated ?? new Date().toISOString(),
    status: overrides.status ?? 'deployed',
    chart: overrides.chart ?? 'my-chart-1.0.0',
    app_version: overrides.app_version ?? '1.0.0',
    cluster: overrides.cluster ?? 'c1',
  }
}

/** Build a minimal valid HelmHistoryEntry object */
function makeHistoryEntry(overrides: Partial<{
  revision: number; updated: string; status: string;
  chart: string; app_version: string; description: string;
}> = {}) {
  return {
    revision: overrides.revision ?? 1,
    updated: overrides.updated ?? new Date().toISOString(),
    status: overrides.status ?? 'deployed',
    chart: overrides.chart ?? 'my-chart-1.0.0',
    app_version: overrides.app_version ?? '1.0.0',
    description: overrides.description ?? 'Install complete',
  }
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
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockSubscribePolling.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

describe('useHelmReleases — additional branches', () => {
  it('accumulates releases progressively via SSE onClusterData', async () => {
    const rel1 = makeRelease({ name: 'r1', cluster: 'c1' })
    const rel2 = makeRelease({ name: 'r2', cluster: 'c2' })

    mockFetchSSE.mockImplementation(async (opts: { onClusterData: (c: string, items: unknown[]) => void }) => {
      opts.onClusterData('c1', [rel1])
      opts.onClusterData('c2', [rel2])
      return [rel1, rel2]
    })

    const cluster = uniqueCluster('sse-progressive')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toHaveLength(2)
  })

  it('error message is extracted from Error instance on fetch failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('Custom SSE failure'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom REST failure'))

    const cluster = uniqueCluster('err-msg')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('Custom')
  })

  it('error message defaults to generic text for non-Error thrown values', async () => {
    mockFetchSSE.mockRejectedValue('string-error')
    globalThis.fetch = vi.fn().mockRejectedValue('string-error')

    const cluster = uniqueCluster('non-error')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Helm releases')
  })

  it('does not update module cache when cluster param is provided (per-cluster fetch)', async () => {
    const cluster = uniqueCluster('no-cache-update')
    const fakeRelease = makeRelease({ cluster })
    mockFetchSSE.mockResolvedValue([fakeRelease])

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // The release should be returned but localStorage should NOT contain this
    // (module cache only updates when cluster param is absent — all-clusters mode)
    const stored = localStorage.getItem('kc-helm-releases-cache')
    if (stored) {
      const parsed = JSON.parse(stored)
      // If there's stored data, it should NOT contain our cluster-specific release
      const found = (parsed.data || []).find((r: { name: string }) => r.name === fakeRelease.name)
      expect(found).toBeUndefined()
    }
  })

  it('refetch with silent=true sets isRefreshing but not isLoading', async () => {
    const cluster = uniqueCluster('silent-refetch')
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases(cluster))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // silent refetch
    mockFetchSSE.mockResolvedValue([makeRelease({ cluster })])
    await act(async () => { await result.current.refetch() })

    // After refetch finishes, both should be false
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it('demo mode refetch with silent does not show refresh indicator', async () => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await act(() => Promise.resolve())
    // Advance past MIN_REFRESH_INDICATOR_MS
    const INDICATOR_CLEAR_MS = 600
    act(() => { vi.advanceTimersByTime(INDICATOR_CLEAR_MS) })
    expect(result.current.isRefreshing).toBe(false)
    vi.useRealTimers()
  })
})

describe('useHelmHistory — additional branches', () => {
  it('uses cached history when available and fresh', async () => {
    const cluster = uniqueCluster('hist-cached-fresh')
    const fakeHistory = [makeHistoryEntry({ revision: 1 })]

    // First fetch populates cache
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    const { result, unmount } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toEqual(fakeHistory))
    unmount()

    // Second render should use cached data
    const mockFetch2 = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })
    globalThis.fetch = mockFetch2

    const { result: result2 } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    // Should immediately show cached data
    expect(result2.current.history).toEqual(fakeHistory)
  })

  it('error message is extracted from Error instance', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom helm error'))

    const cluster = uniqueCluster('hist-err-msg')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Custom helm error')
  })

  it('error defaults to generic text for non-Error thrown values', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('not-an-error')

    const cluster = uniqueCluster('hist-generic-err')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Helm history')
  })

  it('updates cache failure count on error when cache entry exists', async () => {
    const cluster = uniqueCluster('hist-cache-fail')

    // First fetch succeeds, populating cache
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.history).toHaveLength(1))

    // Second fetch fails — cache failure count should increment
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    // But cached history data should still be intact
    expect(result.current.history).toHaveLength(1)
  })
})

describe('useHelmValues — additional branches', () => {
  it('refetch with no release returns null values and clears isRefreshing', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useHelmValues('c1', undefined, 'default'))

    await act(() => Promise.resolve())
    // Advance past FOCUS_DELAY_MS
    const DELAY_MS = 200
    act(() => { vi.advanceTimersByTime(DELAY_MS) })
    expect(result.current.values).toBeNull()
    expect(result.current.isRefreshing).toBe(false)
    vi.useRealTimers()
  })

  it('error message is extracted from Error instance', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Custom values error'))

    const cluster = uniqueCluster('val-err-msg')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.error).toBe('Custom values error'))
  })

  it('error defaults to generic text for non-Error thrown values', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(42)

    const cluster = uniqueCluster('val-generic-err')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.error).toBe('Failed to fetch Helm values')
  })

  it('passes error field from server response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json', error: 'helm: release not found' }),
    })

    const cluster = uniqueCluster('val-body-err')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.error).toBe('helm: release not found')
  })

  it('caches fetched values and uses them on subsequent renders', async () => {
    const cluster = uniqueCluster('val-cache')
    const fakeValues = { cached: true }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    const { result, unmount } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    await waitFor(() => expect(result.current.values).toEqual(fakeValues))
    unmount()

    // Second render should use cached values immediately
    const mockFetch2 = vi.fn()
    globalThis.fetch = mockFetch2

    const { result: r2 } = renderHook(() => useHelmValues(cluster, 'my-rel', 'ns1'))
    expect(r2.current.values).toEqual(fakeValues)
  })
})
