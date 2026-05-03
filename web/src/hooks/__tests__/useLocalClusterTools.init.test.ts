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

/** Create a fresh Response with JSON body (each call creates a new instance) */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Realistic test data
const MOCK_TOOLS = [
  { name: 'kind', installed: true, version: '0.20.0', path: '/usr/local/bin/kind' },
  { name: 'k3d', installed: false },
  { name: 'minikube', installed: true, version: '1.32.0', path: '/usr/local/bin/minikube' },
  { name: 'vcluster', installed: true, version: '0.21.0', path: '/usr/local/bin/vcluster' },
]

const MOCK_CLUSTERS = [
  { name: 'kind-dev', tool: 'kind', status: 'running' },
  { name: 'minikube-test', tool: 'minikube', status: 'stopped' },
]

const MOCK_VCLUSTER_INSTANCES = [
  { name: 'dev-tenant', namespace: 'vcluster', status: 'Running', connected: true, context: 'vcluster_dev-tenant_vcluster' },
  { name: 'staging', namespace: 'vcluster', status: 'Paused', connected: false },
]

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsConnected.mockReturnValue(false)
  mockIsDemoMode.mockReturnValue(false)
  mockProgress.mockReturnValue({ progress: null, dismiss: vi.fn() })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


describe('useLocalClusterTools - initialization', () => {
  describe('initialization', () => {
    it('returns expected shape with all properties', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current).toHaveProperty('tools')
      expect(result.current).toHaveProperty('installedTools')
      expect(result.current).toHaveProperty('clusters')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isCreating')
      expect(result.current).toHaveProperty('isDeleting')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('isConnected')
      expect(result.current).toHaveProperty('isDemoMode')
      expect(result.current).toHaveProperty('clusterProgress')
      expect(result.current).toHaveProperty('dismissProgress')
      expect(result.current).toHaveProperty('createCluster')
      expect(result.current).toHaveProperty('deleteCluster')
      expect(result.current).toHaveProperty('clusterLifecycle')
      expect(result.current).toHaveProperty('refresh')
      // vCluster properties
      expect(result.current).toHaveProperty('vclusterInstances')
      expect(result.current).toHaveProperty('vclusterClusterStatus')
      expect(result.current).toHaveProperty('checkVClusterOnCluster')
      expect(result.current).toHaveProperty('isConnecting')
      expect(result.current).toHaveProperty('isDisconnecting')
      expect(result.current).toHaveProperty('createVCluster')
      expect(result.current).toHaveProperty('connectVCluster')
      expect(result.current).toHaveProperty('disconnectVCluster')
      expect(result.current).toHaveProperty('deleteVCluster')
      expect(result.current).toHaveProperty('fetchVClusters')
    })

    it('starts with empty arrays and no error', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current.tools).toEqual([])
      expect(result.current.clusters).toEqual([])
      expect(result.current.vclusterInstances).toEqual([])
      expect(result.current.vclusterClusterStatus).toEqual([])
      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isCreating).toBe(false)
      expect(result.current.isDeleting).toBeNull()
      expect(result.current.isConnecting).toBeNull()
      expect(result.current.isDisconnecting).toBeNull()
    })
  })

  // =========================================================================
  // Not connected, not demo
  // =========================================================================
  describe('disconnected (not demo)', () => {
    it('returns empty tools and clusters when agent is not connected', () => {
      mockIsConnected.mockReturnValue(false)
      mockIsDemoMode.mockReturnValue(false)
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current.tools).toEqual([])
      expect(result.current.clusters).toEqual([])
      expect(result.current.vclusterInstances).toEqual([])
    })

    it('does not call fetch when disconnected', () => {
      mockIsConnected.mockReturnValue(false)
      mockIsDemoMode.mockReturnValue(false)
      renderHook(() => useLocalClusterTools())
      expect(fetch).not.toHaveBeenCalled()
    })

    it('createCluster returns error when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createCluster('kind', 'test')
      })
      expect(outcome).toEqual({ status: 'error', message: 'Agent not connected' })
    })

    it('deleteCluster returns false when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteCluster('kind', 'test')
      })
      expect(outcome).toBe(false)
    })

    it('clusterLifecycle returns false when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.clusterLifecycle('kind', 'test', 'start')
      })
      expect(outcome).toBe(false)
    })

    it('connectVCluster returns false when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.connectVCluster('vc1', 'ns')
      })
      expect(outcome).toBe(false)
    })

    it('disconnectVCluster returns false when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.disconnectVCluster('vc1', 'ns')
      })
      expect(outcome).toBe(false)
    })

    it('createVCluster returns error when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createVCluster('vc1', 'ns')
      })
      expect(outcome).toEqual({ status: 'error', message: 'Agent not connected' })
    })

    it('deleteVCluster returns false when not connected', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteVCluster('vc1', 'ns')
      })
      expect(outcome).toBe(false)
    })
  })

  // =========================================================================
  // Demo mode (without agent)
  // =========================================================================
  describe('demo mode (without agent)', () => {
    beforeEach(() => {
      mockIsDemoMode.mockReturnValue(true)
      mockIsConnected.mockReturnValue(false)
    })

    it('returns demo tools when in demo mode without agent', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {
        expect(result.current.tools.length).toBe(4)
      })
      const toolNames = result.current.tools.map(t => t.name)
      expect(toolNames).toContain('kind')
      expect(toolNames).toContain('k3d')
      expect(toolNames).toContain('minikube')
      expect(toolNames).toContain('vcluster')
    })

    it('returns demo clusters when in demo mode', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {
        expect(result.current.clusters.length).toBe(4)
      })
      expect(result.current.clusters[0].name).toBe('kind-local')
    })

    it('returns demo vCluster instances', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {
        expect(result.current.vclusterInstances.length).toBe(3)
      })
      expect(result.current.vclusterInstances[0].name).toBe('dev-tenant')
    })

    it('does not call fetch in demo mode without agent', async () => {
      renderHook(() => useLocalClusterTools())
      await waitFor(() => {})
      const fetchCalls = vi.mocked(fetch).mock.calls
      const agentCalls = fetchCalls.filter(c => String(c[0]).includes('localhost:8585'))
      expect(agentCalls).toHaveLength(0)
    })

    it('installedTools returns only installed demo tools', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {
        expect(result.current.installedTools.length).toBe(4)
      })
      // All demo tools are installed
      result.current.installedTools.forEach(t => {
        expect(t.installed).toBe(true)
      })
    })

    it('createCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.createCluster('kind', 'my-cluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toEqual({
        status: 'creating',
        message: expect.stringContaining('Simulation'),
      })
    })

    it('deleteCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.deleteCluster('kind', 'my-cluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toBe(true)
    })

    it('clusterLifecycle simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.clusterLifecycle('kind', 'my-cluster', 'stop')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toBe(true)
    })

    it('connectVCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.connectVCluster('dev-tenant', 'vcluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toBe(true)
    })

    it('disconnectVCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.disconnectVCluster('dev-tenant', 'vcluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toBe(true)
    })

    it('createVCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.createVCluster('my-vc', 'vcluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toEqual({
        status: 'creating',
        message: expect.stringContaining('Simulation'),
      })
    })

    it('deleteVCluster simulates in demo mode', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useLocalClusterTools())
      let outcome: unknown
      await act(async () => {
        const promise = result.current.deleteVCluster('dev-tenant', 'vcluster')
        await vi.advanceTimersByTimeAsync(50)
        outcome = await promise
      })
      expect(outcome).toBe(true)
    })
  })

  // =========================================================================
  // Agent connected - fetching
  // =========================================================================
  describe('agent connected - fetching', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
    })

    it('fetches tools on mount when connected', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-cluster-tools')) {
          return Promise.resolve(jsonResponse({ tools: MOCK_TOOLS }))
        }
        return Promise.resolve(jsonResponse({ clusters: [], vclusters: [] }))
      })

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.tools.length).toBe(4)
      })
      expect(result.current.tools).toEqual(MOCK_TOOLS)
      expect(result.current.error).toBeNull()
    })

    it('fetches clusters on mount when connected', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-cluster-tools')) {
          return Promise.resolve(jsonResponse({ tools: [] }))
        }
        if (urlStr.includes('/vcluster/list')) {
          return Promise.resolve(jsonResponse({ vclusters: [] }))
        }
        if (urlStr.includes('/local-clusters')) {
          return Promise.resolve(jsonResponse({ clusters: MOCK_CLUSTERS }))
        }
        return Promise.resolve(jsonResponse({}))
      })

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.clusters.length).toBe(2)
      })
      expect(result.current.clusters).toEqual(MOCK_CLUSTERS)
    })

    it('fetches vCluster instances on mount when connected', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/vcluster/list')) {
          return Promise.resolve(jsonResponse({ vclusters: MOCK_VCLUSTER_INSTANCES }))
        }
        return Promise.resolve(jsonResponse({ tools: [], clusters: [] }))
      })

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.vclusterInstances.length).toBe(2)
      })
      expect(result.current.vclusterInstances).toEqual(MOCK_VCLUSTER_INSTANCES)
    })

    it('computes installedTools correctly from fetched data', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-cluster-tools')) {
          return Promise.resolve(jsonResponse({ tools: MOCK_TOOLS }))
        }
        return Promise.resolve(jsonResponse({ clusters: [], vclusters: [] }))
      })

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.tools.length).toBe(4)
      })
      // k3d is not installed, so only 3
      expect(result.current.installedTools.length).toBe(3)
      expect(result.current.installedTools.every(t => t.installed)).toBe(true)
    })

    it('sets error on fetch tools failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })

    it('sets error on fetch clusters failure', async () => {
      // All fetches fail so the error isn't overwritten by a subsequent
      // successful fetch calling setError(null)
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })

    it('sets error on fetch vCluster failure', async () => {
      // All fetches reject so the vCluster error isn't cleared by another
      vi.mocked(fetch).mockRejectedValue(new Error('vCluster fetch failed'))

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        // The last error to resolve wins -- could be any of the three messages
        expect(result.current.error).toBeTruthy()
      })
    })

    it('handles empty tools/clusters from API gracefully', async () => {
      vi.mocked(fetch).mockImplementation(() => {
        return Promise.resolve(jsonResponse({}))
      })

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        // data.tools is undefined, should default to []
        expect(result.current.tools).toEqual([])
      })
    })
  })

  // =========================================================================
  // createCluster (connected)
  // =========================================================================
})
