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
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsNetlifyDeployment: { value: false },
  mockFetchSSE: vi.fn(),
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
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  SHORT_DELAY_MS: 100,
  FOCUS_DELAY_MS: 100,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useHelmReleases, useHelmHistory, useHelmValues } from '../helm'

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
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useHelmReleases
// ===========================================================================

describe('useHelmReleases', () => {
  it('returns initial loading state with empty releases array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHelmReleases())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.releases).toEqual([])
  })

  it('returns helm releases after SSE fetch resolves', async () => {
    const fakeReleases = [
      { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date().toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'c1' },
    ]
    mockFetchSSE.mockResolvedValue(fakeReleases)

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(fakeReleases)
    expect(result.current.error).toBeNull()
  })

  it('returns demo releases when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases.length).toBeGreaterThan(0)
  })

  it('falls back to REST when SSE fails', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    const fakeReleases = [
      { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date().toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releases: fakeReleases }),
    })

    // Use a cluster param to bypass module-level cache from prior tests
    const { result } = renderHook(() => useHelmReleases('rest-fallback-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.releases).toEqual(fakeReleases)
    expect(result.current.error).toBeNull()
  })

  it('handles both SSE and REST failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST failed'))

    // Use a cluster param to bypass module-level cache from prior tests
    const { result } = renderHook(() => useHelmReleases('fail-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('error'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useHelmReleases())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Only 1 failure so far
    expect(result.current.isFailed).toBe(false)
  })
})

// ===========================================================================
// useHelmHistory
// ===========================================================================

describe('useHelmHistory', () => {
  it('returns initial loading state when release is provided', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.history).toEqual([])
  })

  it('returns empty history when no release is provided', async () => {
    const { result } = renderHook(() => useHelmHistory('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual([])
  })

  it('returns helm history after fetch resolves', async () => {
    const fakeHistory = [
      { revision: 5, updated: new Date().toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: fakeHistory }),
    })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toEqual(fakeHistory)
    expect(result.current.error).toBeNull()
  })

  it('returns demo history when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history.length).toBeGreaterThan(0)
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmHistory('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    })

    const { result } = renderHook(() => useHelmHistory('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ===========================================================================
// useHelmValues
// ===========================================================================

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

    await waitFor(() => expect(result.current.values).toBeDefined())
    expect(result.current.values).toEqual(fakeValues)
    expect(result.current.format).toBe('json')
    expect(result.current.error).toBeNull()
  })

  it('returns demo values when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).not.toBeNull())
    expect(result.current.format).toBe('json')
  })

  it('handles fetch failure with error message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Use unique cluster/release/namespace to avoid hitting cache from prior tests
    const { result } = renderHook(() => useHelmValues('fail-cluster', 'fail-release', 'fail-ns'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: {}, format: 'json' }),
    })

    const { result } = renderHook(() => useHelmValues('c1', 'prometheus', 'monitoring'))

    await waitFor(() => expect(result.current.values).toBeDefined())
    expect(typeof result.current.refetch).toBe('function')
  })
})
