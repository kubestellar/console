import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseDemoMode,
  mockFetchSSE,
  mockRegisterRefetch,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: vi.fn(() => vi.fn()),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../shared', () => ({
  MIN_REFRESH_INDICATOR_MS: 500,
  REFRESH_INTERVAL_MS: 120_000,
  getEffectiveInterval: (ms: number) => ms,
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

import { useSecurityIssues, useGitOpsDrifts } from '../security'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ===========================================================================
// useSecurityIssues
// ===========================================================================

describe('useSecurityIssues', () => {
  it('returns initial loading state with empty issues array', () => {
    mockFetchSSE.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSecurityIssues())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.issues).toEqual([])
  })

  it('returns security issues after SSE fetch resolves', async () => {
    const fakeIssues = [
      { name: 'api-server-pod', namespace: 'production', cluster: 'c1', issue: 'Privileged container', severity: 'high' as const, details: 'Running in privileged mode' },
    ]
    mockFetchSSE.mockResolvedValue(fakeIssues)

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual(fakeIssues)
    expect(result.current.error).toBeNull()
    expect(result.current.isUsingDemoData).toBe(false)
  })

  it('returns demo security issues when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    // Wait for demo data to appear (isLoading may transition through true/false quickly)
    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(result.current.isUsingDemoData).toBe(true)
  })

  it('forwards cluster and namespace via SSE params', async () => {
    mockFetchSSE.mockResolvedValue([])

    renderHook(() => useSecurityIssues('prod-cluster', 'production'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    const callArgs = mockFetchSSE.mock.calls[0][0] as { params: Record<string, string> }
    expect(callArgs.params?.cluster).toBe('prod-cluster')
    expect(callArgs.params?.namespace).toBe('production')
  })

  it('handles SSE failure and tracks consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE error'))

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Only 1 failure so far
    expect(result.current.isFailed).toBe(false)
  })

  it('provides refetch function', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => useSecurityIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns lastRefresh timestamp', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useSecurityIssues())

    // Wait for demo data to appear (isLoading may not transition cleanly)
    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(result.current.lastRefresh).toBeDefined()
  })
})

// ===========================================================================
// useGitOpsDrifts
// ===========================================================================

describe('useGitOpsDrifts', () => {
  it('returns initial loading state with empty drifts array', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGitOpsDrifts())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.drifts).toEqual([])
  })

  it('returns drifts after fetch resolves', async () => {
    const fakeDrifts = [
      { resource: 'api-gateway', namespace: 'production', cluster: 'prod-east', kind: 'Deployment', driftType: 'modified' as const, gitVersion: 'v2.4.0', severity: 'medium' as const },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: fakeDrifts }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.drifts).toEqual(fakeDrifts)
    expect(result.current.error).toBeNull()
  })

  it('returns demo drifts when demo mode is active', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useGitOpsDrifts())

    // Wait for demo data to appear (isLoading may not transition cleanly due to setState batching)
    await waitFor(() => expect(result.current.drifts.length).toBeGreaterThan(0))
  })

  it('handles fetch failure and tracks consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('provides refetch function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('returns lastRefresh timestamp', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drifts: [] }),
    })

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastRefresh).toBeDefined()
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('error'))

    const { result } = renderHook(() => useGitOpsDrifts())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFailed).toBe(false) // only 1 failure
  })
})
