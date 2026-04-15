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

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' }),
}))

const mockUseMetricsHistory = vi.fn()
vi.mock('../../../hooks/useMetricsHistory', () => ({
  useMetricsHistory: () => mockUseMetricsHistory(),
  // GPUUsageTrend uses the read-only variant to avoid duplicate MCP polling
  // and stacked capture intervals. We expose the same mock data for both so
  // existing tests that seed `mockUseMetricsHistory` continue to cover the
  // card's fallback path.
  useMetricsHistoryReadOnly: () => ({ history: mockUseMetricsHistory().history }),
}))

// Mock the MCP compute module so GPUUsageTrend's tertiary fallback
// (issues #8080, #8081) sees an empty persisted GPU cache in tests
// and does not rely on real localStorage side effects.
vi.mock('../../../hooks/mcp/compute', () => ({
  gpuNodeCache: { nodes: [], lastUpdated: null, isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null },
}))

import { GPUUsageTrend } from '../GPUUsageTrend'

describe('GPUUsageTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
    mockUseMetricsHistory.mockReturnValue({ history: [], captureNow: vi.fn(), clearHistory: vi.fn(), getClusterTrend: () => 'stable', getPodRestartTrend: () => 'stable', snapshotCount: 0 })
  })

  it('renders without crashing', () => {
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<GPUUsageTrend />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('handles GPU data fetch failure', () => {
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<GPUUsageTrend />)
    expect(container).toBeTruthy()
  })

  it('reports GPU demo fallback state', () => {
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<GPUUsageTrend />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  // Regression: when the live fetch returns zero nodes (intermittent failure)
  // the card should fall back to the most-recent metrics-history snapshot so
  // it stays populated instead of flashing "No GPU Nodes".
  it('uses metrics-history snapshot fallback when live GPU nodes are empty', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockGPUNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 2, error: 'boom', lastRefresh: Date.now() })
    mockUseMetricsHistory.mockReturnValue({
      history: [
        {
          timestamp: new Date().toISOString(),
          clusters: [],
          podIssues: [],
          gpuNodes: [
            { name: 'node-a', cluster: 'vllm-d', gpuType: 'NVIDIA H100', gpuAllocated: 2, gpuTotal: 8 },
          ],
        },
      ],
      captureNow: vi.fn(),
      clearHistory: vi.fn(),
      getClusterTrend: () => 'stable',
      getPodRestartTrend: () => 'stable',
      snapshotCount: 1 })
    const { container } = render(<GPUUsageTrend />)
    // Card should NOT show the empty-state message when fallback data exists.
    expect(container.textContent).not.toContain('No GPU Nodes')
  })

})