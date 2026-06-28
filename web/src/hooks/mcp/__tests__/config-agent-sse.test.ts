import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
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

import { useConfigMaps, useSecrets, useServiceAccounts } from '../config'
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

