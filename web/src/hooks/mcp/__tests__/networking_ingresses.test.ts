import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockClusterCacheRef,
  capturedCacheResets,
} = vi.hoisted(() => {
  const capturedCacheResets = new Map<string, () => void>()
  return {
    mockIsDemoMode: vi.fn(() => false),
    mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
    mockIsAgentUnavailable: vi.fn(() => true), // agent unavailable by default
    mockReportAgentDataSuccess: vi.fn(),
    mockApiGet: vi.fn(),
    mockRegisterRefetch: vi.fn(() => vi.fn()),
    mockRegisterCacheReset: vi.fn((_key: string, callback: () => void) => {
      capturedCacheResets.set(_key, callback)
      return vi.fn()
    }),
    mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
    capturedCacheResets,
  }
})

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

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { getServices: vi.fn() },
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (ms: number, consecutiveFailures = 0) => {
    if (consecutiveFailures <= 0) return ms
    const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
    return Math.min(ms * multiplier, 600_000)
  },
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MCP_HOOK_TIMEOUT_MS: 5_000,
  DEPLOY_ABORT_TIMEOUT_MS: 10_000,
} })

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

// ---------------------------------------------------------------------------
// Imports under test (after mocks are declared)
// ---------------------------------------------------------------------------

import {
  useServices,
  useIngresses,
  useNetworkPolicies,
} from '../networking'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// useServices calls fetch() directly (not api.get), so we mock globalThis.fetch
const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockClusterCacheRef.clusters = []
  // Reset module-level servicesCache by calling the captured cache reset callback
  const servicesReset = capturedCacheResets.get('services')
  if (servicesReset) servicesReset()
  // Default: REST fetch returns empty data (services, ingresses, networkpolicies)
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ services: [], ingresses: [], networkpolicies: [] }), { status: 200 })))
  // Re-clear localStorage after cache reset (which may have set items)
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useServices
// ===========================================================================

describe('useIngresses', () => {
  it('returns empty array with loading state on mount', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useIngresses())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.ingresses).toEqual([])
  })

  it('returns ingresses after fetch resolves', async () => {
    const fakeIngresses = [{ name: 'ing-1', namespace: 'default', cluster: 'c1' }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: fakeIngresses }), { status: 200 })))

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses).toEqual(fakeIngresses)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))
    renderHook(() => useIngresses('prod-cluster', 'production'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=prod-cluster')
    expect(url).toContain('namespace=production')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))
    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { await result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty list with error set on fetch failure (no prior data)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ingresses).toEqual([])
    // Hook surfaces error so UI can distinguish failure from empty (#11541)
    expect(result.current.error).not.toBeNull()
  })

  it('re-fetches when demo mode changes', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useIngresses()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    rerender({ demoMode: true })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  // -------------------------------------------------------------------------
  // NEW: Ingress host extraction
  // -------------------------------------------------------------------------

  it('preserves ingress hosts array with multiple hostnames', async () => {
    const multiHostIngress = [
      {
        name: 'multi-host-ingress', namespace: 'production', cluster: 'prod',
        class: 'nginx', hosts: ['app.example.com', 'api.example.com', 'www.example.com'],
        address: '10.0.0.100',
      },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: multiHostIngress }), { status: 200 })))

    const { result } = renderHook(() => useIngresses('prod', 'production'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].hosts).toEqual(['app.example.com', 'api.example.com', 'www.example.com'])
    expect(result.current.ingresses[0].hosts).toHaveLength(3)
  })

  it('handles ingresses with empty hosts array', async () => {
    const noHostIngress = [
      { name: 'catch-all', namespace: 'default', cluster: 'c1', hosts: [], class: 'nginx' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: noHostIngress }), { status: 200 })))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].hosts).toEqual([])
    expect(result.current.ingresses[0].name).toBe('catch-all')
  })

  it('handles ingress with class and address fields', async () => {
    const ingress = [
      {
        name: 'main-ingress', namespace: 'web', cluster: 'prod',
        class: 'alb', hosts: ['app.example.com'], address: '52.14.0.1', age: '10d',
      },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: ingress }), { status: 200 })))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses[0].class).toBe('alb')
    expect(result.current.ingresses[0].address).toBe('52.14.0.1')
    expect(result.current.ingresses[0].age).toBe('10d')
  })

  // -------------------------------------------------------------------------
  // NEW: Ingress error handling
  // -------------------------------------------------------------------------

  it('handles null ingresses field in API response gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: null }), { status: 200 })))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook uses `data.ingresses || []`
    expect(result.current.ingresses).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('increments consecutiveFailures on ingress fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('sets isFailed after 3 consecutive ingress failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(2))

    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(3))

    expect(result.current.isFailed).toBe(true)
  })

  it('preserves stale ingresses on API failure (stale-data-on-error per #11540)', async () => {
    // First succeed with data
    const fakeIngresses = [{ name: 'ing-1', namespace: 'default', cluster: 'c1', hosts: ['a.com'] }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: fakeIngresses }), { status: 200 })))
    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.ingresses).toHaveLength(1))

    // Then fail — stale data is preserved to prevent empty state on transient failures
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.ingresses).toHaveLength(1)
  })
})

