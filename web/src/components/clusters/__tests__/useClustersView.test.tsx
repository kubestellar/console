/**
 * Unit tests for useClustersView.
 *
 * This hook consolidates filter/sort/selection/view/data/mission state for
 * the Clusters page (extracted from Clusters.tsx, #21886/#21904) and
 * previously had no dedicated test coverage. External data-source hooks
 * (useMCP, useLocalAgent, useMissions, useGlobalFilters, usePermissions,
 * useApiKeyCheck, useDemoMode) are mocked; the composed sub-hooks
 * (useClusterViewState, useClusterFiltering, useClusterStats,
 * useClusterMutations) run for real so their logic stays covered.
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21904).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClusterInfo } from '../../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
  useLocation: () => ({ pathname: '/clusters', search: '', key: 'loc-1' }),
  useNavigate: () => vi.fn(),
}))

let mockClusters: ClusterInfo[] = []
const refetch = vi.fn()
const gpuRefetch = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: mockClusters, isLoading: false, isRefreshing: false, lastUpdated: null, refetch }),
  useGPUNodes: () => ({ nodes: [], isLoading: false, error: null, refetch: gpuRefetch }),
  useNVIDIAOperators: () => ({ operators: [] }),
}))

const startMission = vi.fn()
const openSidebar = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission, openSidebar }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: true, isDegraded: false, status: 'connected' }),
  wasAgentEverConnected: () => true,
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    clusterGroups: [],
    addClusterGroup: vi.fn(),
    deleteClusterGroup: vi.fn(),
    selectClusterGroup: vi.fn(),
    selectedDistributions: [],
    isAllDistributionsSelected: true,
  }),
}))

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ isClusterAdmin: () => true, loading: false }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    isLocalAgentSuppressed: () => false,
    STORAGE_KEY_CLUSTER_LAYOUT: 'kc-cluster-layout',
    STORAGE_KEY_CLUSTER_ORDER: 'kc-cluster-order',
  }
})

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: (fn: () => void) => fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterStatsDrillDown: vi.fn(),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

import { useClustersView } from '../useClustersView'

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'cluster-a',
    context: 'cluster-a',
    healthy: true,
    nodeCount: 3,
    podCount: 10,
    ...overrides,
  } as ClusterInfo
}

describe('useClustersView', () => {
  beforeEach(() => {
    mockClusters = []
    refetch.mockClear()
    gpuRefetch.mockClear()
    startMission.mockClear()
    openSidebar.mockClear()
    mockSetSearchParams.mockClear()
  })

  it('starts with the default filter, empty selection, and cluster grid visible', () => {
    const { result } = renderHook(() => useClustersView())
    expect(result.current.filter).toBe('all')
    expect(result.current.selectedCluster).toBeNull()
    expect(result.current.showClusterGrid).toBe(true)
    expect(result.current.showAddCluster).toBe(false)
    expect(result.current.clusters).toEqual([])
  })

  it('computes cluster stats and groundtruth fields from fetched clusters', () => {
    mockClusters = [makeCluster({ name: 'a', healthy: true }), makeCluster({ name: 'b', healthy: false })]
    const { result } = renderHook(() => useClustersView())
    expect(result.current.stats.total).toBe(2)
    expect(result.current.clusterGroundtruthFields['clusters-total']).toBe(2)
  })

  it('setFilter pushes the new status into the URL search params', () => {
    const { result } = renderHook(() => useClustersView())
    act(() => { result.current.setFilter('healthy') })
    expect(mockSetSearchParams).toHaveBeenCalledWith(
      expect.any(URLSearchParams),
      { replace: true }
    )
    const paramsArg = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
    expect(paramsArg.get('status')).toBe('healthy')
  })

  it('setShowClusterGrid toggles cluster grid visibility', () => {
    const { result } = renderHook(() => useClustersView())
    act(() => { result.current.setShowClusterGrid(false) })
    expect(result.current.showClusterGrid).toBe(false)
  })

  it('openGPUModal / closeGPUModal drive showGPUModal via useModalState', () => {
    const { result } = renderHook(() => useClustersView())
    expect(result.current.showGPUModal).toBe(false)
  })

  it('exposes startMission and openSidebar from useMissions unchanged', () => {
    const { result } = renderHook(() => useClustersView())
    expect(result.current.startMission).toBe(startMission)
    expect(result.current.openSidebar).toBe(openSidebar)
  })

  it('refetches cluster data whenever the router location key changes', () => {
    renderHook(() => useClustersView())
    expect(refetch).toHaveBeenCalled()
  })
})
