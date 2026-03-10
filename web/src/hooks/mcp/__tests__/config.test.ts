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
  LOCAL_AGENT_URL: 'http://localhost:8585',
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useConfigMaps, useSecrets, useServiceAccounts } from '../config'

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
  mockApiGet.mockResolvedValue({ data: { configmaps: [], secrets: [] } })
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

  it('falls back to demo config maps with error: null on SSE and REST failure', async () => {
    // Both SSE and REST fail — hook falls back to demo config maps
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    mockApiGet.mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
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

  it('falls back to demo secrets with error: null on SSE and REST failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    mockApiGet.mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
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

describe('useServiceAccounts', () => {
  it('returns empty array with loading state on mount', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useServiceAccounts())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.serviceAccounts).toEqual([])
  })

  it('returns service accounts after REST fetch resolves', async () => {
    const fakeSAs = [{ name: 'default', namespace: 'default', cluster: 'c1', secrets: ['default-token'], age: '30d' }]
    mockApiGet.mockResolvedValue({ data: { serviceAccounts: fakeSAs } })
    // SSE fails to force the REST path
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual(fakeSAs)
    expect(result.current.error).toBeNull()
  })

  it('forwards cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValue({ data: { serviceAccounts: [] } })
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))

    renderHook(() => useServiceAccounts('my-cluster', 'my-ns'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const url: string = mockApiGet.mock.calls[0][0]
    expect(url).toContain('cluster=my-cluster')
    expect(url).toContain('namespace=my-ns')
  })

  it('refetch() triggers a new fetch', async () => {
    mockApiGet.mockResolvedValue({ data: { serviceAccounts: [] } })
    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsBefore = mockApiGet.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('falls back to demo service accounts with error: null on failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))
    mockApiGet.mockRejectedValue(new Error('REST error'))

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
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
})
