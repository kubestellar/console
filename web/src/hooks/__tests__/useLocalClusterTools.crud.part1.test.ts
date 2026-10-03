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
vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
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

/** Create a failed text Response */
function textResponse(body: string, status = 500): Response {
  return new Response(body, { status })
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


describe('useLocalClusterTools - CRUD operations', () => {
  describe('createCluster (connected)', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    })

    it('creates cluster successfully', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/local-clusters') && urlStr.includes('localhost:8585')) {
          return Promise.resolve(jsonResponse({ message: 'Cluster kind-test created' }))
        }
        return defaultConnectedFetch(url)
      })

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createCluster('kind', 'kind-test')
      })
      expect(outcome).toEqual({ status: 'creating', message: 'Cluster kind-test created' })
      expect(result.current.isCreating).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('handles non-ok response on createCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(textResponse('Cluster already exists', 409))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createCluster('kind', 'existing')
      })
      expect(outcome).toEqual({ status: 'error', message: 'Cluster already exists' })
    })

    it('handles network error on createCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('timeout'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createCluster('kind', 'fail')
      })
      expect(outcome).toEqual({ status: 'error', message: 'timeout' })
      expect(result.current.error).toBe('timeout')
    })

    it('handles non-Error thrown on createCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue('string error')

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.createCluster('kind', 'fail')
      })
      expect(outcome).toEqual({ status: 'error', message: 'Failed to create cluster' })
    })

    it('sends correct POST body for createCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'ok' }))
      )

      await act(async () => {
        await result.current.createCluster('k3d', 'my-cluster')
      })

      const calls = vi.mocked(fetch).mock.calls
      const createCall = calls.find(
        c => String(c[0]).includes('/local-clusters') && (c[1] as RequestInit)?.method === 'POST'
      )
      expect(createCall).toBeTruthy()
      const body = JSON.parse((createCall![1] as RequestInit).body as string)
      expect(body).toEqual({ tool: 'k3d', name: 'my-cluster' })
    })
  })

  // =========================================================================
  // deleteCluster (connected)
  // =========================================================================
  describe('deleteCluster (connected)', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    })

    it('deletes cluster successfully', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'deleted' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteCluster('kind', 'kind-test')
      })
      expect(outcome).toBe(true)
      expect(result.current.isDeleting).toBeNull()
    })

    it('handles non-ok response on deleteCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(textResponse('Not found', 404))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteCluster('kind', 'missing')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Not found')
    })

    it('handles network error on deleteCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('connection reset'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteCluster('kind', 'fail')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('connection reset')
    })

    it('handles non-Error thrown on deleteCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(42)

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.deleteCluster('kind', 'fail')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Failed to delete cluster')
    })

    it('sends correct DELETE request for deleteCluster', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({}))
      )

      await act(async () => {
        await result.current.deleteCluster('kind', 'my-cluster')
      })

      const calls = vi.mocked(fetch).mock.calls
      const deleteCall = calls.find(
        c => (c[1] as RequestInit)?.method === 'DELETE' && String(c[0]).includes('/local-clusters')
      )
      expect(deleteCall).toBeTruthy()
      expect(String(deleteCall![0])).toContain('tool=kind')
      expect(String(deleteCall![0])).toContain('name=my-cluster')
    })

    it('schedules fetchClusters after successful delete', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({}))
      )

      await act(async () => {
        await result.current.deleteCluster('kind', 'c1')
      })

      // The delete succeeded, which schedules a setTimeout for fetchClusters.
      // Wait for it to fire (UI_FEEDBACK_TIMEOUT_MS = 10 in our mock).
      const fetchBefore = vi.mocked(fetch).mock.calls.length
      await act(async () => {
        await new Promise(r => setTimeout(r, 50))
      })
      // After the timeout, fetchClusters should have been called
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(fetchBefore)
    })
  })

  // =========================================================================
  // clusterLifecycle (connected)
  // =========================================================================
  describe('clusterLifecycle (connected)', () => {
    beforeEach(() => {
      mockIsConnected.mockReturnValue(true)
      mockIsDemoMode.mockReturnValue(false)
      vi.mocked(fetch).mockImplementation(defaultConnectedFetch)
    })

    it('executes lifecycle action successfully', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: 'started' }))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.clusterLifecycle('kind', 'dev', 'start')
      })
      expect(outcome).toBe(true)
    })

    it('handles non-ok lifecycle response', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(textResponse('Already running', 400))
      )

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.clusterLifecycle('kind', 'dev', 'start')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Already running')
    })

    it('handles network error on lifecycle', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(new Error('timeout'))

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.clusterLifecycle('kind', 'dev', 'stop')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('timeout')
    })

    it('handles non-Error thrown on lifecycle', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockRejectedValue(null)

      let outcome: unknown
      await act(async () => {
        outcome = await result.current.clusterLifecycle('kind', 'dev', 'restart')
      })
      expect(outcome).toBe(false)
      expect(result.current.error).toBe('Failed to restart cluster')
    })

    it('sends correct POST body for lifecycle', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({}))
      )

      await act(async () => {
        await result.current.clusterLifecycle('minikube', 'test', 'restart')
      })

      const calls = vi.mocked(fetch).mock.calls
      const lcCall = calls.find(c => String(c[0]).includes('/local-cluster-lifecycle'))
      expect(lcCall).toBeTruthy()
      const body = JSON.parse((lcCall![1] as RequestInit).body as string)
      expect(body).toEqual({ tool: 'minikube', name: 'test', action: 'restart' })
    })

    it('schedules fetchClusters after successful lifecycle', async () => {
      const { result } = renderHook(() => useLocalClusterTools())
      await waitFor(() => {})

      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(jsonResponse({}))
      )

      await act(async () => {
        await result.current.clusterLifecycle('kind', 'dev', 'start')
      })

      const fetchBefore = vi.mocked(fetch).mock.calls.length
      await act(async () => {
        await new Promise(r => setTimeout(r, 50))
      })
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(fetchBefore)
    })
  })

})
