import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockIsDemoMode = vi.fn(() => false)

vi.mock('./useDemoMode', () => ({
  isDemoModeForced: false,
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
}))

vi.mock('../lib/demoMode', () => ({
  isDemoModeForced: false,
  isDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoToken: () => false,
  getDemoMode: () => false,
  subscribeDemoMode: () => () => {},
  STORAGE_KEY_DEMO_MODE: 'kc-demo-mode',
}))

vi.mock('../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  }
})

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('useFederation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIsDemoMode.mockReturnValue(false)
    global.fetch = vi.fn()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns empty awareness when agent returns no detected hubs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    global.fetch = mockFetch

    const { useFederationAwareness, resetFederationCache } = await import('./useFederation')
    resetFederationCache()

    const { result } = renderHook(() => useFederationAwareness())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.clusters).toEqual([])
    expect(result.current.hubs).toEqual([])
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('returns demo data in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { useFederationAwareness, resetFederationCache } = await import('./useFederation')
    resetFederationCache()

    const { result } = renderHook(() => useFederationAwareness())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.isDemoFallback).toBe(true)
    expect(result.current.clusters.length).toBeGreaterThan(0)
    expect(result.current.hubs.length).toBeGreaterThan(0)
    expect(result.current.clusters[0].provider).toBe('ocm')
  })

  it('exports provider and state helpers', async () => {
    const { getProviderLabel, getStateLabel, getStateColorClasses } = await import('./useFederation')

    expect(getProviderLabel('ocm')).toBe('OCM')
    expect(getProviderLabel('karmada')).toBe('Karmada')
    expect(getProviderLabel('capi')).toBe('CAPI')

    expect(getStateLabel('joined')).toBe('Joined')
    expect(getStateLabel('pending')).toBe('Pending')
    expect(getStateLabel('provisioning')).toBe('Provisioning')

    expect(getStateColorClasses('joined')).toContain('green')
    expect(getStateColorClasses('failed')).toContain('red')
    expect(getStateColorClasses('pending')).toContain('yellow')
  })
})
