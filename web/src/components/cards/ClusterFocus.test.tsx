import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterFocus } from './ClusterFocus'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(),
  useCachedPodIssues: vi.fn(),
  useCachedDeploymentIssues: vi.fn(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: vi.fn(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => null,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardHeaderActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeaderRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardStatGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardStatHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes, useCachedPodIssues, useCachedDeploymentIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
const mockGPUNodes = vi.mocked(useCachedGPUNodes)
const mockPodIssues = vi.mocked(useCachedPodIssues)
const mockDeploymentIssues = vi.mocked(useCachedDeploymentIssues)
const mockGlobalFilters = vi.mocked(useGlobalFilters)
const mockDrillDown = vi.mocked(useDrillDownActions)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

describe('ClusterFocus', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    mockClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as ReturnType<typeof useClusters>)
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as ReturnType<typeof useCachedGPUNodes>)
    mockPodIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as ReturnType<typeof useCachedPodIssues>)
    mockDeploymentIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as ReturnType<typeof useCachedDeploymentIssues>)
    mockGlobalFilters.mockReturnValue({ selectedClusters: [], isAllClustersSelected: true, customFilter: '' } as ReturnType<typeof useGlobalFilters>)
    mockDrillDown.mockReturnValue({ drillToCluster: vi.fn(), drillToPod: vi.fn(), drillToDeployment: vi.fn(), drillToResources: vi.fn() } as ReturnType<typeof useDrillDownActions>)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<ClusterFocus />)
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders empty state when no clusters available', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ClusterFocus />)
    expect(screen.getByText('cards:clusterFocus.noClustersAvailable')).toBeInTheDocument()
  })

  it('renders select-cluster prompt when no cluster configured', () => {
    mockClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'prod' }], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as ReturnType<typeof useClusters>)
    render(<ClusterFocus />)
    expect(screen.getByText('cards:clusterFocus.selectClusterToView')).toBeInTheDocument()
  })

  it('renders happy-path with configured cluster', () => {
    const clusters = [{ name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 30, cpuCores: 32, memoryGB: 128, server: 'https://prod.api.example.com' }]
    mockClusters.mockReturnValue({ deduplicatedClusters: clusters, isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as ReturnType<typeof useClusters>)
    render(<ClusterFocus config={{ cluster: 'prod' }} />)
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const { container } = render(<ClusterFocus />)
    expect(container.firstChild).toBeTruthy()
  })
})
