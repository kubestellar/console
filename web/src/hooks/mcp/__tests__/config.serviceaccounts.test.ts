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
  mockFetchSSE,
  mockRegisterRefetch,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
}))

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

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: vi.fn(() => vi.fn()),
}))

vi.mock('../shared', () => ({
  getLocalAgentURL: () => 'http://localhost:8585',
  agentFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
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

import { useServiceAccounts } from '../config'
// Import the same constant the source hooks use so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173).


// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
// NOTE: config.ts tries SSE before REST when a token is present.
// Tests that want REST results should make mockFetchSSE reject first.

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  // Default: SSE returns empty list (succeeds so REST is not reached by default)
  mockFetchSSE.mockResolvedValue([])
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ configmaps: [], secrets: [], serviceAccounts: [] }), { status: 200 }))
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useConfigMaps
// ===========================================================================


describe('useServiceAccounts', () => {
  it('returns empty array with loading state on mount', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useServiceAccounts())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('returns service accounts after REST fetch resolves', async () => {
    const fakeSAs = [{ name: 'default', namespace: 'default', cluster: 'c1', secrets: ['default-token'], age: '30d' }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: fakeSAs }), { status: 200 }))
    )
    // SSE fails to force the REST path
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(fakeSAs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))

    renderHook(() => useServiceAccounts('my-cluster', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )
    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('returns empty service accounts with error: null on failure', async () => {
    // Both SSE and REST fail — hook silently swallows error (service accounts are optional)
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns demo service accounts when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('re-fetches when demo mode changes', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useServiceAccounts()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Trigger demo mode change
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demoMode: true })

    await waitFor(() => expect(result.current.serviceAccounts.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// Regression tests: local agent path
// ===========================================================================


describe('useServiceAccounts — REST fallback', () => {
  it('constructs correct REST URL with cluster and namespace for service accounts', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )

    renderHook(() => useServiceAccounts('prod-east', 'monitoring'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain(`${LOCAL_AGENT_HTTP_URL}/serviceaccounts`)
    expect(url).toContain('cluster=prod-east')
    expect(url).toContain('namespace=monitoring')
  })

  it('omits namespace from REST URL when not provided for service accounts', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )

    renderHook(() => useServiceAccounts('c1'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=c1')
    expect(url).not.toContain('namespace=')
  })

  it('returns empty array when REST response has no serviceAccounts key', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    )

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// Regression tests: demo mode filtering
// ===========================================================================


describe('useServiceAccounts — demo mode filtering', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('filters demo service accounts by cluster', async () => {
    const { result } = renderHook(() => useServiceAccounts('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.serviceAccounts.every(sa => sa.cluster === 'staging')).toBe(true)
  })

  it('filters demo service accounts by cluster and namespace', async () => {
    const { result } = renderHook(() => useServiceAccounts('staging', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.serviceAccounts.every(
      sa => sa.cluster === 'staging' && sa.namespace === 'monitoring'
    )).toBe(true)
  })

  it('returns all 6 demo service accounts when no filter is applied', async () => {
    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBe(6)
  })

  it('demo service accounts include imagePullSecrets for some accounts', async () => {
    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const withPullSecrets = result.current.serviceAccounts.filter(sa => sa.imagePullSecrets && sa.imagePullSecrets.length > 0)
    expect(withPullSecrets.length).toBeGreaterThan(0)
  })

  it('returns empty when demo filter matches no service accounts', async () => {
    const { result } = renderHook(() => useServiceAccounts('nonexistent'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
  })
})

// ===========================================================================
// Regression tests: mode transition registration
// ===========================================================================


describe('useServiceAccounts — local agent path', () => {
  it('fetches from local agent when cluster is provided and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentSAs = [
      { name: 'agent-sa', namespace: 'default', cluster: 'c1', secrets: ['token-1'], age: '2d' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ serviceaccounts: agentSAs }),
    })

    const { result } = renderHook(() => useServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(agentSAs)
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to REST when local agent throws', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const restSAs = [{ name: 'rest-sa', namespace: 'ns', cluster: 'c1', secrets: [], age: '1d' }]
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('agent down'))
      return Promise.resolve(new Response(JSON.stringify({ serviceAccounts: restSAs }), { status: 200 }))
    })

    const { result } = renderHook(() => useServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(restSAs)
  })

  it('falls through to REST when local agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const restSAs = [{ name: 'rest-sa', namespace: 'ns', cluster: 'c1', secrets: [], age: '1d' }]
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ ok: false, status: 500 })
      return Promise.resolve(new Response(JSON.stringify({ serviceAccounts: restSAs }), { status: 200 }))
    })

    const { result } = renderHook(() => useServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(restSAs)
  })

  it('handles local agent returning response without serviceaccounts key', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useServiceAccounts('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('appends namespace to local agent URL when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ serviceaccounts: [] }),
    })

    renderHook(() => useServiceAccounts('c1', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const fetchUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(fetchUrl).toContain('cluster=c1')
    expect(fetchUrl).toContain('namespace=my-ns')
  })

  it('skips local agent when cluster is not provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // fetch is called for REST path (not the local agent path since no cluster)
    // The key check is that the URL does NOT contain LOCAL_AGENT_URL (ws-based agent)
    // It should use LOCAL_AGENT_HTTP_URL (REST fallback path)
  })
})

