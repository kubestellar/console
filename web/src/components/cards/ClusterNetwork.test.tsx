import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterNetwork } from './ClusterNetwork'

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

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
const mockGlobalFilters = vi.mocked(useGlobalFilters)

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

const baseGlobalFilters = {
  selectedClusters: [],
  isAllClustersSelected: true,
  customFilter: '',
}

describe('ClusterNetwork', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue(baseClusters as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGlobalFilters.mockReturnValue(baseGlobalFilters as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<ClusterNetwork />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders empty state when no network data', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ClusterNetwork />)
    expect(screen.getByText('cards:clusterNetwork.noNetworkData')).toBeInTheDocument()
  })

  it('renders select-cluster prompt when clusters available but none selected', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: [{ name: 'prod', healthy: true }] } as any)
    render(<ClusterNetwork />)
    expect(screen.getByText('cards:clusterNetwork.selectClusterToView')).toBeInTheDocument()
  })

  it('renders happy-path with a configured cluster', () => {
    const clusters = [{ name: 'prod', healthy: true, reachable: true, nodeCount: 5, server: 'https://prod.api.example.com:6443' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: clusters } as any)
    render(<ClusterNetwork config={{ cluster: 'prod' }} />)
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('cards:clusterNetwork.apiServer')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const { container } = render(<ClusterNetwork />)
    expect(container.firstChild).toBeTruthy()
  })
})
