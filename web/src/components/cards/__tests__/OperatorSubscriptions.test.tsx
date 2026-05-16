import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.count !== undefined ? `${key}:${opts.count}` : key,
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockUseCachedOperatorSubscriptions = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedOperatorSubscriptions: (...args: unknown[]) => mockUseCachedOperatorSubscriptions(...args),
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

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[]) => ({
    items,
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
      sortBy: 'pending',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
  useCardFilters: (items: unknown[]) => ({ filtered: items }),
  commonComparators: {
    string: () => () => 0,
  },
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { OperatorSubscriptions } from '../OperatorSubscriptions'

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    name: 'subscription-a',
    namespace: 'operators',
    cluster: 'cluster-1',
    channel: 'stable',
    currentCSV: 'csv.v1',
    installPlanApproval: 'Automatic',
    pendingUpgrade: '',
    ...overrides,
  }
}

function defaultHookResult(overrides: Record<string, unknown> = {}) {
  return {
    subscriptions: [makeSubscription()],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('OperatorSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedOperatorSubscriptions.mockReturnValue(defaultHookResult())
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
      loadingTimedOut: false,
    })
  })

  it('suppresses failure state when cached data exists', () => {
    mockUseCachedOperatorSubscriptions.mockReturnValue(
      defaultHookResult({ isFailed: true, consecutiveFailures: 3 }),
    )

    render(<OperatorSubscriptions />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({
        hasAnyData: true,
        isFailed: false,
        consecutiveFailures: 3,
      }),
    )
  })

  it('preserves failure state when no data exists', () => {
    mockUseCachedOperatorSubscriptions.mockReturnValue(
      defaultHookResult({ subscriptions: [], isFailed: true, consecutiveFailures: 3 }),
    )

    render(<OperatorSubscriptions />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({
        hasAnyData: false,
        isFailed: true,
        consecutiveFailures: 3,
      }),
    )
  })
})
