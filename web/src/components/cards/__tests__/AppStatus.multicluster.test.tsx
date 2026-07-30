import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppStatus } from '../AppStatus'

// Mock all dependencies
const mockUseCachedDeployments = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseDrillDownActions = vi.fn()
const mockUseCardData = vi.fn()

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => mockUseCachedDeployments(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (data: unknown[], config: unknown) => mockUseCardData(data, config),
  commonComparators: {
    string: () => (a: unknown, b: unknown) => 0,
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardSkeleton: () => <div data-testid="skeleton" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
  CardEmptyState: () => <div data-testid="empty-state" />,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

describe('AppStatus - Multi-cluster guards (#16050)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
      customFilter: '',
    })

    mockUseDrillDownActions.mockReturnValue({
      drillToDeployment: vi.fn(),
    })

    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })

    mockUseCardData.mockReturnValue({
      items: [],
      totalItems: 0,
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
      },
      sorting: {
        sortBy: 'status',
        setSortBy: vi.fn(),
        sortDirection: 'desc',
        setSortDirection: vi.fn(),
      },
      containerRef: { current: null },
      containerStyle: {},
    })
  })

  it('renders without crashing when deployments is undefined', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: undefined, // Could happen with malformed API response
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    // Should not crash due to array guard: (deployments || [])
    render(<AppStatus />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({
        hasAnyData: false,
      })
    )
  })

  it('renders without crashing when app.clusters is undefined', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        {
          name: 'test-app',
          namespace: 'default',
          cluster: undefined, // Missing cluster field
          status: 'running',
          replicas: 3,
          readyReplicas: 3,
        },
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
    })

    mockUseCardData.mockReturnValue({
      items: [
        {
          name: 'test-app',
          namespace: 'default',
          clusters: undefined, // This could happen if transformation fails
          status: { healthy: 1, warning: 0, pending: 0 },
        },
      ],
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
      },
      sorting: {
        sortBy: 'status',
        setSortBy: vi.fn(),
        sortDirection: 'desc',
        setSortDirection: vi.fn(),
      },
      containerRef: { current: null },
      containerStyle: {},
    })

    // Should not crash due to guard: (app.clusters || [])
    render(<AppStatus />)

    // Component should render the app name
    expect(screen.getByText('test-app')).toBeInTheDocument()
  })

  it('renders without crashing when app.clusters is empty array', () => {
    mockUseCachedDeployments.mockReturnValue({
      deployments: [
        {
          name: 'test-app',
          namespace: 'default',
          cluster: 'test-cluster',
          status: 'running',
          replicas: 3,
          readyReplicas: 3,
        },
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
    })

    mockUseCardData.mockReturnValue({
      items: [
        {
          name: 'test-app',
          namespace: 'default',
          clusters: [], // Empty array
          status: { healthy: 1, warning: 0, pending: 0 },
        },
      ],
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
      },
      sorting: {
        sortBy: 'status',
        setSortBy: vi.fn(),
        sortDirection: 'desc',
        setSortDirection: vi.fn(),
      },
      containerRef: { current: null },
      containerStyle: {},
    })

    // Should not crash due to guards: (app.clusters || []).map()
    render(<AppStatus />)

    // Component should render the app name
    expect(screen.getByText('test-app')).toBeInTheDocument()
  })
})
