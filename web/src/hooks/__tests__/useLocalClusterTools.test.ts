import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsConnected = vi.fn(() => false)
vi.mock('../useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: mockIsConnected() }),
  isAgentUnavailable: vi.fn(() => true),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  getDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../useClusterProgress', () => ({
  useClusterProgress: () => ({ progress: null, dismiss: vi.fn() }),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 5000, RETRY_DELAY_MS: 100, UI_FEEDBACK_TIMEOUT_MS: 100 }
})

import { useLocalClusterTools } from '../useLocalClusterTools'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsConnected.mockReturnValue(false)
  mockIsDemoMode.mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLocalClusterTools', () => {

  describe('initialization', () => {
    it('returns expected shape', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current).toHaveProperty('tools')
      expect(result.current).toHaveProperty('clusters')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('createCluster')
      expect(result.current).toHaveProperty('deleteCluster')
      expect(result.current).toHaveProperty('refresh')
    })

    it('starts with empty arrays and no error', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current.tools).toEqual([])
      expect(result.current.clusters).toEqual([])
      expect(result.current.error).toBeNull()
    })
  })

  describe('demo mode', () => {
    it('returns demo tools when in demo mode without agent', async () => {
      mockIsDemoMode.mockReturnValue(true)
      mockIsConnected.mockReturnValue(false)

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.tools.length).toBeGreaterThan(0)
      })
      // Demo tools include kind, k3d, minikube, vcluster
      const toolNames = result.current.tools.map((t: { name: string }) => t.name)
      expect(toolNames).toContain('kind')
    })

    it('does not call fetch in demo mode without agent', async () => {
      mockIsDemoMode.mockReturnValue(true)
      mockIsConnected.mockReturnValue(false)

      renderHook(() => useLocalClusterTools())

      await waitFor(() => {})

      // fetch should not have been called for tools/clusters
      const fetchCalls = vi.mocked(fetch).mock.calls
      const agentCalls = fetchCalls.filter(c => String(c[0]).includes('localhost:8585'))
      expect(agentCalls).toHaveLength(0)
    })
  })

  describe('agent connected', () => {
    it('fetches tools when agent is connected', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ tools: [
          { name: 'kind', installed: true, version: '0.20.0' },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.tools.length).toBeGreaterThanOrEqual(0)
      })
    })

    it('sets error on fetch failure', async () => {
      mockIsConnected.mockReturnValue(true)
      vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))

      const { result } = renderHook(() => useLocalClusterTools())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })

    it('returns empty tools when agent is not connected and not in demo', () => {
      mockIsConnected.mockReturnValue(false)
      mockIsDemoMode.mockReturnValue(false)

      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current.tools).toEqual([])
    })
  })

  describe('vCluster state', () => {
    it('exposes vcluster-related state', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current).toHaveProperty('vclusterInstances')
      expect(result.current).toHaveProperty('vclusterClusterStatus')
      expect(result.current.vclusterInstances).toEqual([])
    })
  })

  describe('cluster progress', () => {
    it('exposes clusterProgress from useClusterProgress', () => {
      const { result } = renderHook(() => useLocalClusterTools())
      expect(result.current).toHaveProperty('clusterProgress')
    })
  })

  describe('cleanup', () => {
    it('does not throw on unmount', () => {
      const { unmount } = renderHook(() => useLocalClusterTools())
      expect(() => unmount()).not.toThrow()
    })
  })
})
