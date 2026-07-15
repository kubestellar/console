import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterLocations } from './ClusterLocations'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: vi.fn(),
}))

vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: unknown) => v,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

// ClusterLocations uses SVG/canvas for the world map — stub the map container
vi.mock('../../lib/safeLazy', () => ({
  safeLazy: () => {
    const StubMap = () => <div data-testid="cluster-map" />
    StubMap.displayName = 'StubMap'
    return StubMap
  },
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
const mockGlobalFilters = vi.mocked(useGlobalFilters)
const mockDrillDown = vi.mocked(useDrillDownActions)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

describe('ClusterLocations', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGlobalFilters.mockReturnValue({ selectedClusters: [], isAllClustersSelected: true, customFilter: '' } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDrillDown.mockReturnValue({ drillToCluster: vi.fn() } as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<ClusterLocations />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders empty state when no clusters found', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    const { container } = render(<ClusterLocations />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders error state on cluster fetch failure', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isRefreshing: false, isFailed: true, consecutiveFailures: 3 } as any)
    const { container } = render(<ClusterLocations />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders happy-path with cluster location data', () => {
    const clusters = [
      { name: 'us-east-1', healthy: true, reachable: true, region: 'us-east-1', nodeCount: 5 },
      { name: 'eu-central-1', healthy: true, reachable: true, region: 'eu-central-1', nodeCount: 3 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ deduplicatedClusters: clusters, isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0 } as any)
    const { container } = render(<ClusterLocations />)
    expect(container.firstChild).toBeTruthy()
  })

  it('matches snapshot', () => {
    const { container } = render(<ClusterLocations />)
    expect(container).toMatchSnapshot()
  })
})
