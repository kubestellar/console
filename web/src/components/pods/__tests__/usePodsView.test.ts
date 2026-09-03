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

  // #23097: the pending stat is a phase count and must come from the backend
  // phase census, not the pod-issues feed. The feed withholds Pending pods
  // younger than podPendingAgeThreshold, so deriving the stat from it
  // under-counted for the first two minutes of a pod's life.
  it('counts freshly-created Pending pods from the phase census even when the issues feed is empty', () => {
    const clusters = [makeCluster({
      podCount: 10,
      podPhases: { running: 7, pending: 3, failed: 0, succeeded: 0, unknown: 0 },
    })]
    // No issue rows at all: every Pending pod is younger than the age gate.
    const { result } = renderUsePodsView({ podIssues: [], clusters })

    expect(result.current.stats.pending).toBe(3)
    // The feed itself is untouched — no phantom rows were invented for them.
    expect(result.current.filteredPodIssues).toEqual([])
    expect(result.current.stats.issues).toBe(0)
  })

  it('prefers the census over the issue rows when both are present', () => {
    const clusters = [makeCluster({
      podCount: 20,
      // 5 Pending pods; only 2 are old enough to have surfaced as issues.
      podPhases: { running: 15, pending: 5, failed: 0, succeeded: 0, unknown: 0 },
    })]
    const issues = [
      makeIssue({ name: 'p1', reason: 'Pending', status: 'Pending' }),
      makeIssue({ name: 'p2', reason: 'Pending', status: 'Pending' }),
    ]
    const { result } = renderUsePodsView({ podIssues: issues, clusters })

    expect(result.current.stats.pending).toBe(5)
  })

  it('scopes the census to the globally selected clusters', () => {
    mockIsAllClustersSelected = false
    mockSelectedClusters = ['cluster-a']
    const clusters = [
      makeCluster({ name: 'cluster-a', podCount: 4, podPhases: { running: 2, pending: 2, failed: 0, succeeded: 0, unknown: 0 } }),
      makeCluster({ name: 'cluster-b', podCount: 9, podPhases: { running: 2, pending: 7, failed: 0, succeeded: 0, unknown: 0 } }),
    ]
    const { result } = renderUsePodsView({ podIssues: [], clusters })

    expect(result.current.stats.pending).toBe(2)
    expect(result.current.stats.totalPods).toBe(4)
  })

  it('does not miscount running-unready or terminal pods as pending', () => {
    const clusters = [makeCluster({
      podCount: 12,
      podPhases: { running: 8, pending: 0, failed: 3, succeeded: 1, unknown: 0 },
    })]
    const issues = [
      makeIssue({ name: 'unready', reason: 'Not ready', status: 'Not ready' }),
      makeIssue({ name: 'crash', reason: 'CrashLoopBackOff', status: 'CrashLoopBackOff' }),
      makeIssue({ name: 'oom', reason: 'OOMKilled', status: 'OOMKilled' }),
    ]
    const { result } = renderUsePodsView({ podIssues: issues, clusters })

    expect(result.current.stats.pending).toBe(0)
    expect(result.current.stats.crashloop).toBe(1)
  })

  // #23096 must keep working: unschedulable pods are Pending. Via the census
  // that is automatic (Kubernetes reports them as Pending); with no census the
  // issue-row classifier still has to get it right.
  it('counts unschedulable pods as pending via the census and via the fallback', () => {
    const withCensus = [makeCluster({
      podCount: 80,
      podPhases: { running: 4, pending: 76, failed: 0, succeeded: 0, unknown: 0 },
    })]
    const unschedulableIssues = [
      makeIssue({ name: 'u1', reason: 'Unschedulable: insufficient cpu', status: 'Unschedulable: insufficient cpu' }),
      makeIssue({ name: 'u2', reason: 'Unschedulable: insufficient cpu', status: 'Unschedulable: insufficient cpu' }),
    ]
    const censusResult = renderUsePodsView({ podIssues: unschedulableIssues, clusters: withCensus })
    expect(censusResult.result.current.stats.pending).toBe(76)

    // No census reported (older backend / health not yet collected).
    const fallbackResult = renderUsePodsView({
      podIssues: unschedulableIssues,
      clusters: [makeCluster({ podCount: 80 })],
    })
    expect(fallbackResult.result.current.stats.pending).toBe(2)
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