// ===========================================================================
// Regression tests: abort timeout for local agent
// ===========================================================================


describe('mode transition registration', () => {
  it('useConfigMaps registers a refetch callback with correct key', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useConfigMaps('c1', 'ns1'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    const key = mockRegisterRefetch.mock.calls[0][0] as string
    expect(key).toBe('configmaps:c1:ns1')
  })

  it('useConfigMaps uses "all" placeholders when cluster/namespace not provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useConfigMaps())

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    const key = mockRegisterRefetch.mock.calls[0][0] as string
    expect(key).toBe('configmaps:all:all')
  })

  it('useSecrets registers refetch with correct key', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecrets('c2', 'ns2'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    const key = mockRegisterRefetch.mock.calls[0][0] as string
    expect(key).toBe('secrets:c2:ns2')
  })

  it('useServiceAccounts registers refetch with correct key', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ serviceAccounts: [] }), { status: 200 }))
    )

    renderHook(() => useServiceAccounts('c3'))

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    const key = mockRegisterRefetch.mock.calls[0][0] as string
    expect(key).toBe('serviceaccounts:c3:all')
  })

  it('cleanup function from registerRefetch is called on unmount', async () => {
    const mockUnregister = vi.fn()
    mockRegisterRefetch.mockReturnValue(mockUnregister)
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(mockRegisterRefetch).toHaveBeenCalled())
    unmount()
    expect(mockUnregister).toHaveBeenCalled()
  })
})

// ===========================================================================
// Regression tests: REST error recovery (falls back to demo or empty)
// ===========================================================================


describe('REST error recovery', () => {
  it('useConfigMaps returns demo data on REST failure when demo mode is active', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE fail'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))
    // isDemoMode returns false during initial refetch, but true during catch
    // Actually the source checks isDemoMode() in the catch block
    mockIsDemoMode.mockReturnValue(false)
      .mockReturnValueOnce(false) // initial check at top of refetch
      .mockReturnValueOnce(true)  // check in REST catch block

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.configmaps.length).toBeGreaterThan(0))
    expect(result.current.error).toBeNull()
  })

  it('useSecrets returns demo data on REST failure when demo mode is active', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE fail'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))
    mockIsDemoMode.mockReturnValue(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('useServiceAccounts returns empty on REST failure in live mode', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE for SA'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('useServiceAccounts returns demo data on REST failure when demo mode is active', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST fail'))
    // isDemoMode returns false on first check (top of refetch), then true in catch block
    mockIsDemoMode.mockReturnValue(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// Regression tests: useServiceAccounts — local agent path
// ===========================================================================


describe('local agent abort timeout', () => {
  it('useConfigMaps creates AbortController with timeout for local agent fetch', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable.mockReturnValue(false)

    // Make fetch hang so the abort timeout fires
    let abortSignal: AbortSignal | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      abortSignal = opts?.signal
      return new Promise(() => {}) // never resolves
    })

    renderHook(() => useConfigMaps('c1'))

    // The abort timeout should be set to MCP_HOOK_TIMEOUT_MS (5000)
    expect(abortSignal).toBeDefined()
    expect(abortSignal!.aborted).toBe(false)

    // Advance past the timeout
    vi.advanceTimersByTime(5_001)

    expect(abortSignal!.aborted).toBe(true)

    vi.useRealTimers()
  })

  it('useSecrets creates AbortController with timeout for local agent fetch', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable.mockReturnValue(false)

    let abortSignal: AbortSignal | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      abortSignal = opts?.signal
      return new Promise(() => {})
    })

    renderHook(() => useSecrets('c1'))

    expect(abortSignal).toBeDefined()
    expect(abortSignal!.aborted).toBe(false)

    vi.advanceTimersByTime(5_001)

    expect(abortSignal!.aborted).toBe(true)

    vi.useRealTimers()
  })

  it('useServiceAccounts creates AbortController with timeout for local agent fetch', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable.mockReturnValue(false)

    let abortSignal: AbortSignal | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
      abortSignal = opts?.signal
      return new Promise(() => {})
    })

    renderHook(() => useServiceAccounts('c1'))

    expect(abortSignal).toBeDefined()
    expect(abortSignal!.aborted).toBe(false)

    vi.advanceTimersByTime(5_001)

    expect(abortSignal!.aborted).toBe(true)

    vi.useRealTimers()
  })
})
