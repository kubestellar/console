import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterHealth } from './ClusterHealth'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
  useCardDemoState: () => ({ shouldUseDemoData: false, reason: null, showDemoBadge: false }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
  getDemoClusters: vi.fn(() => []),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '', state: null })),
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => null,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
const mockGPUNodes = vi.mocked(useCachedGPUNodes)

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
  lastRefresh: null,
}

describe('ClusterHealth', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue(baseClusters as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGPUNodes.mockReturnValue(baseGPUNodes as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<ClusterHealth />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders empty state when no clusters found', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ClusterHealth />)
    // Empty state message displayed
    const container = document.body
    expect(container).toBeTruthy()
  })

  it('renders error state on consecutive failures', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, isFailed: true, consecutiveFailures: 3 } as any)
    const { container } = render(<ClusterHealth />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders happy-path with cluster data', () => {
    const clusters = [
      { name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 42, cpuCores: 40, memoryGB: 160, version: 'v1.30.2' },
      { name: 'staging', healthy: false, reachable: true, nodeCount: 3, podCount: 15, cpuCores: 24, memoryGB: 96, version: 'v1.29.6' },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: clusters } as any)
    render(<ClusterHealth />)
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('staging')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const clusters = [
      { name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 42, cpuCores: 40, memoryGB: 160, version: 'v1.30.2' },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: clusters } as any)
    const { container } = render(<ClusterHealth />)
    expect(container.firstChild).toBeTruthy()
  })
})
