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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPodIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDeploymentIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, lastRefresh: null } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGlobalFilters.mockReturnValue({ selectedClusters: [], isAllClustersSelected: true, customFilter: '' } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDrillDown.mockReturnValue({ drillToCluster: vi.fn(), drillToPod: vi.fn(), drillToDeployment: vi.fn(), drillToResources: vi.fn() } as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'prod' }], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as any)
    render(<ClusterFocus />)
    expect(screen.getByText('cards:clusterFocus.selectClusterToView')).toBeInTheDocument()
  })

  it('renders happy-path with configured cluster', () => {
    const clusters = [{ name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 30, cpuCores: 32, memoryGB: 128, server: 'https://prod.api.example.com' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: clusters, isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null } as any)
    render(<ClusterFocus config={{ cluster: 'prod' }} />)
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('matches snapshot', () => {
    const { container } = render(<ClusterFocus />)
    expect(container).toMatchSnapshot()
  })
})
