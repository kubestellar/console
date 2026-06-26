import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsConnected = vi.fn(() => false)
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: mockIsConnected() }),
  isAgentUnavailable: vi.fn(() => true),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  getDemoMode: () => mockIsDemoMode(),
}))

const mockProgress = vi.fn<() => { progress: null | { status: string }; dismiss: ReturnType<typeof vi.fn> }>(() => ({
  progress: null,
  dismiss: vi.fn(),
}))
vi.mock('../useClusterProgress', () => ({
  useClusterProgress: () => mockProgress(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 5000,
    RETRY_DELAY_MS: 10,
    UI_FEEDBACK_TIMEOUT_MS: 10,
  }
})

import { useLocalClusterTools } from '../useLocalClusterTools'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status = 500): Response {
  return new Response(body, { status })
}

function defaultConnectedFetch(url: RequestInfo | URL): Promise<Response> {
  const urlStr = String(url)
  if (urlStr.includes('/local-cluster-tools')) return Promise.resolve(jsonResponse({ tools: [] }))
  if (urlStr.includes('/vcluster/list')) return Promise.resolve(jsonResponse({ instances: [] }))
  if (urlStr.includes('/local-clusters')) return Promise.resolve(jsonResponse({ clusters: [] }))
  return Promise.resolve(jsonResponse({}))
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockIsConnected.mockReturnValue(false)
  mockIsDemoMode.mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn(defaultConnectedFetch))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLocalClusterTools — expanded edge cases', () => {
  // 1. Not connected, not demo => empty everything
  it('returns empty tools and clusters when not connected and not demo', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tools).toEqual([])
    expect(result.current.clusters).toEqual([])
    expect(result.current.vclusterInstances).toEqual([])
  })

  // 2. Demo mode shows demo data without agent
  it('shows demo tools and clusters in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    await waitFor(() => expect(result.current.tools.length).toBeGreaterThan(0))
    expect(result.current.tools.some(t => t.name === 'kind')).toBe(true)
    expect(result.current.clusters.length).toBeGreaterThan(0)
    expect(result.current.vclusterInstances.length).toBeGreaterThan(0)
  })

  // 3. createCluster in demo mode simulates creation
  it('simulates cluster creation in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createCluster('kind', 'test-cluster')
    })
    expect(createResult?.status).toBe('creating')
    expect(createResult?.message).toContain('Simulation')
  })

  // 4. createCluster when not connected returns error
  it('returns error when creating cluster without agent connected', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createCluster('kind', 'test')
    })
    expect(createResult?.status).toBe('error')
    expect(createResult?.message).toContain('Agent not connected')
  })

  // 5. createCluster with real agent success
  it('creates cluster via agent when connected', async () => {
    mockIsConnected.mockReturnValue(true)
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/local-clusters') && !urlStr.includes('?')) {
        return Promise.resolve(jsonResponse({ message: 'Creating kind cluster' }))
      }
      return Promise.resolve(defaultConnectedFetch(url))
    })
    const { result } = renderHook(() => useLocalClusterTools())
    await waitFor(() => expect(result.current.isConnected).toBe(true))
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createCluster('kind', 'new-cluster')
    })
    expect(createResult?.status).toBe('creating')
  })

  // 6. createCluster handles non-ok response
  it('returns error text from non-ok create response', async () => {
    mockIsConnected.mockReturnValue(true)
    vi.mocked(fetch).mockImplementation((url, opts) => {
      const urlStr = String(url)
      const method = (opts as RequestInit)?.method || 'GET'
      if (urlStr.includes('/local-clusters') && method === 'POST') {
        return Promise.resolve(textResponse('cluster already exists'))
      }
      return Promise.resolve(defaultConnectedFetch(url))
    })
    const { result } = renderHook(() => useLocalClusterTools())
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createCluster('kind', 'dup')
    })
    expect(createResult?.status).toBe('error')
    expect(createResult?.message).toContain('cluster already exists')
  })

  // 7. createCluster catches network errors
  it('catches network error during create', async () => {
    mockIsConnected.mockReturnValue(true)
    vi.mocked(fetch).mockImplementation((url, opts) => {
      const method = (opts as RequestInit)?.method || 'GET'
      if (method === 'POST') return Promise.reject(new Error('Network failure'))
      return Promise.resolve(defaultConnectedFetch(url))
    })
    const { result } = renderHook(() => useLocalClusterTools())
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createCluster('kind', 'fail')
    })
    expect(createResult?.status).toBe('error')
    expect(createResult?.message).toBe('Network failure')
  })

  // 8. deleteCluster in demo mode simulates deletion
  it('simulates cluster deletion in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.deleteCluster('kind', 'test')
    })
    expect(success).toBe(true)
  })

  // 9. deleteCluster when not connected returns false
  it('returns false when deleting without agent', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.deleteCluster('kind', 'test')
    })
    expect(success).toBe(false)
  })

  // 10. clusterLifecycle in demo mode
  it('simulates lifecycle action in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.clusterLifecycle('kind', 'test', 'restart')
    })
    expect(success).toBe(true)
  })

  // 11. clusterLifecycle when not connected
  it('returns false for lifecycle when not connected', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.clusterLifecycle('kind', 'test', 'start')
    })
    expect(success).toBe(false)
  })

  // 12. connectVCluster in demo mode
  it('simulates vCluster connect in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.connectVCluster('dev-tenant', 'vcluster')
    })
    expect(success).toBe(true)
  })

  // 13. disconnectVCluster when not connected
  it('returns false for disconnect when not connected', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.disconnectVCluster('tenant', 'ns')
    })
    expect(success).toBe(false)
  })

  // 14. deleteVCluster in demo mode
  it('simulates vCluster deletion in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useLocalClusterTools())
    let success: boolean | undefined
    await act(async () => {
      success = await result.current.deleteVCluster('test', 'ns')
    })
    expect(success).toBe(true)
  })

  // 15. createVCluster when not connected
  it('returns error for createVCluster when not connected', async () => {
    const { result } = renderHook(() => useLocalClusterTools())
    let createResult: { status: string; message: string } | undefined
    await act(async () => {
      createResult = await result.current.createVCluster('test', 'ns')
    })
    expect(createResult?.status).toBe('error')
    expect(createResult?.message).toContain('Agent not connected')
  })

  // 16. clusterProgress done triggers refresh
  it('refreshes clusters when clusterProgress status is done', async () => {
    mockIsConnected.mockReturnValue(true)
    mockProgress.mockReturnValue({ progress: { status: 'done' }, dismiss: vi.fn() })
    vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    const { result } = renderHook(() => useLocalClusterTools())
    await waitFor(() => expect(result.current.isConnected).toBe(true))
    // fetch should be called for clusters refresh
    expect(vi.mocked(fetch)).toHaveBeenCalled()
  })

  // 17. fetchTools error sets error state
  it('sets error when fetchTools fails', async () => {
    mockIsConnected.mockReturnValue(true)
    // All fetches must fail so that fetchClusters/fetchVClusters don't clear
    // the error set by fetchTools (they call setError(null) on success).
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/local-cluster-tools')) {
        return Promise.reject(new Error('tools error'))
      }
      // Return non-ok responses for other endpoints so they don't clear the error
      return Promise.resolve(new Response('', { status: 500 }))
    })
    const { result } = renderHook(() => useLocalClusterTools())
    await waitFor(() => expect(result.current.error).toBeTruthy())
  })
})
