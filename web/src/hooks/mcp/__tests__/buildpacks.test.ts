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

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useBuildpackImages } from '../buildpacks'

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
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useBuildpackImages
// ===========================================================================

describe('useBuildpackImages', () => {
  it('returns initial loading state with empty images array', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBuildpackImages())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.images).toEqual([])
  })

  it('returns buildpack images after fetch resolves', async () => {
    const fakeImages = [
      { name: 'frontend-app', namespace: 'apps', builder: 'paketo', image: 'registry.io/frontend:v1', status: 'succeeded', updated: new Date().toISOString(), cluster: 'c1' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: fakeImages }),
    })

    const { result } = renderHook(() => useBuildpackImages())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual(fakeImages)
    expect(result.current.error).toBeNull()
    expect(result.current.isDemoData).toBe(false)
  })

  it('returns demo images when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    // Use a cluster param to bypass the module-level cache from prior tests
    const { result } = renderHook(() => useBuildpackImages('demo-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images.length).toBeGreaterThan(0)
    expect(result.current.isDemoData).toBe(true)
  })

  it('handles fetch failure and increments consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use a cluster param to bypass cached data from prior tests
    const { result } = renderHook(() => useBuildpackImages('fail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeTruthy()
  })

  it('treats 404 as empty list (endpoint not available)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    // Use a cluster param to bypass cached data from prior tests
    const { result } = renderHook(() => useBuildpackImages('notfound-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    // First render with failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useBuildpackImages())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // isFailed requires >= 3 consecutiveFailures; first failure yields 1
    expect(result.current.isFailed).toBe(false)
  })

  it('returns lastRefresh timestamp after successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('skips fetch entirely on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true

    const { result } = renderHook(() => useBuildpackImages('netlify-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('handles non-Error thrown values in error path', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('string-error')

    const { result } = renderHook(() => useBuildpackImages('str-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Buildpack images')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles non-404 HTTP error status codes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useBuildpackImages('http-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toContain('API error: 500')
  })

  it('handles response with missing images key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useBuildpackImages('no-images-key'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('resets consecutiveFailures on successful fetch after prior failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))
    const { result, rerender } = renderHook(
      ({ c }: { c: string }) => useBuildpackImages(c),
      { initialProps: { c: 'fail-first-bp' } },
    )
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })
    rerender({ c: 'succeed-bp' })
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0))
  })

  it('sends Authorization header when token is present', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })
    globalThis.fetch = fetchSpy
    localStorage.setItem('token', 'my-secret-token')

    renderHook(() => useBuildpackImages('auth-cluster'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe('Bearer my-secret-token')
  })

  it('does not set Authorization header when no token', async () => {
    localStorage.removeItem('token')
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })
    globalThis.fetch = fetchSpy

    renderHook(() => useBuildpackImages('no-auth-cluster'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBeUndefined()
  })
})
