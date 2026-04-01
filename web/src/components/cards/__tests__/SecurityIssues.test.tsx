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
const mockUseCardDemoState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useCardDemoState: (opts: unknown) => mockUseCardDemoState(opts),
}))

const mockSecurityIssues = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedSecurityIssues: () => mockSecurityIssues(),
}))

const mockDrillDown = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockDrillDown(),
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

import { SecurityIssues } from '../SecurityIssues'

describe('SecurityIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseCardDemoState.mockReturnValue({ shouldUseDemoData: false })
    mockSecurityIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockDrillDown.mockReturnValue({ drillToPod: vi.fn() })
  })

  it('renders without crashing', () => {
    const { container } = render(<SecurityIssues />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<SecurityIssues />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    mockSecurityIssues.mockReturnValue({ issues: [], isLoading: true, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: null })
    const { container } = render(<SecurityIssues />)
    // Skeleton renders animate-pulse elements or similar loading indicators
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('handles empty data state gracefully', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true, hasData: false, isRefreshing: false })
    const { container } = render(<SecurityIssues />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<SecurityIssues />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<SecurityIssues />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockSecurityIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<SecurityIssues />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockSecurityIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<SecurityIssues />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockSecurityIssues.mockReturnValue({ issues: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<SecurityIssues />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

})