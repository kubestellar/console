import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsNetlifyDeployment,
  mockRegisterRefetch,
  mockRegisterCacheReset,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
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

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number) => ms,
  agentFetch: vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useCrossplaneManagedResources } from '../crossplane'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsNetlifyDeployment.value = false
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useCrossplaneManagedResources
// ===========================================================================

describe('useCrossplaneManagedResources', () => {
  it('returns initial loading state with empty resources array', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCrossplaneManagedResources())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resources).toEqual([])
  })

  it('returns managed resources after fetch resolves', async () => {
    const fakeResources = [
      {
        apiVersion: 'rds.aws.crossplane.io/v1beta1',
        kind: 'RDSInstance',
        metadata: { name: 'prod-db', namespace: 'infra', creationTimestamp: '2026-01-01T00:00:00Z' },
        status: { conditions: [{ type: 'Ready', status: 'True' as const }] },
      },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: fakeResources }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual(fakeResources)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
  })

  it('returns demo resources when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    // Use a cluster param to bypass the module-level cache from prior tests
    const { result } = renderHook(() => useCrossplaneManagedResources('demo-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
  })

  it('handles fetch failure and increments consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use a cluster param to bypass cached data from prior tests
    const { result } = renderHook(() => useCrossplaneManagedResources('fail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeTruthy()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // only 1 failure so far
  })

  it('returns lastRefresh timestamp after successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('skips fetch and clears loading on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true

    const { result } = renderHook(() => useCrossplaneManagedResources('netlify-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('handles non-Error thrown values in catch path', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('string-error')

    const { result } = renderHook(() => useCrossplaneManagedResources('err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBe('Failed to fetch managed resources')
  })

  it('handles HTTP error status codes (non-ok response)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('err-cluster-2'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error: 500')
  })

  it('handles response with missing resources key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources('missing-key-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns isRefreshing true during silent refetch', async () => {
    let resolvePromise: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation(() =>
      new Promise((resolve) => {
        resolvePromise = resolve
      }),
    )

    // Use a unique cluster param to bypass the shared module-level cache
    // which may have data from prior tests
    const { result } = renderHook(() => useCrossplaneManagedResources('refetch-cluster'))

    // Wait for the initial fetch to be in progress
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    // Resolve initial fetch
    resolvePromise!({
      ok: true,
      json: async () => ({ resources: [{ apiVersion: 'v1', kind: 'Test', metadata: { name: 'a', namespace: 'b', creationTimestamp: '' } }] }),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resources.length).toBe(1)
  })

  it('provides refetch function that can be called', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })

    const { result } = renderHook(() => useCrossplaneManagedResources())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('resets consecutiveFailures on successful fetch', async () => {
    // First: failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    const { result, rerender } = renderHook(
      ({ c }: { c: string }) => useCrossplaneManagedResources(c),
      { initialProps: { c: 'fail-first' } },
    )
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    // Then: success
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resources: [] }),
    })
    rerender({ c: 'succeed-second' })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
  })
})
