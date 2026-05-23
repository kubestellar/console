import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppStatus } from './AppStatus'
import type { Deployment } from '../../hooks/mcp/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key.split('.').pop() ?? key,
  }),
}))

const mockUseCachedDeployments = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedDeployments: () => mockUseCachedDeployments(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockDrillToDeployment = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToDeployment: mockDrillToDeployment }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: () => (a: Record<string, string>, b: Record<string, string>) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ rows }: { rows?: number }) => (
    <div data-testid="card-skeleton" data-rows={rows} />
  ),
  CardEmptyState: ({ title, message }: { title: string; message: string }) => (
    <div data-testid="card-empty-state">
      <p>{title}</p>
      <p>{message}</p>
    </div>
  ),
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardPaginationFooter: ({
    needsPagination,
    currentPage,
    totalPages,
    onPageChange,
  }: {
    needsPagination: boolean
    currentPage: number
    totalPages: number
    onPageChange: (p: number) => void
  }) =>
    needsPagination ? (
      <div data-testid="pagination" data-page={currentPage} data-total={totalPages}>
        <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    ) : null,
  CardAIActions: ({ resource }: { resource: { name: string } }) => (
    <div data-testid={`ai-actions-${resource.name}`} />
  ),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'frontend',
    namespace: 'default',
    cluster: 'prod-cluster',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    progress: 100,
    ...overrides,
  }
}

const defaultCardData = {
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
    localClusterFilter: [] as string[],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [] as Array<{ name: string }>,
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
}

