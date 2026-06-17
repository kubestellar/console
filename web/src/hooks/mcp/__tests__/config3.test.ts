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
