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

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
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
  mockUseDemoMode.mockReturnValue(false)
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
// useHelmReleases
// ===========================================================================


// ---------------------------------------------------------------------------
describe('useHelmValues', () => {
  it('returns null values when no release is provided', async () => {
    const { result } = renderHook(() => useHelmValues('c1'))

    // No release = no fetch
    expect(result.current.values).toBeNull()
    expect(result.current.format).toBe('json')
  })

  it('returns helm values after fetch resolves', async () => {
    const fakeValues = { replicaCount: 2, image: { tag: 'v1.0.0' } }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.values).toEqual(fakeValues)
    expect(result.current.format).toBe('json')
    expect(result.current.error).toBeNull()
  })

  it('returns demo values when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.format).toBe('json')
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release/namespace to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmValues('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.error).toBeTruthy()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- New regression tests ---

  it('returns the complete return shape with all expected keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    const cluster = uniqueCluster('val-shape')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(result.current).toHaveProperty('values')
    expect(result.current).toHaveProperty('format')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
  })

  it('does not fetch when namespace is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('val-no-ns')
    // release provided but no namespace
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', undefined))

    // Wait a tick to give any async effects time to fire
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // No fetch should have been called - namespace is required
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.values).toBeNull()
  })

  it('handles HTTP 500 response as an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const cluster = uniqueCluster('val-500')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))
    expect(result.current.error).toContain('API error')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles yaml format from server', async () => {
    const yamlString = 'replicaCount: 2\nimage:\n  tag: v1.0.0'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: yamlString, format: 'yaml' }),
    })

    const cluster = uniqueCluster('val-yaml')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.values).toBe(yamlString)
    expect(result.current.format).toBe('yaml')
  })

  it('defaults format to json when server omits format field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { key: 'val' } }), // no "format" key
    })

    const cluster = uniqueCluster('val-no-format')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.format).toBe('json')
  })

  it('preserves cached values on subsequent fetch failure', async () => {
    const cluster = uniqueCluster('val-cache-keep')
    const fakeValues = { replicaCount: 3, env: 'production' }

    // First fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).toEqual(fakeValues))

    // Second fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'))
    await act(async () => { await result.current.refetch() })

    // Cached values still intact
    expect(result.current.values).toEqual(fakeValues)
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is false below 3 failures and true at 3+', async () => {
    const cluster = uniqueCluster('val-isFailed')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // 1 failure

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(false) // 2 failures

    await act(async () => { await result.current.refetch() })
    expect(result.current.isFailed).toBe(true) // 3 failures => isFailed
  })

  it('demo values contain expected structure', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue(true)

    const cluster = uniqueCluster('val-demo-struct')
    const { result } = renderHook(() => useHelmValues(cluster, 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    const vals = result.current.values as Record<string, unknown>
    expect(vals).toHaveProperty('replicaCount')
    expect(vals).toHaveProperty('image')
    expect(vals).toHaveProperty('service')
    expect(vals).toHaveProperty('resources')
  })

  it('clears values when release is deselected', async () => {
    const cluster = uniqueCluster('val-deselect')
    const fakeValues = { key: 'val' }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: fakeValues, format: 'json' }),
    })

    // Start with a release selected
    const { result, rerender } = renderHook(
      ({ rel }: { rel: string | undefined }) => useHelmValues(cluster, rel, 'default'),
      { initialProps: { rel: 'my-rel' as string | undefined } }
    )

    await waitFor(() => expect(result.current.values).toEqual(fakeValues))

    // Deselect release
    rerender({ rel: undefined })

    await waitFor(() => expect(result.current.values).toBeNull())
  })

  it('sends Authorization header with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })
    globalThis.fetch = mockFetch

    const cluster = uniqueCluster('val-auth')
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
  })

  it('sets lastRefresh after successful fetch', async () => {
    const cluster = uniqueCluster('val-lastRefresh')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { a: 1 }, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))
    await waitFor(() => expect(result.current.values).not.toBeNull())

    expect(result.current.lastRefresh).toBeTypeOf('number')
    expect(result.current.lastRefresh).toBeGreaterThan(0)
  })

  it('resets consecutiveFailures to 0 after a successful refetch', async () => {
    const cluster = uniqueCluster('val-reset-fail')

    // First fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useHelmValues(cluster, 'my-rel', 'default'))

    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Second fetch succeeds
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: { ok: true }, format: 'json' }),
    })
    await act(async () => { await result.current.refetch() })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
  })
})
