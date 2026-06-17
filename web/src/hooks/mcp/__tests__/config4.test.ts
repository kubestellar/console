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
