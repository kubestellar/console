import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock state -- controlled from tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockAgentUnavailable = false
const mockClusterCacheRef = {
  clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
}

/** Mocked value for LOCAL_AGENT_HTTP_URL -- tests can override via resetModules */
let mockLocalAgentUrl = 'http://127.0.0.1:8585'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockAgentUnavailable,
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    get LOCAL_AGENT_HTTP_URL() { return mockLocalAgentUrl },
    STORAGE_KEY_TOKEN: 'token',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    POLL_INTERVAL_MS: 30_000,
    POLL_INTERVAL_SLOW_MS: 60_000,
  }
})

vi.mock('../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockDemoMode = false
  mockAgentUnavailable = false
  mockLocalAgentUrl = 'http://127.0.0.1:8585'
  mockClusterCacheRef.clusters = []
  vi.spyOn(globalThis, 'fetch').mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper
// ---------------------------------------------------------------------------

async function importFresh() {
  vi.resetModules()
  return import('../useWorkloads')
}


describe('useWorkloads via agent with clusters', () => {
  it('fetches workloads from agent when clusters are available', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'prod-cluster', context: 'prod-ctx', reachable: true },
    ]
    const { mapSettledWithConcurrency } = await import('../../lib/utils/concurrency')
    const mapSettledMock = vi.mocked(mapSettledWithConcurrency)
    mapSettledMock.mockResolvedValue([
      {
        status: 'fulfilled',
        value: [
          {
            name: 'nginx',
            namespace: 'default',
            type: 'Deployment' as const,
            cluster: 'prod-cluster',
            replicas: 1,
            readyReplicas: 1,
            status: 'Running' as const,
            image: 'nginx:latest',
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      },
    ])

    const { useWorkloads } = await importFresh()
    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.data).toBeDefined()
    // Verify the agent concurrency path was actually invoked
    expect(mapSettledMock).toHaveBeenCalled()
  })

  it('falls back to REST when agent returns null (no clusters)', async () => {
    mockClusterCacheRef.clusters = []
    const mockWorkloads = [
      { name: 'web', namespace: 'default', type: 'Deployment', replicas: 1, readyReplicas: 1, status: 'Running', image: 'web:v2', createdAt: '2025-01-01T00:00:00Z' },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: mockWorkloads }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const { useWorkloads } = await importFresh()
    const { result } = renderHook(() => useWorkloads())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // Verify it fell back to REST API fetch (not agent path)
    expect(fetchSpy).toHaveBeenCalled()
    const fetchUrl = fetchSpy.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/api/')
    expect(result.current.data).toBeDefined()
  })

  it('authHeaders returns empty object when no token stored', async () => {
    const { authHeaders } = await importFresh()
    const headers = authHeaders()
    expect(headers.Authorization).toBeUndefined()
    expect(Object.keys(headers).length).toBe(0)
  })

  it('requireLocalAgentHttp throws with action name in message', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()
    expect(() => requireLocalAgentHttp('Restarting pod')).toThrow('Restarting pod')
  })
})
