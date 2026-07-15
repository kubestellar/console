import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComputeOverview } from './ComputeOverview'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: vi.fn(),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => null,
  CardHeaderActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeaderRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardStatGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardStatHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useChartFilters: vi.fn(),
}))

vi.mock('../ui/ClusterStatusBadge', () => ({
  ClusterStatusDot: () => null,
}))

vi.mock('../../lib/formatStats', () => ({
  formatStat: (v: number) => String(v),
  formatMemoryStat: (v: number) => `${v}GB`,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useChartFilters } from '../../lib/cards/cardHooks'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
const mockGPUNodes = vi.mocked(useCachedGPUNodes)
const mockGlobalFilters = vi.mocked(useGlobalFilters)
const mockDrillDown = vi.mocked(useDrillDownActions)
const mockChartFilters = vi.mocked(useChartFilters)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const baseClusters = {
  deduplicatedClusters: [],
  clusters: [],
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

const baseGPUNodes = {
  nodes: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
}

const baseGlobalFilters = {
  selectedClusters: [],
  isAllClustersSelected: true,
  customFilter: '',
}

const baseDrillDown = {
  drillToResources: vi.fn(),
  drillToCluster: vi.fn(),
  drillToPod: vi.fn(),
  drillToDeployment: vi.fn(),
}

const baseChartFilters = {
  localClusterFilter: [],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  availableClusters: [],
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
}

describe('ComputeOverview', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue(baseClusters as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGPUNodes.mockReturnValue(baseGPUNodes as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGlobalFilters.mockReturnValue(baseGlobalFilters as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDrillDown.mockReturnValue(baseDrillDown as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockChartFilters.mockReturnValue(baseChartFilters as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    render(<ComputeOverview />)
    expect(screen.getByText('computeOverview.loadingComputeData')).toBeInTheDocument()
  })

  it('renders empty state when no compute data', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ComputeOverview />)
    expect(screen.getByText('computeOverview.noComputeData')).toBeInTheDocument()
  })

  it('renders error/no-data state on cluster fetch failure', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, isFailed: true, consecutiveFailures: 3 } as any)
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ComputeOverview />)
    expect(screen.getByText('computeOverview.noComputeData')).toBeInTheDocument()
  })

  it('renders happy-path with cluster compute data', () => {
    const clusters = [
      { name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 42, cpuCores: 40, memoryGB: 160 },
      { name: 'staging', healthy: true, reachable: true, nodeCount: 3, podCount: 15, cpuCores: 24, memoryGB: 96 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: clusters } as any)
    const { container } = render(<ComputeOverview />)
    expect(container.firstChild).toBeTruthy()
  })

  it('matches snapshot', () => {
    const { container } = render(<ComputeOverview />)
    expect(container).toMatchSnapshot()
  })
})