function setupMocks(opts: {
  deployments?: Deployment[]
  isLoading?: boolean
  isRefreshing?: boolean
  isDemoFallback?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: number | null
  showSkeleton?: boolean
  showEmptyState?: boolean
  isAllClustersSelected?: boolean
  selectedClusters?: string[]
  customFilter?: string
  cardItems?: Array<{ name: string; namespace: string; clusters: string[]; status: { healthy: number; warning: number; pending: number } }>
} = {}) {
  mockUseCachedDeployments.mockReturnValue({
    deployments: opts.deployments ?? [],
    isLoading: opts.isLoading ?? false,
    isRefreshing: opts.isRefreshing ?? false,
    isDemoFallback: opts.isDemoFallback ?? false,
    isFailed: opts.isFailed ?? false,
    consecutiveFailures: opts.consecutiveFailures ?? 0,
    lastRefresh: opts.lastRefresh ?? null,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: opts.selectedClusters ?? [],
    isAllClustersSelected: opts.isAllClustersSelected ?? true,
    customFilter: opts.customFilter ?? '',
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })

  const items = opts.cardItems ?? []
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items,
    totalItems: items.length,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Loading / skeleton ----

  describe('loading state', () => {
    it('renders skeleton when showSkeleton is true', () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      render(<AppStatus />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })

    it('passes isLoading and hasAnyData to useCardLoadingState', () => {
      setupMocks({ isLoading: true, deployments: [] })
      render(<AppStatus />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true, hasAnyData: false }),
      )
    })

    it('does not show skeleton when deployments exist', () => {
      setupMocks({ deployments: [makeDeployment()], showSkeleton: false })
      render(<AppStatus />)
      expect(screen.queryByTestId('card-skeleton')).not.toBeInTheDocument()
    })
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('renders empty state when showEmptyState is true', () => {
      setupMocks({ showEmptyState: true })
      render(<AppStatus />)
      expect(screen.getByTestId('card-empty-state')).toBeInTheDocument()
    })

    it('shows correct empty state messages', () => {
      setupMocks({ showEmptyState: true })
      render(<AppStatus />)
      expect(screen.getByText('No applications found')).toBeInTheDocument()
      expect(screen.getByText('Deploy applications to see their status across clusters.')).toBeInTheDocument()
    })
  })

  // ---- App rendering ----

  describe('app list rendering', () => {
    const apps = [
      {
        name: 'frontend',
        namespace: 'default',
        clusters: ['prod-us', 'prod-eu'],
        status: { healthy: 2, warning: 0, pending: 0 },
      },
      {
        name: 'payments-api',
        namespace: 'payments',
        clusters: ['prod-us'],
        status: { healthy: 0, warning: 1, pending: 0 },
      },
    ]

    it('renders app names', () => {
      setupMocks({ cardItems: apps })
      render(<AppStatus />)
      expect(screen.getByText('frontend')).toBeInTheDocument()
      expect(screen.getByText('payments-api')).toBeInTheDocument()
    })

    it('shows cluster badges for each app', () => {
      setupMocks({ cardItems: apps })
      render(<AppStatus />)
      const badges = screen.getAllByTestId('cluster-badge')
      const clusterNames = badges.map((b) => b.textContent)
      expect(clusterNames).toContain('prod-us')
      expect(clusterNames).toContain('prod-eu')
    })

    it('shows healthy status indicator when app has healthy instances', () => {
      setupMocks({
        cardItems: [{ name: 'app', namespace: 'ns', clusters: ['c1'], status: { healthy: 3, warning: 0, pending: 0 } }],
      })
      render(<AppStatus />)
      // healthy count displayed
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('shows warning status indicator when app has warning instances', () => {
      setupMocks({
        cardItems: [{ name: 'app', namespace: 'ns', clusters: ['c1'], status: { healthy: 0, warning: 2, pending: 0 } }],
      })
      render(<AppStatus />)
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('shows pending status indicator when app has pending instances', () => {
      setupMocks({
        cardItems: [{ name: 'app', namespace: 'ns', clusters: ['c1'], status: { healthy: 0, warning: 0, pending: 1 } }],
      })
      render(<AppStatus />)
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('shows AI actions for apps with warnings', () => {
      setupMocks({
        cardItems: [{ name: 'bad-app', namespace: 'ns', clusters: ['c1'], status: { healthy: 0, warning: 1, pending: 0 } }],
      })
      render(<AppStatus />)
      expect(screen.getByTestId('ai-actions-bad-app')).toBeInTheDocument()
    })

    it('does not show AI actions for fully healthy apps', () => {
      setupMocks({
        cardItems: [{ name: 'good-app', namespace: 'ns', clusters: ['c1'], status: { healthy: 3, warning: 0, pending: 0 } }],
      })
      render(<AppStatus />)
      expect(screen.queryByTestId('ai-actions-good-app')).not.toBeInTheDocument()
    })
  })

  // ---- Drill-down ----

  describe('drill-down navigation', () => {
    it('calls drillToDeployment with first cluster when app row is clicked', async () => {
      const apps = [
        {
          name: 'frontend',
          namespace: 'default',
          clusters: ['prod-us', 'prod-eu'],
          status: { healthy: 2, warning: 0, pending: 0 },
        },
      ]
      setupMocks({ cardItems: apps })
      render(<AppStatus />)

      const appRow = screen.getByText('frontend').closest('[class*="cursor-pointer"]')!
      await userEvent.click(appRow)

      expect(mockDrillToDeployment).toHaveBeenCalledWith('prod-us', 'default', 'frontend')
    })

    it('does not call drillToDeployment when app has no clusters', async () => {
      const apps = [
        {
          name: 'orphan-app',
          namespace: 'default',
          clusters: [],
          status: { healthy: 0, warning: 0, pending: 0 },
        },
      ]
      setupMocks({ cardItems: apps })
      render(<AppStatus />)

      const appRow = screen.getByText('orphan-app').closest('[class*="cursor-pointer"]')!
      await userEvent.click(appRow)

      expect(mockDrillToDeployment).not.toHaveBeenCalled()
    })
  })

  // ---- Demo fallback ----

  describe('demo fallback', () => {
    it('passes isDemoFallback as isDemoData to useCardLoadingState', () => {
      setupMocks({ isDemoFallback: true, deployments: [makeDeployment()] })
      render(<AppStatus />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })
  })

  // ---- Deployment grouping ----

  describe('deployment grouping', () => {
    it('groups multiple deployments with same name into one app entry', () => {
      const deployments = [
        makeDeployment({ name: 'api', cluster: 'cluster-a', status: 'running', readyReplicas: 1, replicas: 1 }),
        makeDeployment({ name: 'api', cluster: 'cluster-b', status: 'running', readyReplicas: 1, replicas: 1 }),
      ]
      // useCardData receives preFiltered — verify it gets called with 1 item (both grouped)
      setupMocks({ deployments })
      render(<AppStatus />)

      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].name).toBe('api')
      expect(preFiltered[0].clusters).toHaveLength(2)
    })

    it('passes correct sort config to useCardData', () => {
      setupMocks({ deployments: [makeDeployment()] })
      render(<AppStatus />)

      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('status')
      expect(config.sort.defaultDirection).toBe('desc')
      expect(config.sort.comparators).toHaveProperty('status')
      expect(config.sort.comparators).toHaveProperty('name')
      expect(config.sort.comparators).toHaveProperty('clusters')
    })

    it('passes correct filter config to useCardData', () => {
      setupMocks({ deployments: [makeDeployment()] })
      render(<AppStatus />)

      const config = mockUseCardData.mock.calls[0][1]
      expect(config.filter.searchFields).toEqual(['name', 'namespace'])
    })
  })

  // ---- Pagination ----

  describe('pagination', () => {
    it('shows pagination footer when needsPagination is true', () => {
      const apps = Array.from({ length: 8 }, (_, i) => ({
        name: `app-${i}`,
        namespace: 'default',
        clusters: ['c1'],
        status: { healthy: 1, warning: 0, pending: 0 },
      }))
      mockUseCardData.mockReturnValue({
        ...defaultCardData,
        items: apps.slice(0, 5),
        totalItems: 8,
        totalPages: 2,
        needsPagination: true,
      })
      mockUseCachedDeployments.mockReturnValue({
        deployments: [],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      })
      mockUseGlobalFilters.mockReturnValue({
        selectedClusters: [],
        isAllClustersSelected: true,
        customFilter: '',
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: false,
      })
      render(<AppStatus />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })
  })

  // ---- No workloads after filter ----

  describe('filter results', () => {
    it('shows "no workloads found" when items list is empty after filter', () => {
      setupMocks({ cardItems: [] })
      render(<AppStatus />)
      expect(screen.getByText('No workloads found')).toBeInTheDocument()
    })
  })
})
