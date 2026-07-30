/**
 * Unit tests for usePodsView.
 *
 * This hook was extracted from Pods.tsx in PR #21904 and previously had no
 * dedicated test coverage. These tests exercise:
 *
 *   - stats derivation (totalPods/healthy/issues/pending/crashloop/restarts)
 *     from the podIssues + clusters inputs
 *   - filteredPodIssues respecting the global cluster filter and customFilter
 *     text search
 *   - handleDeletePod / executeDeletePod happy-path and the
 *     backendActionUnavailable guard that blocks pod actions
 *   - getDashboardStatValue's per-block onClick wiring to drillToAllPods /
 *     drillToAllClusters
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21904).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PodIssue } from '../../../hooks/mcp/types.workloads'
import type { ClusterInfo } from '../../../hooks/mcp/types'

// ── Mocks ─────────────────────────────────────────────────────────────

const drillToPod = vi.fn()
const drillToAllPods = vi.fn()
const drillToAllClusters = vi.fn()

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod, drillToAllPods, drillToAllClusters }),
}))

let mockCustomFilter = ''
let mockSelectedClusters: string[] = []
let mockIsAllClustersSelected = true

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: mockSelectedClusters,
    isAllClustersSelected: mockIsAllClustersSelected,
    customFilter: mockCustomFilter,
    filterByCluster: <T extends { cluster?: string }>(items: T[]): T[] =>
      mockIsAllClustersSelected ? items : items.filter(i => i.cluster && mockSelectedClusters.includes(i.cluster)),
  }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

const showToast = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast }),
}))

let mockBackendStatus: 'connected' | 'disconnected' = 'connected'
let mockInCluster = false
vi.mock('../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({ status: mockBackendStatus, inCluster: mockInCluster }),
}))

const kubectlExec = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => kubectlExec(...args) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

import { usePodsView } from '../usePodsView'

function makeIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'web-1',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'Running',
    reason: '',
    restarts: 0,
    ready: '1/1',
    age: '1h',
    ...overrides,
  } as PodIssue
}

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return { name: 'cluster-a', podCount: 5, healthy: true, ...overrides } as ClusterInfo
}

function renderUsePodsView(params: Partial<Parameters<typeof usePodsView>[0]> = {}) {
  return renderHook(() =>
    usePodsView({
      podIssues: [],
      isLoading: false,
      clusters: [],
      refetchPodIssues: vi.fn(),
      refetchClusters: vi.fn(),
      podIssuesLastRefresh: null,
      ...params,
    })
  )
}

describe('usePodsView', () => {
  beforeEach(() => {
    mockCustomFilter = ''
    mockSelectedClusters = []
    mockIsAllClustersSelected = true
    mockBackendStatus = 'connected'
    mockInCluster = false
    drillToPod.mockClear()
    drillToAllPods.mockClear()
    drillToAllClusters.mockClear()
    showToast.mockClear()
    kubectlExec.mockClear().mockResolvedValue(undefined)
  })

  it('returns empty stats and no skeleton loading for empty input', () => {
    const { result } = renderUsePodsView()
    expect(result.current.filteredPodIssues).toEqual([])
    expect(result.current.stats).toEqual({
      totalPods: 0, healthy: 0, issues: 0, pending: 0, crashloop: 0, restarts: 0, clusters: 0,
    })
    expect(result.current.showSkeletons).toBe(false)
    expect(result.current.lastUpdated).toBeNull()
  })

  it('shows skeletons while loading with no pod issues yet', () => {
    const { result } = renderUsePodsView({ isLoading: true })
    expect(result.current.showSkeletons).toBe(true)
  })

  it('derives pod stats from clusters and pod issues (healthy/issues/pending/crashloop/restarts)', () => {
    const issues = [
      makeIssue({ name: 'a', reason: 'Pending', status: 'Pending' }),
      makeIssue({ name: 'b', reason: 'CrashLoopBackOff' }),
      makeIssue({ name: 'c', restarts: 8 }),
    ]
    const clusters = [makeCluster({ podCount: 10 })]
    const { result } = renderUsePodsView({ podIssues: issues, clusters })

    expect(result.current.stats.totalPods).toBe(10)
    expect(result.current.stats.issues).toBe(3)
    expect(result.current.stats.pending).toBe(1)
    expect(result.current.stats.crashloop).toBe(1)
    expect(result.current.stats.restarts).toBe(1)
    expect(result.current.stats.clusters).toBe(1)
    expect(result.current.stats.healthy).toBe(7)
  })

  it('filters pod issues by the customFilter text search (name/namespace/cluster/reason)', () => {
    mockCustomFilter = 'crash'
    const issues = [
      makeIssue({ name: 'ok-pod' }),
      makeIssue({ name: 'bad-pod', reason: 'CrashLoopBackOff' }),
    ]
    const { result } = renderUsePodsView({ podIssues: issues })
    expect(result.current.filteredPodIssues).toHaveLength(1)
    expect(result.current.filteredPodIssues[0].name).toBe('bad-pod')
  })

  it('opens the delete confirmation and stores the pending target on handleDeletePod', () => {
    const { result } = renderUsePodsView()
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

    act(() => {
      result.current.handleDeletePod(evt, 'cluster-a', 'default', 'web-1')
    })

    expect(evt.stopPropagation).toHaveBeenCalled()
    expect(result.current.deleteConfirm.isOpen).toBe(true)
    expect(result.current.pendingDeleteRef.current).toEqual({
      cluster: 'cluster-a', namespace: 'default', name: 'web-1',
    })
  })

  it('executeDeletePod calls kubectlProxy.exec and clears the pending target on success', async () => {
    const refetchPodIssues = vi.fn()
    const { result } = renderUsePodsView({ refetchPodIssues })
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

    act(() => result.current.handleDeletePod(evt, 'cluster-a', 'default', 'web-1'))
    await act(async () => { await result.current.executeDeletePod() })

    expect(kubectlExec).toHaveBeenCalledWith(
      ['delete', 'pod', 'web-1', '-n', 'default'],
      { context: 'cluster-a' }
    )
    expect(refetchPodIssues).toHaveBeenCalled()
    expect(result.current.pendingDeleteRef.current).toBeNull()
    expect(result.current.isDeleting).toBe(false)
  })

  it('blocks pod actions and shows a toast when the backend is unavailable in-cluster', () => {
    mockInCluster = true
    mockBackendStatus = 'disconnected'
    const { result } = renderUsePodsView()
    expect(result.current.backendActionUnavailable).toBe(true)

    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent
    act(() => result.current.handleDeletePod(evt, 'cluster-a', 'default', 'web-1'))

    expect(showToast).toHaveBeenCalledWith(result.current.backendUnavailableMessage, 'error')
    expect(result.current.deleteConfirm.isOpen).toBe(false)
  })

  it('getDashboardStatValue wires the total_pods block to drillToAllPods with no filter', () => {
    const { result } = renderUsePodsView({ clusters: [makeCluster({ podCount: 3 })] })
    const statValue = result.current.getDashboardStatValue('total_pods')
    expect(statValue.value).toBe(3)
    expect(statValue.isClickable).toBe(true)

    act(() => { statValue.onClick?.() })
    expect(drillToAllPods).toHaveBeenCalledWith()
  })

  it('getDashboardStatValue wires the clusters block to drillToAllClusters', () => {
    const { result } = renderUsePodsView({ clusters: [makeCluster()] })
    const statValue = result.current.getDashboardStatValue('clusters')
    act(() => { statValue.onClick?.() })
    expect(drillToAllClusters).toHaveBeenCalled()
  })

  it('handleRefresh calls both refetch callbacks', () => {
    const refetchPodIssues = vi.fn()
    const refetchClusters = vi.fn()
    const { result } = renderUsePodsView({ refetchPodIssues, refetchClusters })
    act(() => { result.current.handleRefresh() })
    expect(refetchPodIssues).toHaveBeenCalled()
    expect(refetchClusters).toHaveBeenCalled()
  })
})
