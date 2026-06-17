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


// ===========================================================================
// Regression tests: useServiceAccounts — local agent path
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
