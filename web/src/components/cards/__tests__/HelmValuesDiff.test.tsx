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

const mockHelmReleases = vi.fn()
const mockHelmValues = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedHelmReleases: () => mockHelmReleases(),
  useCachedHelmValues: () => mockHelmValues(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockDrillDown = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockDrillDown(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true, selectedSeverities: [], isAllSeveritiesSelected: true, customFilter: '' }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [], totalItems: 0, currentPage: 1, totalPages: 0, itemsPerPage: 5,
    goToPage: vi.fn(), needsPagination: false, setItemsPerPage: vi.fn(),
    filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null }, clusterFilterBtnRef: { current: null }, dropdownStyle: null },
    sorting: { sortBy: '', setSortBy: vi.fn(), sortDirection: 'asc' as const, setSortDirection: vi.fn(), toggleSortDirection: vi.fn() },
    containerRef: { current: null }, containerStyle: undefined,
  }),
  commonComparators: { string: () => () => 0, number: () => () => 0, statusOrder: () => () => 0, date: () => () => 0, boolean: () => () => 0 },
}))

import { HelmValuesDiff } from '../HelmValuesDiff'

describe('HelmValuesDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockHelmValues.mockReturnValue({ values: {}, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
    mockDrillDown.mockReturnValue({ drillToHelm: vi.fn() })
  })

  it('renders without crashing', () => {
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<HelmValuesDiff />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<HelmValuesDiff />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<HelmValuesDiff />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  // #6267: regression coverage for the freshness-indicator wiring
  // introduced in #6266 (3-source min timestamp + demo-mode suppression).
  describe('freshness indicator wiring (#6265, #6267)', () => {
    it('reports isRefreshing=true when any source is refreshing', () => {
      // Only values is refreshing — combined isRefreshing must still be true
      mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
      mockHelmValues.mockReturnValue({ values: {}, isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
      mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
      render(<HelmValuesDiff />)
      const lastCall = mockUseCardLoadingState.mock.calls[mockUseCardLoadingState.mock.calls.length - 1][0]
      expect(lastCall.isRefreshing).toBe(true)
    })

    it('reports isRefreshing=true when clusters source is refreshing', () => {
      mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: true, error: null, lastRefresh: Date.now() })
      render(<HelmValuesDiff />)
      const lastCall = mockUseCardLoadingState.mock.calls[mockUseCardLoadingState.mock.calls.length - 1][0]
      expect(lastCall.isRefreshing).toBe(true)
    })

    it('reports isRefreshing=false when all 3 sources are quiet', () => {
      mockHelmReleases.mockReturnValue({ releases: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
      mockHelmValues.mockReturnValue({ values: {}, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
      mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
      render(<HelmValuesDiff />)
      const lastCall = mockUseCardLoadingState.mock.calls[mockUseCardLoadingState.mock.calls.length - 1][0]
      expect(lastCall.isRefreshing).toBe(false)
    })
  })
})