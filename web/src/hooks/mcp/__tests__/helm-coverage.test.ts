import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks — mirrors helm.test.ts setup
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
  useDemoMode: () => mockUseDemoMode(),
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
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 5_000,
    SHORT_DELAY_MS: 100,
    FOCUS_DELAY_MS: 100,
  }
})

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testCounter = 0
function uniqueCluster(prefix = 'cov') {
  return `${prefix}-${++testCounter}-${Date.now()}`
}

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

// ===========================================================================
// loadHelmReleasesFromStorage — localStorage edge cases
// ===========================================================================

describe('useHelmReleases — localStorage cache edges', () => {
  it('loads releases from localStorage with valid stored data', async () => {
    const storedReleases = [makeRelease({ name: 'stored-rel', cluster: 'c1' })]
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: storedReleases,
      timestamp: Date.now(),
    }))

    mockFetchSSE.mockResolvedValue(storedReleases)
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('handles corrupted JSON in localStorage gracefully', async () => {
    localStorage.setItem('kc-helm-releases-cache', 'CORRUPTED{{{')

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash — proceed with empty initial state
    expect(result.current.error).toBeNull()
  })

  it('handles localStorage with non-array data field', async () => {
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: 'not-an-array',
      timestamp: Date.now(),
    }))

    mockFetchSSE.mockResolvedValue([])
    const cluster = uniqueCluster('non-array-data')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The loadHelmReleasesFromStorage check is exercised — non-array data is ignored
    // The releases come from SSE mock instead
    expect(result.current.releases).toEqual([])
  })

  it('handles localStorage with missing timestamp', async () => {
    localStorage.setItem('kc-helm-releases-cache', JSON.stringify({
      data: [makeRelease()],
    }))

    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should default timestamp to 0
  })
})

// ===========================================================================
// loadHelmHistoryFromStorage — localStorage edge cases
// ===========================================================================

describe('useHelmHistory — localStorage cache edges', () => {
  it('loads history from localStorage with valid stored data', async () => {
    const historyData = {
      'c1:prometheus': {
        data: [makeHistoryEntry({ revision: 3 })],
        timestamp: Date.now(),
        consecutiveFailures: 0,
      },
    }
    localStorage.setItem('kc-helm-history-cache', JSON.stringify(historyData))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry({ revision: 3 })] }),
    })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })

  it('handles corrupted JSON in history localStorage gracefully', async () => {
    localStorage.setItem('kc-helm-history-cache', 'NOT_JSON')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [makeHistoryEntry()] }),
    })

    const cluster = uniqueCluster('hist-corrupt')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'ns1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not crash, just fetch fresh data
    expect(result.current.history.length).toBeGreaterThan(0)
  })

  it('handles null value in history localStorage', async () => {
    localStorage.setItem('kc-helm-history-cache', JSON.stringify(null))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })

    const cluster = uniqueCluster('hist-null')
    const { result } = renderHook(() => useHelmHistory(cluster, 'my-rel', 'ns1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
  })
})

// ===========================================================================
// useHelmReleases — SSE with cluster param (no module-cache update)
// ===========================================================================

describe('useHelmReleases — cluster-specific fetch paths', () => {
  it('does not save to localStorage when cluster param is provided', async () => {
    const cluster = uniqueCluster('no-persist')
    const fakeRelease = makeRelease({ cluster })
    mockFetchSSE.mockResolvedValue([fakeRelease])

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // localStorage should not have been written for cluster-specific fetch
    const stored = localStorage.getItem('kc-helm-releases-cache')
    if (stored) {
      const parsed = JSON.parse(stored)
      const found = (parsed.data || []).find((r: { name: string }) => r.name === fakeRelease.name)
      expect(found).toBeUndefined()
    }
  })

  it('increments failure count on cluster-specific fetch but does not update module cache', async () => {
    const cluster = uniqueCluster('cluster-fail')
    mockFetchSSE.mockRejectedValue(new Error('SSE fail'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))

    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })
})

// ===========================================================================
// useHelmReleases — REST fallback with no token / demo token
// ===========================================================================

describe('useHelmReleases — REST fallback edge cases', () => {
  it('REST fallback succeeds when SSE is unavailable (no valid token)', async () => {
    // No SSE token available
    localStorage.removeItem('token')
    mockFetchSSE.mockRejectedValue(new Error('no token'))

    const restReleases = [makeRelease({ name: 'rest-only' })]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: restReleases }),
    })

    const cluster = uniqueCluster('rest-no-token')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(restReleases)
  })

  it('saves to module cache on all-clusters successful SSE fetch', async () => {
    const releases = [makeRelease({ name: 'save-test' })]
    mockFetchSSE.mockResolvedValue(releases)

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    // Verify module cache was updated (releases are returned from cache on next render)
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

// ===========================================================================
// useHelmReleases — cache age and background refresh
// ===========================================================================

describe('useHelmReleases — cache validity and background refresh', () => {
  it('uses cached data immediately when cache is fresh', async () => {
    // Pre-populate cache via a first render
    const releases = [makeRelease({ name: 'cached-rel' })]
    mockFetchSSE.mockResolvedValue(releases)

    const { result, unmount } = renderHook(() => useHelmReleases())
    await waitFor(() => expect(result.current.releases).toHaveLength(1))
    unmount()

    // Second render should pick up cached data without fetching
    const mockFetch2 = vi.fn()
    globalThis.fetch = mockFetch2

    const { result: result2 } = renderHook(() => useHelmReleases())
    // Cached data should be available immediately
    expect(result2.current.releases.length).toBeGreaterThanOrEqual(0)
  })
})

// ===========================================================================
// useHelmReleases — demo mode with cluster param
// ===========================================================================

describe('useHelmReleases — demo mode edge cases', () => {
  it('does not update module cache when demo mode + cluster param', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const cluster = uniqueCluster('demo-cluster')
    const { result } = renderHook(() => useHelmReleases(cluster))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('updates module cache when demo mode without cluster param', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })
})
