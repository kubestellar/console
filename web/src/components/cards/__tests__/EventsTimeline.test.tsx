import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

interface ChartOptionShape {
  xAxis: { data: unknown[] }
  series: Array<{ data: unknown[] }>
}

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockEvents = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedEvents: () => mockEvents(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockLazyEChart = vi.fn()
vi.mock('../../charts/LazyEChart', () => ({
  LazyEChart: (props: { option: ChartOptionShape }) => {
    mockLazyEChart(props)
    return <div data-testid="events-timeline-chart" />
  },
}))

import { EventsTimeline } from '../EventsTimeline'

describe('EventsTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockEvents.mockReturnValue({ events: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [], isAllClustersSelected: true, clusterInfoMap: {}, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' })
  })

  it('renders without crashing', () => {
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<EventsTimeline />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    mockEvents.mockReturnValue({ events: [], isLoading: true, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: null })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: true, isRefreshing: false, error: null, lastRefresh: null })
    const { container } = render(<EventsTimeline />)
    // Skeleton renders animate-pulse elements or similar loading indicators
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('handles empty data state gracefully', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true, hasData: false, isRefreshing: false })
    const { container } = render(<EventsTimeline />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockEvents.mockReturnValue({ events: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockEvents.mockReturnValue({ events: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockEvents.mockReturnValue({ events: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<EventsTimeline />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('uses filtered events for summary counts even when timestamps are outside the selected range', () => {
    mockEvents.mockReturnValue({
      events: [
        { type: 'Warning', reason: 'BackOff', message: 'Pod is backing off', object: 'Pod/app-1', namespace: 'default', cluster: 'prod-cluster', count: 3, lastSeen: '2026-01-01T00:00:00Z' },
        { type: 'Normal', reason: 'Started', message: 'Pod started', object: 'Pod/app-2', namespace: 'default', cluster: 'prod-cluster', count: 2, lastSeen: '2026-01-01T00:05:00Z' },
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
      lastRefresh: Date.now(),
    })
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastRefresh: Date.now(),
    })

    render(<EventsTimeline />)

    expect(screen.getByLabelText('Events timeline chart showing 3 warnings and 2 normal events, peak 0 events')).toBeTruthy()
  })

  it('handles undefined hook data without crashing', () => {
    mockEvents.mockReturnValue({ events: undefined, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: null })
    mockUseClusters.mockReturnValue({ clusters: undefined, deduplicatedClusters: undefined, isLoading: false, isRefreshing: false, error: null, lastRefresh: null })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: undefined, isAllClustersSelected: true, clusterInfoMap: undefined, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' })
    const { container } = render(<EventsTimeline />)
    expect(container).toBeTruthy()
  })

  it('passes array-backed chart data to ECharts', () => {
    mockEvents.mockReturnValue({
      events: [
        { type: 'Warning', reason: 'BackOff', message: 'Pod is backing off', object: 'Pod/app-1', namespace: 'default', cluster: 'prod-cluster', count: '32', lastSeen: new Date().toISOString() },
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
      lastRefresh: Date.now(),
    })
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastRefresh: Date.now(),
    })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: undefined, isAllClustersSelected: true, clusterInfoMap: undefined, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' })

    render(<EventsTimeline />)

    expect(screen.getByTestId('events-timeline-chart')).toBeTruthy()
    const chartProps = mockLazyEChart.mock.calls[0]?.[0] as { option: ChartOptionShape }
    expect(Array.isArray(chartProps.option.xAxis.data)).toBe(true)
    expect(Array.isArray(chartProps.option.series)).toBe(true)
    expect(Array.isArray(chartProps.option.series[0]?.data)).toBe(true)
    expect(Array.isArray(chartProps.option.series[1]?.data)).toBe(true)
    expect(chartProps.option.series[0]?.data).toContain(32)
  })

})
