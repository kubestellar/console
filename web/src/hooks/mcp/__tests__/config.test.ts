import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockFetchSSE,
  mockRegisterRefetch,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
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
  agentFetch: vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  ),
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 5_000, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: () => '/api/mcp',
  isClusterModeBackend: () => false,
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useConfigMaps, useSecrets, useServiceAccounts } from '../config'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockRegisterRefetch.mockReturnValue(vi.fn())
  // Default: SSE rejects so REST path is exercised
  mockFetchSSE.mockRejectedValue(new Error('no SSE'))
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ configmaps: [], secrets: [], serviceAccounts: [] }), { status: 200 }))
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useConfigMaps — coverage for agent-fetch path and demo filter helpers
// ===========================================================================

describe('useConfigMaps coverage', () => {
  it('returns demo configmaps filtered by cluster when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useConfigMaps('prod-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.every(cm => cm.cluster === 'prod-cluster')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns all demo configmaps when no cluster filter is applied in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when REST returns non-OK status', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Forbidden', { status: 403 }))
    )

    const { result } = renderHook(() => useConfigMaps())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useSecrets — coverage for demo filter helpers
// ===========================================================================

describe('useSecrets coverage', () => {
  it('returns demo secrets filtered by namespace when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useSecrets(undefined, 'kube-system'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.every(s => s.namespace === 'kube-system')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when REST returns non-OK status', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Forbidden', { status: 403 }))
    )

    const { result } = renderHook(() => useSecrets())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ===========================================================================
// useServiceAccounts — coverage for demo filter helpers
// ===========================================================================

describe('useServiceAccounts coverage', () => {
  it('returns demo service accounts filtered by cluster in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useServiceAccounts('staging-cluster'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.every(sa => sa.cluster === 'staging-cluster')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when REST returns non-OK status', async () => {
    mockFetchSSE.mockRejectedValue(new Error('no SSE'))
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Forbidden', { status: 403 }))
    )

    const { result } = renderHook(() => useServiceAccounts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
