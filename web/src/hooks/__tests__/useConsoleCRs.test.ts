/**
 * Deep branch-coverage tests for useConsoleCRs.ts
 *
 * Tests the generic useConsoleCR CRUD factory (via useManagedWorkloads,
 * useClusterGroups, useWorkloadDeployments) and the combined useAllConsoleCRs
 * hook. Covers fetch, create, update, delete, getItem, error paths,
 * mount/unmount lifecycle, and the deployments-specific updateStatus method.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// #7993 Phase 2.5: useConsoleCR now destructures activeCluster and
// config.namespace from usePersistence() so it can target the kc-agent
// /console-cr routes with the correct persistence cluster + namespace query
// parameters. Tests pass both fields so the mutation helpers actually fire.
const mockUsePersistence = vi.fn(() => ({
  isEnabled: true,
  isActive: true,
  activeCluster: 'wds1',
  config: { namespace: 'kubestellar-console' },
}))
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../usePersistence', () => ({
  usePersistence: () => mockUsePersistence(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10_000 }
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import hooks under test AFTER mocks
// ---------------------------------------------------------------------------

import {
  useManagedWorkloads,
  useClusterGroups as useCRClusterGroups,
  useWorkloadDeployments,
  useAllConsoleCRs,
} from '../useConsoleCRs'
import type { ManagedWorkload, WorkloadDeployment } from '../useConsoleCRs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

function makeWorkload(name: string): ManagedWorkload {
  return {
    metadata: { name },
    spec: {
      sourceCluster: 'cluster-a',
      sourceNamespace: 'default',
      workloadRef: { kind: 'Deployment', name },
    },
  }
}

function makeDeployment(name: string): WorkloadDeployment {
  return {
    metadata: { name },
    spec: {
      workloadRef: { name },
      strategy: 'RollingUpdate',
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConsoleCRs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockUsePersistence.mockReturnValue({
      isEnabled: true,
      isActive: true,
      activeCluster: 'wds1',
      config: { namespace: 'kubestellar-console' },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── useManagedWorkloads: initial fetch ───────────────────────────────

  describe('useManagedWorkloads', () => {
    it('fetches items on mount when persistence is enabled', async () => {
      const items = [makeWorkload('w1'), makeWorkload('w2')]
      mockFetch.mockReturnValue(jsonResponse(items))

      const { result } = renderHook(() => useManagedWorkloads())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.items).toHaveLength(2)
      expect(result.current.items[0].metadata.name).toBe('w1')
      expect(result.current.error).toBeNull()
      expect(result.current.isEnabled).toBe(true)
    })

    it('skips fetch and sets loading=false when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useManagedWorkloads())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.items).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.isEnabled).toBe(false)
    })

    it('handles fetch failure with an error message', async () => {
      mockFetch.mockRejectedValue(new Error('Network down'))

      const { result } = renderHook(() => useManagedWorkloads())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.error).toBe('Failed to load ManagedWorkload')
      expect(result.current.items).toEqual([])
    })

    it('handles non-ok HTTP response as an error', async () => {
      mockFetch.mockReturnValue(jsonResponse(null, 500))

      const { result } = renderHook(() => useManagedWorkloads())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.error).toBe('Failed to load ManagedWorkload')
    })

    it('treats null API response as empty array', async () => {
      mockFetch.mockReturnValue(jsonResponse(null))

      const { result } = renderHook(() => useManagedWorkloads())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.items).toEqual([])
    })

    // ── getItem ──────────────────────────────────────────────────────

    it('getItem returns a single item on success', async () => {
      const w = makeWorkload('target')
      // First call is the initial fetch, second is getItem
      mockFetch
        .mockReturnValueOnce(jsonResponse([]))
        .mockReturnValueOnce(jsonResponse(w))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let item: ManagedWorkload | null = null
      await act(async () => {
        item = await result.current.getItem('target')
      })

      expect(item).not.toBeNull()
      expect(item!.metadata.name).toBe('target')
    })

    it('getItem returns null when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let item: ManagedWorkload | null = null
      await act(async () => {
        item = await result.current.getItem('anything')
      })

      expect(item).toBeNull()
    })

    it('getItem returns null on fetch failure', async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse([]))
        .mockRejectedValueOnce(new Error('fail'))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let item: ManagedWorkload | null = null
      await act(async () => {
        item = await result.current.getItem('missing')
      })

      expect(item).toBeNull()
    })

    // ── createItem ──────────────────────────────────────────────────

    it('createItem adds item and returns it (optimistic update)', async () => {
      const created = makeWorkload('new-w')
      mockFetch
        .mockReturnValueOnce(jsonResponse([]))  // initial fetch
        .mockReturnValueOnce(jsonResponse(created))  // create

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: ManagedWorkload | null = null
      await act(async () => {
        returned = await result.current.createItem(created)
      })

      expect(returned).not.toBeNull()
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].metadata.name).toBe('new-w')
    })

    it('createItem returns null when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: ManagedWorkload | null = null
      await act(async () => {
        returned = await result.current.createItem(makeWorkload('skip'))
      })

      expect(returned).toBeNull()
    })

    it('createItem returns null on fetch failure', async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse([]))
        .mockRejectedValueOnce(new Error('create fail'))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: ManagedWorkload | null = null
      await act(async () => {
        returned = await result.current.createItem(makeWorkload('fail-create'))
      })

      expect(returned).toBeNull()
    })

    // ── updateItem ──────────────────────────────────────────────────

    it('updateItem replaces item in list (optimistic update)', async () => {
      const original = makeWorkload('upd')
      const updated = { ...original, spec: { ...original.spec, replicas: 3 } }
      mockFetch
        .mockReturnValueOnce(jsonResponse([original]))
        .mockReturnValueOnce(jsonResponse(updated))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.updateItem('upd', { spec: { ...original.spec, replicas: 3 } } as Partial<ManagedWorkload>)
      })

      expect(result.current.items[0].spec.replicas).toBe(3)
    })

    it('updateItem returns null when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: ManagedWorkload | null = null
      await act(async () => {
        returned = await result.current.updateItem('x', {})
      })

      expect(returned).toBeNull()
    })

    // ── deleteItem ──────────────────────────────────────────────────

    it('deleteItem removes item from list (optimistic update)', async () => {
      const w1 = makeWorkload('del-me')
      const w2 = makeWorkload('keep-me')
      mockFetch
        .mockReturnValueOnce(jsonResponse([w1, w2]))
        .mockReturnValueOnce(jsonResponse(null, 204))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.items).toHaveLength(2)

      let success = false
      await act(async () => {
        success = await result.current.deleteItem('del-me')
      })

      expect(success).toBe(true)
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].metadata.name).toBe('keep-me')
    })

    it('deleteItem returns false when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let success = false
      await act(async () => {
        success = await result.current.deleteItem('x')
      })

      expect(success).toBe(false)
    })

    it('deleteItem returns false on fetch failure', async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse([makeWorkload('fail-del')]))
        .mockRejectedValueOnce(new Error('delete fail'))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let success = false
      await act(async () => {
        success = await result.current.deleteItem('fail-del')
      })

      expect(success).toBe(false)
    })

    // ── refresh ─────────────────────────────────────────────────────

    it('refresh re-fetches items from API', async () => {
      mockFetch.mockReturnValue(jsonResponse([makeWorkload('initial')]))

      const { result } = renderHook(() => useManagedWorkloads())
      await waitFor(() => expect(result.current.loading).toBe(false))

      const refreshed = [makeWorkload('refreshed')]
      mockFetch.mockReturnValue(jsonResponse(refreshed))

      await act(async () => {
        await result.current.refresh()
      })

      expect(result.current.items[0].metadata.name).toBe('refreshed')
    })
  })

  // ── useWorkloadDeployments (with updateStatus) ─────────────────────

  describe('useWorkloadDeployments', () => {
    it('includes updateStatus method', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      const { result } = renderHook(() => useWorkloadDeployments())
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(typeof result.current.updateStatus).toBe('function')
    })

    it('updateStatus calls PUT on status sub-resource', async () => {
      const dep = makeDeployment('dep1')
      const updatedDep = { ...dep, status: { phase: 'Progressing' } }
      mockFetch
        .mockReturnValueOnce(jsonResponse([dep]))
        .mockReturnValueOnce(jsonResponse(updatedDep))

      const { result } = renderHook(() => useWorkloadDeployments())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: WorkloadDeployment | null = null
      await act(async () => {
        returned = await result.current.updateStatus('dep1', { phase: 'Progressing' })
      })

      expect(returned).not.toBeNull()
      const statusCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/status')
      )
      expect(statusCall).toBeDefined()
      // #7993 Phase 2.5: status updates go through kc-agent with the
      // persistence cluster + namespace + name as query parameters.
      expect(statusCall![0] as string).toMatch(/\/console-cr\/deployments\/status\?/)
      expect(statusCall![0] as string).toContain('cluster=wds1')
      expect(statusCall![0] as string).toContain('namespace=kubestellar-console')
      expect(statusCall![0] as string).toContain('name=dep1')
      expect(statusCall![1].method).toBe('PUT')
    })

    it('updateStatus returns null when persistence is disabled', async () => {
      mockUsePersistence.mockReturnValue({ isEnabled: false, isActive: false, activeCluster: "", config: { namespace: "" } })

      const { result } = renderHook(() => useWorkloadDeployments())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: WorkloadDeployment | null = null
      await act(async () => {
        returned = await result.current.updateStatus('x', { phase: 'Failed' })
      })

      expect(returned).toBeNull()
    })

    it('updateStatus returns null on fetch error', async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse([]))
        .mockRejectedValueOnce(new Error('status fail'))

      const { result } = renderHook(() => useWorkloadDeployments())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returned: WorkloadDeployment | null = null
      await act(async () => {
        returned = await result.current.updateStatus('x', { phase: 'Failed' })
      })

      expect(returned).toBeNull()
    })
  })

  // ── useAllConsoleCRs (combined hook) ──────────────────────────────

  describe('useAllConsoleCRs', () => {
    it('returns combined shape with workloads, groups, deployments', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      const { result } = renderHook(() => useAllConsoleCRs())

      expect(result.current).toHaveProperty('workloads')
      expect(result.current).toHaveProperty('groups')
      expect(result.current).toHaveProperty('deployments')
      expect(result.current).toHaveProperty('loading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('isEnabled')
      expect(typeof result.current.refresh).toBe('function')
    })

    it('loading is true when any sub-hook is loading', async () => {
      // fetch never resolves, so hooks stay in loading state
      mockFetch.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useAllConsoleCRs())

      expect(result.current.loading).toBe(true)
    })

    it('error surfaces the first error from sub-hooks', async () => {
      // Make only the workloads endpoint fail
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/workloads')) {
          return Promise.reject(new Error('workloads down'))
        }
        return jsonResponse([])
      })

      const { result } = renderHook(() => useAllConsoleCRs())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.error).toBeTruthy()
    })

    it('refresh calls refresh on all three sub-hooks', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      const { result } = renderHook(() => useAllConsoleCRs())
      await waitFor(() => expect(result.current.loading).toBe(false))

      mockFetch.mockClear()
      mockFetch.mockReturnValue(jsonResponse([]))

      await act(async () => {
        await result.current.refresh()
      })

      // Should have fetched all 3 endpoints
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  // ── Endpoint URL construction ─────────────────────────────────────

  describe('endpoint construction', () => {
    it('useManagedWorkloads fetches from /api/persistence/workloads', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      renderHook(() => useManagedWorkloads())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/persistence/workloads',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        )
      })
    })

    it('useCRClusterGroups fetches from /api/persistence/groups', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      renderHook(() => useCRClusterGroups())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/persistence/groups',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        )
      })
    })

    it('useWorkloadDeployments fetches from /api/persistence/deployments', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))

      renderHook(() => useWorkloadDeployments())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/persistence/deployments',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        )
      })
    })
  })
})