// ===========================================================================
// useNetworkPolicies
// ===========================================================================

describe('useIngresses — local agent path', () => {
  it('fetches from local agent when cluster is set and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentIngresses = { ingresses: [{ name: 'agent-ing', namespace: 'ns1', hosts: ['a.com'] }] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentIngresses,
    })

    const { result } = renderHook(() => useIngresses('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    expect(result.current.ingresses.length).toBeGreaterThanOrEqual(1)
  })

  it('falls through to API when agent returns non-ok for ingresses', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [{ name: 'api-ing', namespace: 'ns', hosts: [] }] }), { status: 200 })))

    const { result } = renderHook(() => useIngresses('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.ingresses.length).toBeGreaterThanOrEqual(0)
  })

  it('falls through to API when agent fetch throws for ingresses', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))

    const { result } = renderHook(() => useIngresses('cluster-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
  })
})

describe('useIngresses — agent skipped when no cluster', () => {
  it('skips agent path for ingresses when no cluster specified', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))

    renderHook(() => useIngresses())

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// useIngresses - isDemoFallback wiring (Issue 9357)
// ===========================================================================

describe('useIngresses — isDemoFallback wiring (Issue 9357)', () => {
  it('returns isDemoFallback: true when serving demo data in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(true)
    // Demo mode must produce non-empty demo ingress data so the Demo badge
    // shows with actual content (not a fake "empty live" view).
    expect(result.current.ingresses.length).toBeGreaterThan(0)
    // Live API must NOT be called in demo mode.
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns isDemoFallback: false when serving live API data', async () => {
    const liveIngresses = [{ name: 'live-ingress', namespace: 'prod', cluster: 'c1', hosts: ['x.example.com'] }]
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: liveIngresses }), { status: 200 })))

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.ingresses).toEqual(liveIngresses)
  })

  it('returns isDemoFallback: false when live API fails (empty, not demo)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useIngresses())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.ingresses).toEqual([])
  })

  it('transitions isDemoFallback from true to false when demo mode is disabled', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { result, rerender } = renderHook(
      ({ demo }) => {
        mockIsDemoMode.mockReturnValue(demo)
        mockUseDemoMode.mockReturnValue({ isDemoMode: demo })
        return useIngresses()
      },
      { initialProps: { demo: true } }
    )

    await waitFor(() => expect(result.current.isDemoFallback).toBe(true))

    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ingresses: [] }), { status: 200 })))
    rerender({ demo: false })

    await waitFor(() => expect(result.current.isDemoFallback).toBe(false))
  })

  it('filters demo ingresses by cluster when cluster is provided', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useIngresses('eks-prod-us-east-1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoFallback).toBe(true)
    expect(result.current.ingresses.every(i => i.cluster === 'eks-prod-us-east-1')).toBe(true)
  })
})
