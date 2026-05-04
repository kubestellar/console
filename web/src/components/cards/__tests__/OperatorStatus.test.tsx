import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before component import
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.count !== undefined ? `${key}:${opts.count}` : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useReportCardDataState: vi.fn(),
}))

const mockUseCachedOperators = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedOperators: (...args: unknown[]) => mockUseCachedOperators(...args),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [{ name: 'cluster-1' }],
    deduplicatedClusters: [{ name: 'cluster-1' }],
    isLoading: false,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToOperator: vi.fn(),
  }),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: () => false,
  default: () => false,
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
  markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

// Mock useCardData and useCardFilters from cardHooks
vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[]) => ({
    items,
    allFilteredItems: items,
    totalItems: (items as unknown[]).length,
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
      availableClusters: [{ name: 'cluster-1' }],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
  useCardFilters: (items: unknown[]) => ({
    filtered: items,
    search: '',
    setSearch: vi.fn(),
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [],
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  }),
  commonComparators: {
    string: () => () => 0,
    number: () => () => 0,
    date: () => () => 0,
  },
}))

// Mock card UI components
vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" className="animate-pulse" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Import component after mocks
import { OperatorStatus } from '../OperatorStatus'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockOperator {
  name: string
  namespace: string
  cluster: string
  status: string
  version: string
  upgradeAvailable?: string
}

function makeOperator(overrides: Partial<MockOperator> = {}): MockOperator {
  return {
    name: 'my-operator',
    namespace: 'operators',
    cluster: 'cluster-1',
    status: 'Succeeded',
    version: 'v1.2.3',
    upgradeAvailable: undefined,
    ...overrides,
  }
}

function defaultHookResult(overrides: Record<string, unknown> = {}) {
  return {
    operators: [makeOperator()],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OperatorStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedOperators.mockReturnValue(defaultHookResult())
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
      loadingTimedOut: false,
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<OperatorStatus />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<OperatorStatus />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('shows skeleton when loading', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
      hasData: false,
      isRefreshing: false,
      loadingTimedOut: false,
    })
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ operators: [], isLoading: true }))

    render(<OperatorStatus />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('shows empty state when no operators', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
      loadingTimedOut: false,
    })
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ operators: [] }))

    render(<OperatorStatus />)
    expect(screen.getByText('operatorStatus.noOperators')).toBeTruthy()
  })

  it('shows error state when fetch failed and showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
      loadingTimedOut: false,
    })
    mockUseCachedOperators.mockReturnValue(
      defaultHookResult({ operators: [], isFailed: true, consecutiveFailures: 3 }),
    )

    render(<OperatorStatus />)
    expect(screen.getAllByText(/operatorStatus.errorLoading/)[0]).toBeInTheDocument()
  })

  it('handles empty operators array gracefully', () => {
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ operators: [] }))
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
      loadingTimedOut: false,
    })

    const { container } = render(<OperatorStatus />)
    expect(container).toBeTruthy()
  })

  it('renders operator name when data is provided', () => {
    const operators = [
      makeOperator({ name: 'cert-manager', status: 'Succeeded' }),
      makeOperator({ name: 'prometheus', status: 'Failed' }),
    ]
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ operators }))

    render(<OperatorStatus />)
    expect(screen.getByText('cert-manager')).toBeTruthy()
  })

  it('renders operator status badges', () => {
    const operators = [
      makeOperator({ name: 'op-a', status: 'Succeeded' }),
      makeOperator({ name: 'op-b', status: 'Failed' }),
    ]
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ operators }))

    render(<OperatorStatus />)
    expect(screen.getByText('Succeeded')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('reports isDemoData when isDemoFallback is true', () => {
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ isDemoFallback: true }))

    render(<OperatorStatus />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders retry button in error state', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
      loadingTimedOut: true,
    })
    mockUseCachedOperators.mockReturnValue(
      defaultHookResult({ operators: [], isFailed: true, consecutiveFailures: 2 }),
    )

    render(<OperatorStatus />)
    expect(screen.getByText('common:common.retry')).toBeTruthy()
  })

  it('renders operator list as an accessible list role', () => {
    render(<OperatorStatus />)
    const list = screen.getByRole('group', { name: 'Operators' })
    expect(list).toBeTruthy()
  })

  it('handles background refresh state', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: true,
      loadingTimedOut: false,
    })
    mockUseCachedOperators.mockReturnValue(defaultHookResult({ isRefreshing: true }))

    const { container } = render(<OperatorStatus />)
    expect(container).toBeTruthy()
  })
})
