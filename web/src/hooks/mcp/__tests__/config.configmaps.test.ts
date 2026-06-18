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

import { useConfigMaps } from '../config'
// Import the same constant the source hooks use so URL assertions track
// kc-agent migration automatically (phase 4.5b, #7993 / #8173).
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

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


describe('useConfigMaps', () => {
  it('returns empty array with loading state on mount', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useConfigMaps())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.configmaps).toEqual([])
  })

  it('returns config maps after SSE fetch resolves', async () => {
    const fakeCMs = [{ name: 'cm-1', namespace: 'default', cluster: 'c1', dataCount: 2, age: '5d' }]
    mockFetchSSE.mockResolvedValue(fakeCMs)

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual(fakeCMs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace via SSE params when provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useConfigMaps('my-cluster', 'my-ns'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('my-cluster')
    expect(callArgs.params?.namespace).toBe('my-ns')
  })

  it('refetch() triggers a new SSE fetch', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useConfigMaps())

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
        return useConfigMaps()
      },
      { initialProps: { demoMode: false } }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockFetchSSE.mock.calls.length

    // Trigger demo mode change — hook registers an effect that calls refetch()
    mockIsDemoMode.mockReturnValue(true)
    rerender({ demoMode: true })

    // In demo mode, refetch short-circuits before calling SSE, so configmaps should be demo data
    await waitFor(() => expect(result.current.configmaps.length).toBeGreaterThan(0))
    // Demo path bypasses SSE entirely — call count stays the same
    expect(mockFetchSSE.mock.calls.length).toBe(callsBefore)
  })

  it('returns empty config maps with error: null on SSE and REST failure', async () => {
    // Both SSE and REST fail — hook silently swallows error (configmaps are optional)
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns demo config maps when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useSecrets
// ===========================================================================


describe('useConfigMaps — local agent path', () => {
  it('fetches from local agent when cluster is provided and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const agentCMs = [{ name: 'agent-cm', namespace: 'ns1', cluster: 'c1', dataCount: 1, age: '1d' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configmaps: agentCMs }),
    })

    const { result } = renderHook(() => useConfigMaps('c1', 'ns1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual(agentCMs)
    expect(result.current.error).toBeNull()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    // SSE and REST should NOT have been called
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('falls through to SSE when local agent returns non-ok response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const sseCMs = [{ name: 'sse-cm', namespace: 'ns1', cluster: 'c1', dataCount: 2, age: '3d' }]
    mockFetchSSE.mockResolvedValue(sseCMs)

    const { result } = renderHook(() => useConfigMaps('c1', 'ns1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual(sseCMs)
    expect(mockReportAgentDataSuccess).not.toHaveBeenCalled()
  })

  it('falls through to SSE when local agent fetch throws', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useConfigMaps('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(mockFetchSSE).toHaveBeenCalled()
  })

  it('skips local agent when cluster is not provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn()
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // globalThis.fetch should NOT have been called (local agent path requires cluster)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(mockFetchSSE).toHaveBeenCalled()
  })

  it('handles local agent returning empty configmaps array', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configmaps: [] }),
    })

    const { result } = renderHook(() => useConfigMaps('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(result.current.error).toBeNull()
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('handles local agent returning response without configmaps key (defaults to [])', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useConfigMaps('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })

  it('appends namespace to local agent URL when provided', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configmaps: [] }),
    })

    renderHook(() => useConfigMaps('c1', 'my-ns'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const fetchUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(fetchUrl).toContain('cluster=c1')
    expect(fetchUrl).toContain('namespace=my-ns')
  })
})


describe('useConfigMaps — SSE streaming', () => {
  it('uses correct SSE URL and itemsKey', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useConfigMaps('c1', 'ns1'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const sseArg = mockFetchSSE.mock.calls[0][0] as {
      url: string
      itemsKey: string
      params: Record<string, string>
    }
    expect(sseArg.url).toBe(`${LOCAL_AGENT_HTTP_URL}/configmaps/stream`)
    expect(sseArg.itemsKey).toBe('configmaps')
  })

  it('omits cluster/namespace from SSE params when not provided', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useConfigMaps())

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const sseArg = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(sseArg.params.cluster).toBeUndefined()
    expect(sseArg.params.namespace).toBeUndefined()
  })

  it('skips SSE when no token is present and falls through to REST', async () => {
    localStorage.removeItem('token')
    const restCMs = [{ name: 'rest-cm', namespace: 'default', cluster: 'c1', dataCount: 1, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ configmaps: restCMs }), { status: 200 }))
    )

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.configmaps).toEqual(restCMs)
  })

  it('skips SSE when token is demo-token and falls through to REST', async () => {
    localStorage.setItem('token', 'demo-token')
    const restCMs = [{ name: 'rest-cm', namespace: 'default', cluster: 'c1', dataCount: 1, age: '1d' }]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ configmaps: restCMs }), { status: 200 }))
    )

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetchSSE).not.toHaveBeenCalled()
    expect(result.current.configmaps).toEqual(restCMs)
  })

  it('invokes onClusterData callback during SSE streaming for configmaps', async () => {
    const streamedItems = [
      { name: 'cm-a', namespace: 'ns1', cluster: 'c1', dataCount: 1, age: '1d' },
      { name: 'cm-b', namespace: 'ns2', cluster: 'c2', dataCount: 2, age: '2d' },
    ]
    // Simulate fetchSSE calling onClusterData before resolving
    mockFetchSSE.mockImplementation(async (opts: { onClusterData?: (cluster: string, items: unknown[]) => void }) => {
      if (opts.onClusterData) {
        opts.onClusterData('c1', [streamedItems[0]])
        opts.onClusterData('c2', [streamedItems[1]])
      }
      return streamedItems
    })

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual(streamedItems)
  })
})


