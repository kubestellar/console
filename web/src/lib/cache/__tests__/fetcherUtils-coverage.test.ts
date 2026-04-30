/**
 * Extended coverage tests for fetcherUtils.ts
 *
 * Covers: isClusterModeBackend, getClusterFetcher, fetchClusters,
 * fetchFromAllClusters (error paths, partial failures, throwIfPartialFailureEmpty),
 * fetchViaSSE, fetchViaBackendSSE, fetchViaGitOpsSSE, fetchFromAllClustersViaBackend
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockIsBackendUnavailable = vi.fn(() => false)
const mockFetchSSE = vi.fn()
const mockSettledWithConcurrency = vi.fn()
const mockValidateArrayResponse = vi.fn((_schema: unknown, raw: unknown) => raw)

vi.mock('../../api', () => ({
  isBackendUnavailable: (...args: unknown[]) => mockIsBackendUnavailable(...args),
}))
vi.mock('../../sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))
vi.mock('../../../hooks/mcp/clusterCacheRef', () => ({
  clusterCacheRef: { clusters: [] },
}))
vi.mock('../../constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-token',
}))
vi.mock('../../constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))
vi.mock('../../utils/concurrency', () => ({
  settledWithConcurrency: (...args: unknown[]) => mockSettledWithConcurrency(...args),
}))
vi.mock('../../schemas', () => ({
  ClustersResponseSchema: {},
}))
vi.mock('../../schemas/validate', () => ({
  validateArrayResponse: (...args: unknown[]) => mockValidateArrayResponse(...args),
}))

import {
  isClusterModeBackend,
  getClusterFetcher,
  fetchClusters,
  fetchFromAllClusters,
  fetchViaSSE,
  fetchFromAllClustersViaBackend,
  fetchViaBackendSSE,
  fetchViaGitOpsSSE,
  fetchAPI,
  fetchBackendAPI,
} from '../fetcherUtils'
import { clusterCacheRef } from '../../../hooks/mcp/clusterCacheRef'

describe('fetcherUtils extended coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(clusterCacheRef as { clusters: unknown[] }).clusters = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // isClusterModeBackend
  // ==========================================================================

  describe('isClusterModeBackend', () => {
    it('returns false when no preference is set', () => {
      expect(isClusterModeBackend()).toBe(false)
    })

    it('returns true when preference is kagenti', () => {
      localStorage.setItem('kc_agent_backend_preference', 'kagenti')
      expect(isClusterModeBackend()).toBe(true)
    })

    it('returns true when preference is kagent', () => {
      localStorage.setItem('kc_agent_backend_preference', 'kagent')
      expect(isClusterModeBackend()).toBe(true)
    })

    it('returns false when preference is kc-agent', () => {
      localStorage.setItem('kc_agent_backend_preference', 'kc-agent')
      expect(isClusterModeBackend()).toBe(false)
    })

    it('returns false when preference is an arbitrary string', () => {
      localStorage.setItem('kc_agent_backend_preference', 'something-else')
      expect(isClusterModeBackend()).toBe(false)
    })

    it('returns false when localStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(isClusterModeBackend()).toBe(false)
      spy.mockRestore()
    })
  })

  // ==========================================================================
  // getClusterFetcher
  // ==========================================================================

  describe('getClusterFetcher', () => {
    it('returns fetchAPI when not in cluster mode', () => {
      const fetcher = getClusterFetcher()
      expect(fetcher).toBe(fetchAPI)
    })

    it('returns fetchBackendAPI when in cluster mode (kagenti)', () => {
      localStorage.setItem('kc_agent_backend_preference', 'kagenti')
      const fetcher = getClusterFetcher()
      expect(fetcher).toBe(fetchBackendAPI)
    })

    it('returns fetchBackendAPI when in cluster mode (kagent)', () => {
      localStorage.setItem('kc_agent_backend_preference', 'kagent')
      const fetcher = getClusterFetcher()
      expect(fetcher).toBe(fetchBackendAPI)
    })
  })

  // ==========================================================================
  // fetchClusters
  // ==========================================================================

  describe('fetchClusters', () => {
    it('returns clusters from clusterCacheRef when available', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'cluster-a', reachable: true },
        { name: 'cluster-b', reachable: true },
        { name: 'cluster-c', reachable: false },
      ]
      const result = await fetchClusters()
      expect(result).toEqual(['cluster-a', 'cluster-b'])
    })

    it('filters out slash-containing context names', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'default/api-server.com:6443/admin', reachable: true },
        { name: 'clean-name', reachable: true },
      ]
      const result = await fetchClusters()
      expect(result).toEqual(['clean-name'])
    })

    it('includes clusters with undefined reachable (health check pending)', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'pending-cluster' },
        { name: 'reachable-cluster', reachable: true },
      ]
      const result = await fetchClusters()
      expect(result).toEqual(['pending-cluster', 'reachable-cluster'])
    })

    it('falls back to API fetch when clusterCacheRef is empty', async () => {
      localStorage.setItem('kc-token', 'test-token')
      const mockResponse = { clusters: [{ name: 'remote-a', reachable: true }] }
      mockValidateArrayResponse.mockReturnValue(mockResponse)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await fetchClusters()
      expect(result).toEqual(['remote-a'])
    })
  })

  // ==========================================================================
  // fetchFromAllClusters
  // ==========================================================================

  describe('fetchFromAllClusters', () => {
    beforeEach(() => {
      localStorage.setItem('kc-token', 'test-token')
    })

    it('throws when no clusters are available', async () => {
      ;(clusterCacheRef as { clusters: unknown[] }).clusters = []
      mockValidateArrayResponse.mockReturnValue({ clusters: [] })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ clusters: [] }), { status: 200 })
      )
      await expect(fetchFromAllClusters('pods', 'pods')).rejects.toThrow(
        'No clusters available'
      )
    })

    it('throws when all cluster fetches fail', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ]
      // settledWithConcurrency: simulate all failures
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>, _concurrency?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        for (const _task of tasks) {
          const result: PromiseSettledResult<unknown> = { status: 'rejected', reason: new Error('timeout') }
          onSettled?.(result)
        }
        return []
      })

      await expect(fetchFromAllClusters('pods', 'pods')).rejects.toThrow(
        'All cluster fetches failed'
      )
    })

    it('throws on partial failure when throwIfPartialFailureEmpty is true', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ]
      // 1 fulfilled (empty), 1 rejected
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>, _concurrency?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        onSettled?.({ status: 'rejected', reason: new Error('fail') })
        return []
      })

      await expect(
        fetchFromAllClusters('gpu-nodes', 'nodes', undefined, true, undefined, { throwIfPartialFailureEmpty: true })
      ).rejects.toThrow('Partial cluster failure yielded empty result')
    })

    it('returns accumulated results from successful cluster fetches', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>, _concurrency?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        for (const task of tasks) {
          const value = await task()
          onSettled?.({ status: 'fulfilled', value })
        }
        return []
      })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ pods: [{ name: 'pod-1' }] }), { status: 200 })
      )

      const result = await fetchFromAllClusters('pods', 'pods')
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'c1')
    })

    it('calls onProgress as clusters complete', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
        { name: 'c2', reachable: true },
      ]
      const progressCalls: unknown[][] = []
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>, _concurrency?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        for (const task of tasks) {
          const value = await task()
          onSettled?.({ status: 'fulfilled', value })
        }
        return []
      })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: 1 }] }), { status: 200 })
      )

      await fetchFromAllClusters('endpoint', 'items', undefined, true, (partial) => {
        progressCalls.push([...partial])
      })
      expect(progressCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('delegates to backend variant when in cluster mode', async () => {
      localStorage.setItem('kc_agent_backend_preference', 'kagenti')
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>, _concurrency?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        for (const task of tasks) {
          const value = await task()
          onSettled?.({ status: 'fulfilled', value })
        }
        return []
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 })
      )

      await fetchFromAllClusters('items', 'items')
      // In cluster mode it should use /api/mcp/ prefix
      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('/api/mcp/')
    })
  })

  // ==========================================================================
  // fetchViaSSE
  // ==========================================================================

  describe('fetchViaSSE', () => {
    it('falls back to fetchFromAllClusters when no token', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      // No token set — should fall back
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      const result = await fetchViaSSE('pods', 'pods')
      expect(result).toEqual([])
      expect(mockFetchSSE).not.toHaveBeenCalled()
    })

    it('falls back to fetchFromAllClusters when token is demo-token', async () => {
      localStorage.setItem('kc-token', 'demo-token')
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      await fetchViaSSE('pods', 'pods')
      expect(mockFetchSSE).not.toHaveBeenCalled()
    })

    it('falls back to fetchFromAllClusters when backend unavailable', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(true)
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      await fetchViaSSE('pods', 'pods')
      expect(mockFetchSSE).not.toHaveBeenCalled()
    })

    it('uses SSE when token and backend are available', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockFetchSSE.mockResolvedValue([{ name: 'pod-1' }])

      const result = await fetchViaSSE('pods', 'pods')
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toEqual([{ name: 'pod-1' }])
    })

    it('falls back to REST when SSE throws', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockFetchSSE.mockRejectedValue(new Error('SSE connection failed'))
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      const result = await fetchViaSSE('pods', 'pods')
      expect(result).toEqual([])
    })

    it('throws on partial SSE failure with throwIfPartialFailureEmpty', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      // SSE returns empty but has cluster errors
      mockFetchSSE.mockImplementation(async (opts: { onClusterError?: () => void }) => {
        opts.onClusterError?.()
        return []
      })

      await expect(
        fetchViaSSE('gpu', 'nodes', undefined, undefined, { throwIfPartialFailureEmpty: true })
      ).rejects.toThrow('Partial SSE failure yielded empty result')
    })
  })

  // ==========================================================================
  // fetchFromAllClustersViaBackend
  // ==========================================================================

  describe('fetchFromAllClustersViaBackend', () => {
    it('throws when no clusters are available', async () => {
      localStorage.setItem('kc-token', 'test-token')
      ;(clusterCacheRef as { clusters: unknown[] }).clusters = []
      mockValidateArrayResponse.mockReturnValue({ clusters: [] })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ clusters: [] }), { status: 200 })
      )

      await expect(fetchFromAllClustersViaBackend('pods', 'pods')).rejects.toThrow(
        'No clusters available'
      )
    })

    it('throws when all backend fetches fail', async () => {
      localStorage.setItem('kc-token', 'test-token')
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'rejected', reason: new Error('fail') })
        return []
      })

      await expect(fetchFromAllClustersViaBackend('pods', 'pods')).rejects.toThrow(
        'All cluster fetches failed'
      )
    })
  })

  // ==========================================================================
  // fetchViaBackendSSE
  // ==========================================================================

  describe('fetchViaBackendSSE', () => {
    it('falls back to REST when no token', async () => {
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      await fetchViaBackendSSE('pods', 'pods')
      expect(mockFetchSSE).not.toHaveBeenCalled()
    })

    it('uses SSE via /api/mcp/ prefix when token is available', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockFetchSSE.mockResolvedValue([{ name: 'pod-1' }])

      const result = await fetchViaBackendSSE('pods', 'pods')
      expect(mockFetchSSE).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/mcp/pods/stream' })
      )
      expect(result).toEqual([{ name: 'pod-1' }])
    })

    it('falls back to REST when SSE throws', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockFetchSSE.mockRejectedValue(new Error('connection reset'))
      ;(clusterCacheRef as { clusters: Array<{ name: string; reachable?: boolean }> }).clusters = [
        { name: 'c1', reachable: true },
      ]
      mockSettledWithConcurrency.mockImplementation(async (_tasks: unknown[], _c?: number, onSettled?: (r: PromiseSettledResult<unknown>) => void) => {
        onSettled?.({ status: 'fulfilled', value: [] })
        return []
      })

      const result = await fetchViaBackendSSE('pods', 'pods')
      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // fetchViaGitOpsSSE
  // ==========================================================================

  describe('fetchViaGitOpsSSE', () => {
    it('throws when no token', async () => {
      await expect(fetchViaGitOpsSSE('repos', 'repos')).rejects.toThrow(
        'No data source available'
      )
    })

    it('throws when token is demo-token', async () => {
      localStorage.setItem('kc-token', 'demo-token')
      await expect(fetchViaGitOpsSSE('repos', 'repos')).rejects.toThrow(
        'No data source available'
      )
    })

    it('throws when backend is unavailable', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(true)
      await expect(fetchViaGitOpsSSE('repos', 'repos')).rejects.toThrow(
        'No data source available'
      )
    })

    it('uses SSE via /api/gitops/ prefix when available', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      mockFetchSSE.mockResolvedValue([{ repo: 'myrepo' }])

      const result = await fetchViaGitOpsSSE('repos', 'repos')
      expect(mockFetchSSE).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/gitops/repos/stream' })
      )
      expect(result).toEqual([{ repo: 'myrepo' }])
    })

    it('calls onProgress during streaming', async () => {
      localStorage.setItem('kc-token', 'real-token')
      mockIsBackendUnavailable.mockReturnValue(false)
      const progressCalls: unknown[][] = []
      mockFetchSSE.mockImplementation(async (opts: { onClusterData?: (cluster: string, items: unknown[]) => void }) => {
        opts.onClusterData?.('c1', [{ id: 1 }])
        opts.onClusterData?.('c2', [{ id: 2 }])
        return [{ id: 1 }, { id: 2 }]
      })

      await fetchViaGitOpsSSE('repos', 'repos', undefined, (partial) => {
        progressCalls.push([...partial])
      })
      expect(progressCalls.length).toBe(2)
    })
  })

  // ==========================================================================
  // fetchAPI / fetchBackendAPI (makeRestFetcher error paths)
  // ==========================================================================

  describe('fetchAPI error paths', () => {
    it('throws when no token is set', async () => {
      await expect(fetchAPI('pods')).rejects.toThrow('No authentication token')
    })

    it('throws on non-ok response', async () => {
      localStorage.setItem('kc-token', 'valid-token')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      )
      await expect(fetchAPI('pods')).rejects.toThrow('API error: 404')
    })

    it('throws on non-JSON response', async () => {
      localStorage.setItem('kc-token', 'valid-token')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not json at all', { status: 200 })
      )
      await expect(fetchAPI('pods')).rejects.toThrow('non-JSON response')
    })

    it('parses successful JSON response', async () => {
      localStorage.setItem('kc-token', 'valid-token')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ pods: ['a'] }), { status: 200 })
      )
      const result = await fetchAPI<{ pods: string[] }>('pods')
      expect(result.pods).toEqual(['a'])
    })

    it('passes params as query string', async () => {
      localStorage.setItem('kc-token', 'valid-token')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      )
      await fetchAPI('pods', { cluster: 'c1', limit: 10, empty: undefined })
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toContain('cluster=c1')
      expect(calledUrl).toContain('limit=10')
      expect(calledUrl).not.toContain('empty')
    })
  })

  describe('fetchBackendAPI error paths', () => {
    it('throws when no token is set', async () => {
      await expect(fetchBackendAPI('pods')).rejects.toThrow('No authentication token')
    })

    it('uses /api/mcp/ prefix', async () => {
      localStorage.setItem('kc-token', 'valid-token')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      )
      await fetchBackendAPI('pods')
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/mcp/pods')
    })
  })
})
