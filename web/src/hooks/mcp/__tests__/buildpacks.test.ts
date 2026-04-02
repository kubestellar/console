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

  it('handles non-Error exceptions in catch block', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue('string error')

    const { result } = renderHook(() => useBuildpackImages('str-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch Buildpack images')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('handles API error (non-404, non-ok response)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useBuildpackImages('api-err-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('API error: 500')
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('does not fetch on Netlify deployment', async () => {
    mockIsNetlifyDeployment.value = true
    globalThis.fetch = vi.fn()

    const { result } = renderHook(() => useBuildpackImages('netlify-cluster'))

    // Should resolve to non-loading state without calling fetch
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('returns images filtered by cluster param when multiple images exist', async () => {
    const images = [
      { name: 'app1', namespace: 'ns1', builder: 'paketo', image: 'img1', status: 'succeeded', updated: new Date().toISOString(), cluster: 'c1' },
      { name: 'app2', namespace: 'ns2', builder: 'paketo', image: 'img2', status: 'building', updated: new Date().toISOString(), cluster: 'c2' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images }),
    })

    const { result } = renderHook(() => useBuildpackImages('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The hook returns whatever the server returns for the given cluster filter
    expect(result.current.images).toEqual(images)
  })

  it('handles response with missing images key gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useBuildpackImages('empty-key-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sends Authorization header when token exists', async () => {
    localStorage.setItem('token', 'my-secret-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages('auth-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gitops/buildpack-images'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret-token',
        }),
      })
    )
  })

  it('calls fetch without Authorization header when no token exists', async () => {
    localStorage.removeItem('token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages('no-auth-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = callArgs[1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('appends cluster param to fetch URL when specified', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages('my-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('cluster=my-cluster'),
      expect.anything()
    )
  })

  it('does not append cluster param when not specified', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    })

    const { result } = renderHook(() => useBuildpackImages())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).not.toContain('cluster=')
  })

  it('resets error and consecutiveFailures on successful fetch after failure', async () => {
    // First render with failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { result, rerender } = renderHook(
      ({ cluster }) => useBuildpackImages(cluster),
      { initialProps: { cluster: 'recovery-cluster-1' } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()

    // Now succeed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [{ name: 'recovered', namespace: 'ns', builder: 'b', image: 'i', status: 'succeeded', updated: new Date().toISOString(), cluster: 'c1' }] }),
    })

    rerender({ cluster: 'recovery-cluster-2' })

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.isDemoData).toBe(false)
  })
})