describe('useConfigMaps — REST fallback', () => {
  it('falls through from SSE failure to REST and returns data', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE broke'))
    const restCMs = [
      { name: 'rest-cm-1', namespace: 'default', cluster: 'c1', dataCount: 4, age: '10d' },
      { name: 'rest-cm-2', namespace: 'kube-system', cluster: 'c1', dataCount: 1, age: '5d' },
    ]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ configmaps: restCMs }), { status: 200 }))
    )

    const { result } = renderHook(() => useConfigMaps('c1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual(restCMs)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when REST response has no configmaps key', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    )

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('constructs correct REST URL with cluster and namespace params', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ configmaps: [] }), { status: 200 }))
    )

    renderHook(() => useConfigMaps('prod-east', 'monitoring'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain(`${LOCAL_AGENT_HTTP_URL}/configmaps`)
    expect(url).toContain('cluster=prod-east')
    expect(url).toContain('namespace=monitoring')
  })

  it('omits namespace param from REST URL when not provided', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ configmaps: [] }), { status: 200 }))
    )

    renderHook(() => useConfigMaps('c1'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const url: string = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('cluster=c1')
    expect(url).not.toContain('namespace=')
  })
})


describe('useConfigMaps — demo mode filtering', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
  })

  it('filters demo configmaps by cluster', async () => {
    const { result } = renderHook(() => useConfigMaps('staging'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
    expect(result.current.configmaps.every(cm => cm.cluster === 'staging')).toBe(true)
  })

  it('filters demo configmaps by cluster and namespace', async () => {
    const { result } = renderHook(() => useConfigMaps('staging', 'monitoring'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
    expect(result.current.configmaps.every(
      cm => cm.cluster === 'staging' && cm.namespace === 'monitoring'
    )).toBe(true)
  })

  it('returns empty array when demo filter matches no configmaps', async () => {
    const { result } = renderHook(() => useConfigMaps('nonexistent-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns all demo configmaps when no cluster/namespace filter', async () => {
    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // The demo data has 7 configmaps across multiple clusters
    expect(result.current.configmaps.length).toBe(7)
  })

  it('does not call SSE or REST in demo mode', async () => {
    globalThis.fetch = vi.fn()
    renderHook(() => useConfigMaps())

    await waitFor(() => expect(mockFetchSSE).not.toHaveBeenCalled())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

