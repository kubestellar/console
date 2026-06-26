import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
  useCardDemoState: () => ({ shouldUseDemoData: false, reason: 'none' }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }),
}))

let mockIsRefreshing = false

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedProwJobs: () => ({
    jobs: [{ id: 'job-1', name: 'e2e-test', state: 'success', cluster: 'cluster-1', startedAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-01T00:01:00Z', duration: 60, url: '', type: 'periodic' }],
    status: 'idle',
    isLoading: false,
    isRefreshing: mockIsRefreshing,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
    formatTimeAgo: (d: string) => d,
  }),
}))

vi.mock('../../../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [{ id: 'job-1', name: 'e2e-test', state: 'success', cluster: 'cluster-1', startedAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-01T00:01:00Z', duration: 60, url: '', type: 'periodic' }],
    totalItems: 1,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
      clusterFilterBtnRef: { current: null },
      dropdownStyle: null,
    },
    sorting: {
      sortBy: '',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
      toggleSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: undefined,
  }),
  commonComparators: { string: () => () => 0, number: () => () => 0, statusOrder: () => () => 0, date: () => () => 0, boolean: () => () => 0 },
}))

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1', status: 'Ready' }],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  }),
}))

import { ProwCIMonitor } from '../ProwCIMonitor'

describe('ProwCIMonitor', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProwCIMonitor />)
    expect(container).toBeTruthy()
  })

  it('does not show animate-spin when not refreshing', () => {
    mockIsRefreshing = false
    const { container } = render(<ProwCIMonitor />)
    const refreshIcon = container.querySelector('.animate-spin')
    expect(refreshIcon).toBeNull()
  })

  it('shows animate-spin class on RefreshCw during refresh', () => {
    mockIsRefreshing = true
    const { container } = render(<ProwCIMonitor />)
    const spinningElements = container.querySelectorAll('.animate-spin')
    expect(spinningElements.length).toBeGreaterThanOrEqual(1)
    mockIsRefreshing = false
  })

  it('applies text-blue-400 color during refresh', () => {
    mockIsRefreshing = true
    const { container } = render(<ProwCIMonitor />)
    const blueRefresh = container.querySelector('.text-blue-400.animate-spin')
    expect(blueRefresh).not.toBeNull()
    mockIsRefreshing = false
  })
})
