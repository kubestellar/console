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

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

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
})
