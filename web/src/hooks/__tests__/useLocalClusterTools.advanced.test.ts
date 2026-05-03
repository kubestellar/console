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

/**
 * Default fetch implementation for connected mode that returns fresh Response
 * objects per call so body can be read multiple times independently.
 */
function defaultConnectedFetch(url: RequestInfo | URL): Promise<Response> {
  const urlStr = String(url)
  if (urlStr.includes('/local-cluster-tools')) {
    return Promise.resolve(jsonResponse({ tools: [] }))
  }
  if (urlStr.includes('/vcluster/list')) {
    return Promise.resolve(jsonResponse({ vclusters: [] }))
  }
  if (urlStr.includes('/local-clusters')) {
    return Promise.resolve(jsonResponse({ clusters: [] }))
  }
  return Promise.resolve(jsonResponse({}))
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


describe('useLocalClusterTools - advanced operations', () => {
  describe('refresh', () => {
    it('calls fetch for all endpoints when connected', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      // Clear mock calls from initial mount
      vi.mocked(fetch).mockClear()
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-cluster-tools')) {
          return Promise.resolve(jsonResponse({ tools: MOCK_TOOLS }))
        }
        if (urlStr.includes('/vcluster/list')) {
          return Promise.resolve(jsonResponse({ vclusters: [] }))
        }
        if (urlStr.includes('/local-clusters')) {
          return Promise.resolve(jsonResponse({ clusters: MOCK_CLUSTERS }))
        }
        return Promise.resolve(jsonResponse({}))
      })

      await act(async () => {
        result.current.refresh()
      })

      await waitFor(() => {
        expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(3)
      })
    })
  })

  // =========================================================================
  // clusterProgress effect
  // =========================================================================
  describe('clusterProgress auto-refresh', () => {
    it('refreshes clusters and vclusters when progress status is done', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)

      // Start with null progress
      const { rerender } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      // Switch to done progress
      mockProgress.mockReturnValue({ progress: { status: 'done' }, dismiss: vi.fn() })
      vi.mocked(fetch).mockClear()
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-clusters')) {
          return Promise.resolve(jsonResponse({ clusters: MOCK_CLUSTERS }))
        }
        if (urlStr.includes('/vcluster/list')) {
          return Promise.resolve(jsonResponse({ vclusters: [] }))
        }
        return Promise.resolve(jsonResponse({ tools: [] }))
      })

      rerender()

      await waitFor(() => {
        const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]))
        const clusterCalls = urls.filter(
          u => u.includes('/local-clusters') || u.includes('/vcluster/list')
        )
        expect(clusterCalls.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  // =========================================================================
  // Effect: reset state when disconnected
  // =========================================================================
  describe('state reset on disconnect', () => {
    it('clears all state when disconnecting (not demo)', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-cluster-tools')) {
          return Promise.resolve(jsonResponse({ tools: MOCK_TOOLS }))
        }
        if (urlStr.includes('/vcluster/list')) {
          return Promise.resolve(jsonResponse({ vclusters: MOCK_VCLUSTER_INSTANCES }))
        }
        if (urlStr.includes('/local-clusters')) {
          return Promise.resolve(jsonResponse({ clusters: MOCK_CLUSTERS }))
        }
        return Promise.resolve(jsonResponse({}))
      })

      const { result, rerender } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {
        expect(result.current.tools.length).toBeGreaterThan(0)
      })

      // Now disconnect
      mockIsConnected.mockReturnValue(false)
      mockIsDemoMode.mockReturnValue(false)
      rerender()

      await waitFor(() => {
        expect(result.current.tools).toEqual([])
        expect(result.current.clusters).toEqual([])
        expect(result.current.vclusterInstances).toEqual([])
        expect(result.current.vclusterClusterStatus).toEqual([])
      })
    })
  })

  // =========================================================================
  // fetchVClusterClusterStatus (no-op)
  // =========================================================================
  describe('fetchVClusterClusterStatus', () => {
    it('is a no-op (does not fetch vcluster/check)', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)

      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockClear()
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)

      await act(async () => {
        result.current.refresh()
      })

      await waitFor(() => {})

      const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]))
      const checkCalls = urls.filter(u => u.includes('/vcluster/check'))
      expect(checkCalls).toHaveLength(0)
    })
  })

  // =========================================================================
  // Cleanup
  // =========================================================================
  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLocalClusterTools())
      expect(() => unmount()).not.toThrow()
    })
  })

  // =========================================================================
  // NEW TESTS — push toward 80% coverage
  // =========================================================================
  describe('vCluster operations (connected)', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    })

    it('createVCluster sends correct POST body', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'vCluster created' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createVCluster('my-vc', 'tenant-ns')
      })
      expect(outcome).toEqual({ status: 'creating', message: 'vCluster created' })

      const calls = vi.mocked(fetch).mock.calls
      const createCall = calls.find(
        c => String(c[0]).includes('/vcluster/create') && (c[1] as RequestInit)?.method === 'POST'
      )
      expect(createCall).toBeTruthy()
      const body = JSON.parse((createCall![1] as RequestInit).body as string)
      expect(body).toEqual({ name: 'my-vc', namespace: 'tenant-ns' })
    })

    it('createVCluster handles non-ok response', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response('namespace not found', { status: 404 }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createVCluster('bad-vc', 'missing-ns')
      })
      expect(outcome).toEqual({ status: 'error', message: 'namespace not found' })
    })

    it('createVCluster handles network error', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('connection refused'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createVCluster('vc', 'ns')
      })
      expect(outcome).toEqual({ status: 'error', message: 'connection refused' })
      expect(result.current.error).toBe('connection refused')
    })

    it('createVCluster handles non-Error thrown', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue('string error')

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createVCluster('vc', 'ns')
      })
      expect(outcome).toEqual({ status: 'error', message: 'Failed to create vCluster' })
    })

    it('connectVCluster sends correct POST and returns true on success', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'connected' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.connectVCluster('dev-vc', 'vcluster')
      })
      expect(outcome).toBe(true)
    })

    it('connectVCluster handles non-ok response', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response('connect failed', { status: 500 }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.connectVCluster('bad-vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('connect failed')
    })

    it('connectVCluster handles network error', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('timeout'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.connectVCluster('vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('timeout')
    })

    it('disconnectVCluster sends correct POST and returns true on success', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'disconnected' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.disconnectVCluster('dev-vc', 'vcluster')
      })
      expect(outcome).toBe(true)
    })

    it('disconnectVCluster handles non-ok response', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response('not connected', { status: 400 }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.disconnectVCluster('bad-vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('not connected')
    })

    it('disconnectVCluster handles non-Error thrown', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(42)

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.disconnectVCluster('vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Failed to disconnect from vCluster')
    })

    it('deleteVCluster sends DELETE request and returns true on success', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'deleted' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteVCluster('old-vc', 'vcluster')
      })
      expect(outcome).toBe(true)
      expect(result.current.isDeleting).toBeNull()
    })

    it('deleteVCluster handles non-ok response', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response('still running', { status: 409 }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteVCluster('active-vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('still running')
    })

    it('deleteVCluster handles network error', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteVCluster('vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('ECONNREFUSED')
    })

    it('deleteVCluster handles non-Error thrown', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(undefined)

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteVCluster('vc', 'ns')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Failed to delete vCluster')
    })
  })

  describe('checkVClusterOnCluster', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    })

    it('fetches vCluster check for a context and updates status', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/vcluster/check')) {
          return Promise.resolve(jsonResponse({
            context: 'prod-ctx',
            name: 'prod-cluster',
            hasCRD: true,
            version: '0.21.0',
            instances: 2,
          }))
        }
        return defaultConnectedFetch(url)
      })

      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      await act(async () => {
        await result.current.checkVClusterOnCluster('prod-ctx')
      })

      expect(result.current.vclusterClusterStatus.length).toBe(1)
      expect(result.current.vclusterClusterStatus[0].context).toBe('prod-ctx')
      expect(result.current.vclusterClusterStatus[0].hasCRD).toBe(true)
    })

    it('does not fetch when not connected', async () => {
      mockIsConnected.mockReturnValue(false)
      const { result } = renderHook(() => useLocalClusterTools())

      await act(async () => {
        await result.current.checkVClusterOnCluster('some-ctx')
      })

      expect(result.current.vclusterClusterStatus).toEqual([])
    })

    it('does not fetch when context is empty', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      const fetchBefore = vi.mocked(fetch).mock.calls.length

      await act(async () => {
        await result.current.checkVClusterOnCluster('')
      })

      // No additional fetch calls for empty context
      const checkCalls = vi.mocked(fetch).mock.calls
        .slice(fetchBefore)
        .filter(c => String(c[0]).includes('/vcluster/check'))
      expect(checkCalls).toHaveLength(0)
    })

    it('handles fetch error silently', async () => {
      vi.mocked(fetch).mockImplementation((url) => {
        if (String(url).includes('/vcluster/check')) {
          return Promise.reject(new Error('network error'))
        }
        return defaultConnectedFetch(url)
      })

      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      await act(async () => {
        await result.current.checkVClusterOnCluster('fail-ctx')
      })

      // Should not crash, status remains empty
      expect(result.current.vclusterClusterStatus).toEqual([])
    })
  })

  describe('auto-refresh on progress completion', () => {
    it('refreshes clusters and vclusters when clusterProgress status is done', async () => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)

      // Start with progress null
      mockProgress.mockReturnValue({ progress: null, dismiss: vi.fn() })
      const { rerender } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockClear()
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)

      // Set progress to 'done'
      mockProgress.mockReturnValue({ progress: { status: 'done' }, dismiss: vi.fn() })
      rerender()

      await waitFor(() => {
        // After progress changes to done, fetchClusters and fetchVClusters should fire
        const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]))
        expect(urls.some(u => u.includes('/local-clusters'))).toBe(true)
      })
    })
  })
})
