/**
 * Deep branch-coverage tests for useDependencies.ts
 *
 * Tests the useResolveDependencies hook: demo mode path, REST API path,
 * agent fallback path, combined failure path, error message construction,
 * reset behavior, auth headers, and the resolveViaAgent internal logic
 * (cluster context mapping, isAgentUnavailable guard).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so references are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockIsAgentUnavailable, mockClusterCacheRef, mockIsDemoMode } = vi.hoisted(() => ({
  mockIsAgentUnavailable: vi.fn(() => true),
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
  mockIsDemoMode: vi.fn(() => false),
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: (...args: unknown[]) => mockIsAgentUnavailable(...args),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
    STORAGE_KEY_TOKEN: 'kc-auth-token',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, MCP_HOOK_TIMEOUT_MS: 10_000 }
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import hook under test AFTER mocks
// ---------------------------------------------------------------------------

import { useResolveDependencies } from '../useDependencies'
import type { DependencyResolution } from '../useDependencies'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
  })
}

function makeResolution(overrides?: Partial<DependencyResolution>): DependencyResolution {
  return {
    workload: 'nginx',
    kind: 'Deployment',
    namespace: 'default',
    cluster: 'cluster-a',
    dependencies: [
      { kind: 'ConfigMap', name: 'nginx-config', namespace: 'default', optional: false, order: 0 },
      { kind: 'Secret', name: 'nginx-tls', namespace: 'default', optional: false, order: 1 },
    ],
    warnings: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useResolveDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    localStorage.clear()
    mockIsDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initial state ─────────────────────────────────────────────────

  it('starts in idle state with no data, no error, not loading', () => {
    const { result } = renderHook(() => useResolveDependencies())

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.progressMessage).toBe('')
  })

  // ── Demo mode ─────────────────────────────────────────────────────

  it('returns synthetic demo data in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('cluster-a', 'production', 'my-app')
    })

    expect(resolution).not.toBeNull()
    expect(resolution!.workload).toBe('my-app')
    expect(resolution!.namespace).toBe('production')
    expect(resolution!.cluster).toBe('cluster-a')
    expect(resolution!.dependencies.length).toBe(10)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBe(resolution)
  })

  it('demo dependencies include expected resource kinds', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('c', 'ns', 'app')
    })

    const kinds = resolution!.dependencies.map(d => d.kind)
    expect(kinds).toContain('ConfigMap')
    expect(kinds).toContain('Secret')
    expect(kinds).toContain('ServiceAccount')
    expect(kinds).toContain('Service')
    expect(kinds).toContain('HorizontalPodAutoscaler')
  })

  it('demo dependencies use correct naming convention based on workload name', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('c', 'ns', 'frontend')
    })

    const configMap = resolution!.dependencies.find(d => d.kind === 'ConfigMap')
    expect(configMap!.name).toBe('frontend-config')
  })

  // ── REST API success path ─────────────────────────────────────────

  it('resolves via REST API on success', async () => {
    const apiResult = makeResolution()
    mockFetch.mockReturnValueOnce(jsonResponse(apiResult))

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('cluster-a', 'default', 'nginx')
    })

    expect(resolution).not.toBeNull()
    expect(resolution!.workload).toBe('nginx')
    expect(result.current.data).toEqual(apiResult)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('passes auth headers when token exists in localStorage', async () => {
    localStorage.setItem('kc-auth-token', 'my-jwt-token')
    mockFetch.mockReturnValueOnce(jsonResponse(makeResolution()))

    const { result } = renderHook(() => useResolveDependencies())

    await act(async () => {
      await result.current.resolve('cluster-a', 'default', 'nginx')
    })

    const restCall = mockFetch.mock.calls[0]
    expect(restCall[1].headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer my-jwt-token' }),
    )
  })

  it('sends request without Authorization header when no token', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(makeResolution()))

    const { result } = renderHook(() => useResolveDependencies())

    await act(async () => {
      await result.current.resolve('c', 'ns', 'app')
    })

    const restCall = mockFetch.mock.calls[0]
    expect(restCall[1].headers).not.toHaveProperty('Authorization')
  })

  // ── REST API failure, agent fallback ──────────────────────────────

  it('falls back to agent when REST API returns non-ok', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
    ]

    const agentResult = makeResolution({ cluster: 'ctx-a' })

    // REST fails (500), agent succeeds
    mockFetch
      .mockReturnValueOnce(jsonResponse(null, 500))
      .mockReturnValueOnce(jsonResponse(agentResult))

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('cluster-a', 'default', 'nginx')
    })

    expect(resolution).not.toBeNull()
    expect(result.current.error).toBeNull()
    // The agent call should have been made with the mapped context
    const agentCall = mockFetch.mock.calls[1]
    expect(agentCall[0]).toContain('http://localhost:8585/resolve-deps')
    expect(agentCall[0]).toContain('cluster=ctx-a')
  })

  it('uses cluster name as context when no matching entry in cache', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = []  // no clusters in cache

    const agentResult = makeResolution()

    mockFetch
      .mockReturnValueOnce(jsonResponse(null, 500))  // REST fails
      .mockReturnValueOnce(jsonResponse(agentResult))

    const { result } = renderHook(() => useResolveDependencies())

    await act(async () => {
      await result.current.resolve('my-cluster', 'default', 'nginx')
    })

    // Should fall back to using 'my-cluster' as the context directly
    const agentCall = mockFetch.mock.calls[1]
    expect(agentCall[0]).toContain('cluster=my-cluster')
  })

  it('skips unreachable clusters when mapping context', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [
      { name: 'cluster-a', context: 'ctx-unreachable', reachable: false },
    ]

    const agentResult = makeResolution()

    mockFetch
      .mockReturnValueOnce(jsonResponse(null, 500))
      .mockReturnValueOnce(jsonResponse(agentResult))

    const { result } = renderHook(() => useResolveDependencies())

    await act(async () => {
      await result.current.resolve('cluster-a', 'default', 'nginx')
    })

    // The unreachable cluster entry should be skipped, using raw name
    const agentCall = mockFetch.mock.calls[1]
    expect(agentCall[0]).toContain('cluster=cluster-a')
  })

  // ── Agent unavailable, skips to combined error ─────────────────────

  it('skips agent when isAgentUnavailable returns true and reports both failures', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)

    // REST fails
    mockFetch.mockReturnValueOnce(jsonResponse(null, 500))

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('cluster-a', 'default', 'nginx')
    })

    expect(resolution).toBeNull()
    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('REST API')
  })

  // ── Both REST and agent fail ──────────────────────────────────────

  it('reports combined error when both REST and agent fail', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [{ name: 'c', context: 'ctx', reachable: true }]

    // REST fails with network error
    mockFetch
      .mockRejectedValueOnce(new Error('REST timeout'))
      .mockRejectedValueOnce(new Error('Agent 503'))

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('c', 'ns', 'app')
    })

    expect(resolution).toBeNull()
    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('REST API')
    expect(result.current.error!.message).toContain('Agent')
    expect(result.current.isLoading).toBe(false)
  })

  it('handles agent returning error field in response', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockClusterCacheRef.clusters = [{ name: 'c', context: 'ctx', reachable: true }]

    // REST fails
    mockFetch
      .mockReturnValueOnce(jsonResponse(null, 500))
      // Agent returns ok but with an error field
      .mockReturnValueOnce(jsonResponse({ error: 'resource not found' }))

    const { result } = renderHook(() => useResolveDependencies())

    let resolution: DependencyResolution | null = null
    await act(async () => {
      resolution = await result.current.resolve('c', 'ns', 'app')
    })

    expect(resolution).toBeNull()
    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('Agent')
    expect(result.current.error!.message).toContain('resource not found')
  })

  // ── Reset ─────────────────────────────────────────────────────────

  it('reset clears data, error, loading, and progressMessage', async () => {
    mockIsDemoMode.mockReturnValue(true)

    const { result } = renderHook(() => useResolveDependencies())

    // First resolve to populate data
    await act(async () => {
      await result.current.resolve('c', 'ns', 'app')
    })
    expect(result.current.data).not.toBeNull()

    // Now reset
    act(() => {
      result.current.reset()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.progressMessage).toBe('')
  })

  // ── Loading state transitions ─────────────────────────────────────

  it('sets isLoading=true during resolve and false after', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(makeResolution()))

    const { result } = renderHook(() => useResolveDependencies())

    // Start resolve (don't await yet)
    let resolvePromise: Promise<DependencyResolution | null>
    act(() => {
      resolvePromise = result.current.resolve('c', 'ns', 'app')
    })

    // Should be loading now
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      await resolvePromise!
    })

    expect(result.current.isLoading).toBe(false)
  })

  // ── progressMessage updates ───────────────────────────────────────

  it('sets progressMessage during resolve', async () => {
    // Block fetch to inspect intermediate state
    let resolveFetch: (v: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(r => { resolveFetch = r }))

    const { result } = renderHook(() => useResolveDependencies())

    act(() => {
      result.current.resolve('c', 'ns', 'app')
    })

    // progressMessage should be set during resolve — the first synchronous
    // setProgressMessage is 'Connecting to cluster...' but by the time React
    // batches state, the REST attempt's 'Scanning pod spec...' may have
    // replaced it. Either is valid.
    expect(result.current.progressMessage).toBeTruthy()
    expect(result.current.progressMessage.length).toBeGreaterThan(0)

    // Unblock
    await act(async () => {
      resolveFetch!(jsonResponse(makeResolution()))
    })
  })

  // ── URL encoding ──────────────────────────────────────────────────

  it('encodes cluster, namespace, and name in REST URL', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(makeResolution()))

    const { result } = renderHook(() => useResolveDependencies())

    await act(async () => {
      await result.current.resolve('cluster/special', 'my namespace', 'app&name')
    })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('cluster%2Fspecial')
    expect(url).toContain('my%20namespace')
    expect(url).toContain('app%26name')
  })
})
