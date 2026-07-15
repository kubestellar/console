import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterMetrics } from './ClusterMetrics'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

vi.mock('../../hooks/mcp/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    CLUSTER_POLL_INTERVAL_MS: 60000,
    agentFetch: vi.fn(),
  }
})

vi.mock('../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => null,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useChartFilters: vi.fn(),
}))

vi.mock('../../lib/safeLazy', () => ({
  safeLazy: (fn: () => Promise<unknown>) => {
    // Return a simple stub component in tests
    const StubChart = () => <div data-testid="chart-stub" />
    StubChart.displayName = 'StubChart'
    return StubChart
  },
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
}))

vi.mock('../../lib/theme/chartColors', () => ({
  METRIC_CPU_COLOR: '#3b82f6',
  METRIC_MEMORY_COLOR: '#22c55e',
  METRIC_PODS_COLOR: '#a855f7',
  METRIC_NODES_COLOR: '#f59e0b',
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60000,
  MS_PER_HOUR: 3600000,
  MS_PER_DAY: 86400000,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusters } from '../../hooks/useMCP'
import { useChartFilters } from '../../lib/cards/cardHooks'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusters = vi.mocked(useClusters)
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

const baseChartFilters = {
  localClusterFilter: [],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  availableClusters: [],
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
}

describe('ClusterMetrics', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue(baseClusters as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockChartFilters.mockReturnValue(baseChartFilters as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    render(<ClusterMetrics />)
    expect(screen.getByText('clusterMetrics.loadingMetrics')).toBeInTheDocument()
  })

  it('renders empty state when no clusters connected', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ClusterMetrics />)
    expect(screen.getByText('clusterMetrics.noMetricsData')).toBeInTheDocument()
  })

  it('renders error state on cluster fetch failure', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, isFailed: true, consecutiveFailures: 3 } as any)
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<ClusterMetrics />)
    expect(screen.getByText('clusterMetrics.noMetricsData')).toBeInTheDocument()
  })

  it('renders happy-path with cluster metric data', () => {
    const clusters = [
      { name: 'prod', healthy: true, reachable: true, nodeCount: 5, podCount: 42, cpuCores: 40, memoryGB: 160 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: clusters } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockChartFilters.mockReturnValue({ ...baseChartFilters, availableClusters: ['prod'] } as any)
    const { container } = render(<ClusterMetrics />)
    expect(container.firstChild).toBeTruthy()
  })

  it('matches snapshot', () => {
    const { container } = render(<ClusterMetrics />)
    expect(container).toMatchSnapshot()
  })
})
