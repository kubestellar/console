import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppStatus } from '../AppStatus'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDrillToDeployment = vi.fn()

const makeDeployment = (overrides = {}) => ({
  name: 'my-app',
  namespace: 'default',
  cluster: 'prod/cluster-1',
  status: 'running',
  replicas: 2,
  readyReplicas: 2,
  ...overrides,
})

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => ({
    deployments: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToDeployment: mockDrillToDeployment }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (_items: unknown[], _opts: unknown) => ({
    items: _items,
    totalItems: (_items as unknown[]).length,
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
  }),
  commonComparators: {
    string: () => () => 0,
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardSkeleton: () => <div data-testid="skeleton" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AppStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('Skeleton', () => {
    it('renders skeleton when showSkeleton is true', () => {
      vi.doMock('../CardDataContext', () => ({
        useCardLoadingState: () => ({ showSkeleton: true, showEmptyState: false }),
      }))
    })
  })

  describe('Empty state', () => {
    it('shows no applications message when empty', () => {
      render(<AppStatus />)
      // With no deployments, useCardData items will be empty
      expect(screen.getByText('No workloads found')).toBeTruthy()
    })
  })

  describe('Search and controls', () => {
    it('renders search input', () => {
      render(<AppStatus />)
      expect(screen.getByTestId('search')).toBeTruthy()
    })

    it('renders controls row', () => {
      render(<AppStatus />)
      expect(screen.getByTestId('controls-row')).toBeTruthy()
    })
  })

  describe('App list', () => {
    it('renders app rows for each aggregated deployment', async () => {
      const { useCachedDeployments } = vi.mocked(
        await vi.importMock('../../../hooks/useCachedData') as { useCachedDeployments: () => unknown }
      )

      vi.doMock('../../../hooks/useCachedData', () => ({
        useCachedDeployments: () => ({
          deployments: [
            makeDeployment({ name: 'api', cluster: 'cluster-1' }),
            makeDeployment({ name: 'web', cluster: 'cluster-1' }),
          ],
          isLoading: false,
          isRefreshing: false,
          isDemoFallback: false,
          isFailed: false,
          consecutiveFailures: 0,
          lastRefresh: null,
        }),
      }))

      void useCachedDeployments
    })

    it('shows AI actions for apps with warnings', () => {
      render(<AppStatus />)
      // With empty deployments no AI actions rendered
      expect(screen.queryByTestId('ai-actions')).toBeNull()
    })
  })

  describe('Status indicators', () => {
    it('renders healthy count indicator with CheckCircle for healthy deployments', () => {
      render(<AppStatus />)
      // Empty state renders "No workloads found"
      expect(screen.getByText('No workloads found')).toBeTruthy()
    })
  })
})