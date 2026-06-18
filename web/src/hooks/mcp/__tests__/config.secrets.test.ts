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

import { useSecrets } from '../config'
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


describe('useSecrets', () => {
  it('returns empty array with loading state on mount', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSecrets())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.secrets).toEqual([])
  })

  it('returns secrets after SSE fetch resolves', async () => {
    const fakeSecrets = [{ name: 'secret-1', namespace: 'default', cluster: 'c1', type: 'Opaque', dataCount: 3, age: '10d' }]
    mockFetchSSE.mockResolvedValue(fakeSecrets)

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual(fakeSecrets)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace via SSE params when provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecrets('cluster-x', 'ns-y'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('cluster-x')
    expect(callArgs.params?.namespace).toBe('ns-y')
  })

  it('refetch() triggers a new SSE fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('re-fetches when demo mode changes', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result, rerender } = renderHook(
      ({ demoMode }) => {
        mockUseDemoMode.mockReturnValue({ isDemoMode: demoMode })
        return useSecrets()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    // Trigger demo mode change — hook should re-fetch and return demo secrets
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demoMode: true })

    // In demo mode the hook short-circuits to demo data
    await waitFor(() => expect(result.current.secrets.length).toBeGreaterThan(0))
    // Demo path bypasses SSE entirely — call count stays the same
    expect(mockFetchSSE.mock.calls.length).toBe(callsBefore)
    expect(result.current.error).toBeNull()
  })

  it('returns empty secrets with error: null on SSE and REST failure', async () => {
    // Both SSE and REST fail — hook silently swallows error (secrets are optional)
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns demo secrets when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useServiceAccounts
// ===========================================================================


describe('useSecrets — local agent path', () => {
  it('fetches from local agent when cluster is provided and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentSecrets = [
      { name: 'tls-cert', namespace: 'default', cluster: 'c1', type: 'kubernetes.io/tls', dataCount: 2, age: '5d' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ secrets: agentSecrets }),
    })

    const { result } = renderHook(() => useSecrets('c1', 'default'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual(agentSecrets)
    expect(result.current.error).toBeNull()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('falls through to SSE when local agent returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    const sseSecrets = [
      { name: 'sse-secret', namespace: 'ns', cluster: 'c1', type: 'Opaque', dataCount: 1, age: '1d' },
    ]
    mockFetchSSE.mockResolvedValue(sseSecrets)

    const { result } = renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual(sseSecrets)
  })

  it('handles local agent returning response without secrets key', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual([])
  })

  it('falls through to SSE when local agent fetch throws', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('agent down'))
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual([])
    expect(mockFetchSSE).toHaveBeenCalled()
  })

  it('appends namespace to local agent URL when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ secrets: [] }),
    })

    renderHook(() => useSecrets('c1', 'kube-system'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const fetchUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(fetchUrl).toContain('cluster=c1')
    expect(fetchUrl).toContain('namespace=kube-system')
  })
})

// ===========================================================================
// Regression tests: SSE streaming behavior
// ===========================================================================


describe('useSecrets — SSE streaming', () => {
  it('uses correct SSE URL and itemsKey', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const sseArg = mockFetchSSE.mock.calls[0][0] as {
      url: string
      itemsKey: string
    }
    expect(sseArg.url).toBe(`${LOCAL_AGENT_HTTP_URL}/secrets/stream`)
    expect(sseArg.itemsKey).toBe('secrets')
  })

  it('invokes onClusterData callback during SSE streaming for secrets', async () => {
    const streamedSecrets = [
      { name: 'secret-a', namespace: 'ns1', cluster: 'c1', type: 'Opaque', dataCount: 1, age: '1d' },
      { name: 'secret-b', namespace: 'ns2', cluster: 'c2', type: 'Opaque', dataCount: 2, age: '2d' },
    ]
    mockFetchSSE.mockImplementation(async (opts: { onClusterData?: (cluster: string, items: unknown[]) => void }) => {
      if (opts.onClusterData) {
        opts.onClusterData('c1', [streamedSecrets[0]])
        opts.onClusterData('c2', [streamedSecrets[1]])
      }
      return streamedSecrets
    })

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual(streamedSecrets)
  })

  it('skips SSE when no token is present and falls through to REST for secrets', async () => {
    localStorage.removeItem('token')
    const restSecrets = [{ name: 'rest-s', namespace: 'default', cluster: 'c1', type: 'Opaque', dataCount: 1, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ secrets: restSecrets }), { status: 200 }))
    )

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.secrets).toEqual(restSecrets)
  })

  it('skips SSE when token is demo-token and falls through to REST for secrets', async () => {
    localStorage.setItem('token', 'demo-token')
    const restSecrets = [{ name: 'rest-s', namespace: 'default', cluster: 'c1', type: 'Opaque', dataCount: 1, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ secrets: restSecrets }), { status: 200 }))
    )

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.secrets).toEqual(restSecrets)
  })
})

// ===========================================================================
// Regression tests: REST fallback
// ===========================================================================


describe('useSecrets — REST fallback', () => {
  it('falls through from SSE failure to REST and returns secret data', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE broke'))
    const restSecrets = [
      { name: 'rest-s-1', namespace: 'default', cluster: 'c1', type: 'Opaque', dataCount: 1, age: '5d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ secrets: restSecrets }), { status: 200 }))
    )

    const { result } = renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual(restSecrets)
    expect(result.current.error).toBeNull()
  })

  it('constructs correct REST URL with cluster and namespace params for secrets', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ secrets: [] }), { status: 200 }))
    )

    renderHook(() => useSecrets('prod-east', 'monitoring'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain(`${LOCAL_AGENT_HTTP_URL}/secrets`)
    expect(url).toContain('cluster=prod-east')
    expect(url).toContain('namespace=monitoring')
  })

  it('omits namespace from REST URL when not provided for secrets', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ secrets: [] }), { status: 200 }))
    )

    renderHook(() => useSecrets('c1'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=c1')
    expect(url).not.toContain('namespace=')
  })

  it('returns empty array when REST response has no secrets key', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    )

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual([])
    expect(result.current.error).toBeNull()
  })
})


describe('useSecrets — demo mode filtering', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('filters demo secrets by cluster', async () => {
    const { result } = renderHook(() => useSecrets('prod-east'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
    expect(result.current.secrets.every(s => s.cluster === 'prod-east')).toBe(true)
  })

  it('filters demo secrets by cluster and namespace', async () => {
    const { result } = renderHook(() => useSecrets('prod-east', 'production'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
    expect(result.current.secrets.every(
      s => s.cluster === 'prod-east' && s.namespace === 'production'
    )).toBe(true)
  })

  it('returns all 7 demo secrets when no filter is applied', async () => {
    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBe(7)
  })

  it('demo secrets include expected types (Opaque, tls, service-account-token, dockerconfigjson)', async () => {
    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const types = result.current.secrets.map(s => s.type)
    expect(types).toContain('Opaque')
    expect(types).toContain('kubernetes.io/tls')
    expect(types).toContain('kubernetes.io/service-account-token')
    expect(types).toContain('kubernetes.io/dockerconfigjson')
  })
})

