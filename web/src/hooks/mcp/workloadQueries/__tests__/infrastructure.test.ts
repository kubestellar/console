/**
 * infrastructure.ts hook tests — branch-coverage for useJobs and useHPAs.
 *
 * Tests the no-agent-URL early-exit path (isLoading→false, empty collection)
 * and the agent-unavailable SSE path using a mocked fetchSSE. Full network
 * paths live in integration tests; here we focus on observable hook state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted refs
// ---------------------------------------------------------------------------

const { mockIsAgentUnavailable, mockIsClusterModeBackend, mockFetchSSE } = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => true),
  mockIsClusterModeBackend: vi.fn(() => false),
  mockFetchSSE: vi.fn(async () => []),
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: '',         // empty → triggers early-exit branch
  RETRY_DELAY_MS: 0,
}))

vi.mock('../../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: () => 'http://localhost:8080',
  isClusterModeBackend: () => mockIsClusterModeBackend(),
}))

vi.mock('../../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../shared', () => ({
  agentFetch: vi.fn(),
  fetchWithRetry: vi.fn(),
}))

vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    fetchInClusterCollection: vi.fn(async () => null),
  }
})

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { useJobs, useHPAs, useReplicaSets, useStatefulSets, useDaemonSets, useCronJobs } from '../infrastructure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAgentUnavailable.mockReturnValue(true)
  mockIsClusterModeBackend.mockReturnValue(false)
  mockFetchSSE.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

describe('useJobs', () => {
  it('returns empty jobs and isLoading=false when LOCAL_AGENT_HTTP_URL is empty', async () => {
    const { result } = renderHook(() => useJobs())
    // Wait for async fetch to complete
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.jobs).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('initial state has isLoading=true', () => {
    const { result } = renderHook(() => useJobs('cluster-a'))
    expect(result.current.isLoading).toBe(true)
  })

  it('returns isFailed=false when consecutiveFailures < 3', async () => {
    const { result } = renderHook(() => useJobs())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('refetch is callable without throwing', async () => {
    const { result } = renderHook(() => useJobs())
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.jobs).toEqual([])
  })

  it('exposes error as null on clean init', async () => {
    const { result } = renderHook(() => useJobs())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useHPAs
// ---------------------------------------------------------------------------

describe('useHPAs', () => {
  it('returns empty hpas and isLoading=false when no agent URL', async () => {
    const { result } = renderHook(() => useHPAs())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.hpas).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('isFailed=false on clean init', async () => {
    const { result } = renderHook(() => useHPAs())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.isFailed).toBe(false)
  })

  it('refetch is callable', async () => {
    const { result } = renderHook(() => useHPAs('cluster-a', 'default'))
    await act(async () => { await result.current.refetch() })
    expect(result.current.hpas).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// useReplicaSets
// ---------------------------------------------------------------------------

describe('useReplicaSets', () => {
  it('returns empty replicaSets on no-agent path', async () => {
    const { result } = renderHook(() => useReplicaSets())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.replicaSets).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useStatefulSets
// ---------------------------------------------------------------------------

describe('useStatefulSets', () => {
  it('returns empty statefulSets on no-agent path', async () => {
    const { result } = renderHook(() => useStatefulSets())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.statefulSets).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useDaemonSets
// ---------------------------------------------------------------------------

describe('useDaemonSets', () => {
  it('returns empty daemonSets on no-agent path', async () => {
    const { result } = renderHook(() => useDaemonSets())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.daemonSets).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useCronJobs
// ---------------------------------------------------------------------------

describe('useCronJobs', () => {
  it('returns empty cronJobs on no-agent path', async () => {
    const { result } = renderHook(() => useCronJobs())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.cronJobs).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})
