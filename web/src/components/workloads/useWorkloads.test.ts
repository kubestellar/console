import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import '../../test/utils/setupMocks'

interface MockPodIssue {
  name: string
  namespace: string
  cluster: string
  reason: string
}

interface MockDeploymentIssue {
  name: string
  namespace: string
  cluster: string
  reason: string
}

interface MockDeployment {
  name: string
  namespace: string
  cluster: string
  status: string
  replicas: number
  readyReplicas: number
}

interface MockCluster {
  name: string
  [key: string]: unknown
}

let mockPodIssues: MockPodIssue[] = []
let mockDeploymentIssues: MockDeploymentIssue[] = []
let mockDeployments: MockDeployment[] = []
let mockClusters: MockCluster[] = []
let mockIsLoading = false
let mockHookError: string | null = null
let mockAgentStatus: 'connected' | 'disconnected' = 'connected'

const {
  refetchPodIssuesSpy,
  refetchDeploymentIssuesSpy,
  refetchDeploymentsSpy,
  refetchClustersSpy,
  showToastSpy,
  drillToNamespaceSpy,
  drillToAllNamespacesSpy,
  drillToAllDeploymentsSpy,
  drillToAllPodsSpy,
  drillToDeploymentSpy,
  kubectlExecSpy,
} = vi.hoisted(() => ({
  refetchPodIssuesSpy: vi.fn(),
  refetchDeploymentIssuesSpy: vi.fn(),
  refetchDeploymentsSpy: vi.fn(),
  refetchClustersSpy: vi.fn(),
  showToastSpy: vi.fn(),
  drillToNamespaceSpy: vi.fn(),
  drillToAllNamespacesSpy: vi.fn(),
  drillToAllDeploymentsSpy: vi.fn(),
  drillToAllPodsSpy: vi.fn(),
  drillToDeploymentSpy: vi.fn(),
  kubectlExecSpy: vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 }),
}))

vi.mock('../../hooks/useMCP', () => ({
  usePodIssues: () => ({ issues: mockPodIssues, isLoading: mockIsLoading, isRefreshing: false, error: mockHookError, lastUpdated: null, refetch: refetchPodIssuesSpy }),
  useDeploymentIssues: () => ({ issues: mockDeploymentIssues, isLoading: mockIsLoading, isRefreshing: false, error: mockHookError, lastUpdated: null, refetch: refetchDeploymentIssuesSpy }),
  useDeployments: () => ({ deployments: mockDeployments, isLoading: mockIsLoading, isRefreshing: false, error: mockHookError, lastUpdated: null, refetch: refetchDeploymentsSpy }),
  useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters, isLoading: mockIsLoading, error: mockHookError, lastUpdated: null, refetch: refetchClustersSpy }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    filterByCluster: <T,>(items: T[]) => items,
  }),
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: mockAgentStatus }),
  wasAgentEverConnected: () => false,
}))

vi.mock('../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: showToastSpy }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: drillToNamespaceSpy,
    drillToAllNamespaces: drillToAllNamespacesSpy,
    drillToAllDeployments: drillToAllDeploymentsSpy,
    drillToAllPods: drillToAllPodsSpy,
    drillToDeployment: drillToDeploymentSpy,
  }),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: kubectlExecSpy },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'en' } }),
}))

import { useWorkloads } from './useWorkloads'

describe('useWorkloads', () => {
  beforeEach(() => {
    mockPodIssues = []
    mockDeploymentIssues = []
    mockDeployments = []
    mockClusters = []
    mockIsLoading = false
    mockHookError = null
    mockAgentStatus = 'connected'
    refetchPodIssuesSpy.mockClear()
    refetchDeploymentIssuesSpy.mockClear()
    refetchDeploymentsSpy.mockClear()
    refetchClustersSpy.mockClear()
    showToastSpy.mockClear()
    kubectlExecSpy.mockClear()
  })

  it('returns loading state and empty collections initially', () => {
    mockIsLoading = true
    const { result } = renderHook(() => useWorkloads())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.apps).toEqual([])
    expect(result.current.deployments).toEqual([])
    expect(result.current.podIssues).toEqual([])
    expect(result.current.deploymentIssues).toEqual([])
  })

  it('success path: aggregates deployments and issues into namespace apps', () => {
    mockDeployments = [
      { name: 'dep-1', namespace: 'ns1', cluster: 'c1', status: 'running', replicas: 2, readyReplicas: 2 },
    ]
    mockPodIssues = [
      { name: 'pod-1', namespace: 'ns1', cluster: 'c1', reason: 'CrashLoopBackOff' },
    ]
    mockDeploymentIssues = []

    const { result } = renderHook(() => useWorkloads())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.apps).toHaveLength(1)
    expect(result.current.apps[0]).toMatchObject({
      namespace: 'ns1',
      cluster: 'c1',
      deploymentCount: 1,
      podIssues: 1,
      status: 'warning',
    })
    expect(result.current.stats.totalDeployments).toBe(1)
    expect(result.current.stats.totalPodIssues).toBe(1)
  })

  it('error path: surfaces loadError from underlying hooks', () => {
    mockHookError = 'failed to fetch deployments'
    const { result } = renderHook(() => useWorkloads())
    expect(result.current.loadError).toBe('failed to fetch deployments')
  })

  it('handleRefresh refetches all underlying data sources', () => {
    const { result } = renderHook(() => useWorkloads())
    act(() => {
      result.current.handleRefresh()
    })
    expect(refetchPodIssuesSpy).toHaveBeenCalled()
    expect(refetchDeploymentIssuesSpy).toHaveBeenCalled()
    expect(refetchDeploymentsSpy).toHaveBeenCalled()
    expect(refetchClustersSpy).toHaveBeenCalled()
  })

  it('handleImportWorkloads appends imported workloads and shows a toast', () => {
    const { result } = renderHook(() => useWorkloads())
    act(() => {
      result.current.handleImportWorkloads([
        {
          name: 'imported-1',
          namespace: 'ns2',
          targetClusters: ['c2'],
          replicas: 1,
          readyReplicas: 1,
          image: 'nginx',
        } as never,
      ])
    })
    expect(showToastSpy).toHaveBeenCalled()
    expect(result.current.deployments.some(d => d.name === 'imported-1')).toBe(true)
  })

  it('handleDeleteDeployment sets pendingDelete and confirmDeleteDeployment clears it after exec', async () => {
    const { result } = renderHook(() => useWorkloads())
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

    act(() => {
      result.current.handleDeleteDeployment(fakeEvent, 'c1', 'ns1', 'dep-1')
    })
    expect(result.current.pendingDelete).toEqual({ cluster: 'c1', namespace: 'ns1', name: 'dep-1' })

    await act(async () => {
      await result.current.confirmDeleteDeployment()
    })
    expect(kubectlExecSpy).toHaveBeenCalledWith(
      ['delete', 'deployment', 'dep-1', '-n', 'ns1'],
      { context: 'c1' }
    )
    expect(result.current.pendingDelete).toBeNull()
  })

  it('handleShowLogs drills into the deployment pods tab', () => {
    const { result } = renderHook(() => useWorkloads())
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent
    act(() => {
      result.current.handleShowLogs(fakeEvent, 'c1', 'ns1', 'dep-1')
    })
    expect(drillToDeploymentSpy).toHaveBeenCalledWith('c1', 'ns1', 'dep-1', { tab: 'pods' })
  })

  it('shows skeletons while loading with no data yet', () => {
    mockIsLoading = true
    const { result } = renderHook(() => useWorkloads())
    expect(result.current.showSkeletons).toBe(true)
  })
})
