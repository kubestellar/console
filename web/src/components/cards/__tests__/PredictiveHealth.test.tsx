import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockFilterByCluster = vi.fn(<T extends { cluster?: string }>(items: T[]): T[] => items)
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filterByCluster: mockFilterByCluster,
    selectedClusters: [] as string[],
    isAllClustersSelected: true,
  }),
}))

const mockNodes = vi.fn()
const mockPods = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: () => mockNodes(),
  useCachedPods: () => mockPods(),
}))

import { PredictiveHealth } from '../PredictiveHealth'

describe('PredictiveHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
  })

  it('renders without crashing', () => {
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<PredictiveHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    const { container } = render(<PredictiveHealth />)
    // Skeleton renders animate-pulse elements or similar loading indicators
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('passes nodes and pods through filterByCluster', () => {
    const testNodes = [
      { name: 'node-1', cluster: 'cluster-a', conditions: [], unschedulable: false },
      { name: 'node-2', cluster: 'cluster-b', conditions: [], unschedulable: false },
    ]
    const testPods = [
      { name: 'pod-1', cluster: 'cluster-a', restarts: 0 },
      { name: 'pod-2', cluster: 'cluster-b', restarts: 0 },
    ]
    mockNodes.mockReturnValue({ nodes: testNodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods: testPods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })

    render(<PredictiveHealth />)

    // filterByCluster should be called with both nodes and pods arrays
    expect(mockFilterByCluster).toHaveBeenCalledWith(testNodes)
    expect(mockFilterByCluster).toHaveBeenCalledWith(testPods)
  })

  it('shows only filtered cluster predictions when filter is active', () => {
    // filterByCluster returns only cluster-a items
    mockFilterByCluster.mockImplementation(<T extends { cluster?: string }>(items: T[]): T[] =>
      items.filter(item => item.cluster === 'cluster-a')
    )

    const testNodes = [
      { name: 'node-a', cluster: 'cluster-a', conditions: [{ type: 'MemoryPressure', status: 'True' }], unschedulable: false },
      { name: 'node-b', cluster: 'cluster-b', conditions: [{ type: 'MemoryPressure', status: 'True' }], unschedulable: false },
    ]
    const testPods = [
      { name: 'pod-a', cluster: 'cluster-a', restarts: 0 },
      { name: 'pod-b', cluster: 'cluster-b', restarts: 0 },
    ]
    mockNodes.mockReturnValue({ nodes: testNodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods: testPods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })

    const { container } = render(<PredictiveHealth />)

    // Should only show cluster-a predictions, not cluster-b
    const text = container.textContent || ''
    expect(text).not.toContain('cluster-b')
  })

  it('shows empty state when filter excludes all clusters', () => {
    // filterByCluster returns nothing
    mockFilterByCluster.mockImplementation(() => [])

    const testNodes = [
      { name: 'node-a', cluster: 'cluster-a', conditions: [{ type: 'MemoryPressure', status: 'True' }], unschedulable: false },
    ]
    const testPods = [
      { name: 'pod-a', cluster: 'cluster-a', restarts: 10 },
    ]
    mockNodes.mockReturnValue({ nodes: testNodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods: testPods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })

    const { container } = render(<PredictiveHealth />)

    // With no data after filtering, should show the all-clear / empty state
    const text = container.textContent || ''
    expect(text).toContain('predictiveHealth.allClear')
  })

})