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

const mockGPUNodes = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockGPUNodes(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' }),
}))

const mockUseMetricsHistory = vi.fn(() => ({ history: [], isLoading: false }))
vi.mock('../../../hooks/useMetricsHistory', () => ({ useMetricsHistory: () => mockUseMetricsHistory() }))

import { GPUInventoryHistory } from '../GPUInventoryHistory'

describe('GPUInventoryHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseMetricsHistory.mockReturnValue({ history: [], isLoading: false })
  })

  it('renders without crashing', () => {
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<GPUInventoryHistory />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

  it('handles GPU data fetch failure', () => {
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

  it('reports GPU demo fallback state', () => {
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<GPUInventoryHistory />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders without crashing when history contains a zero-total snapshot mixed with real data', () => {
    // Regression guard for the flapping-zeros bug: a transient empty capture
    // slipping through carry-forward should be filtered visually so the
    // component still renders cleanly.
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockGPUNodes.mockReturnValue({
      nodes: [{ name: 'node-a', cluster: 'cl-1', gpuType: 'H100', gpuAllocated: 2, gpuCount: 8 }],
      isLoading: false, isRefreshing: false, isDemoFallback: false,
      isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now(),
    })
    mockUseMetricsHistory.mockReturnValue({
      history: [
        { timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), clusters: [], podIssues: [], gpuNodes: [{ name: 'node-a', cluster: 'cl-1', gpuType: 'H100', gpuAllocated: 2, gpuCount: 8, gpuTotal: 8, gpuAllocated_: 2 }] },
        // Transient zero snapshot — must be filtered out of chart/stats
        { timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(), clusters: [], podIssues: [], gpuNodes: [] },
        { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), clusters: [], podIssues: [], gpuNodes: [{ name: 'node-a', cluster: 'cl-1', gpuType: 'H100', gpuAllocated: 3, gpuCount: 8, gpuTotal: 8, gpuAllocated_: 3 }] },
      ],
      isLoading: false,
    })
    const { container } = render(<GPUInventoryHistory />)
    expect(container).toBeTruthy()
  })

})