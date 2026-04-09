import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArgoCDApplicationSets } from '../ArgoCDApplicationSets'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeAppSet = (overrides = {}) => ({
  name: 'my-appset',
  namespace: 'argocd',
  cluster: 'cluster-1',
  status: 'Healthy',
  appCount: 3,
  syncPolicy: 'Automated',
  generators: ['List'],
  template: 'my-template',
  ...overrides,
})

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoApplicationSets: vi.fn(() => ({
    applicationSets: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
  })),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
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
      availableClusters: [],
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
  commonComparators: { string: () => () => 0 },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string) => fallback || k,
  }),
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

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ArgoCDApplicationSets', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no ApplicationSets message', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('No ApplicationSets found')).toBeTruthy()
    })
  })

  describe('Stats row', () => {
    it('renders healthy, progressing, error counts', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [
          makeAppSet({ status: 'Healthy' }),
          makeAppSet({ name: 'prog', status: 'Progressing' }),
          makeAppSet({ name: 'err', status: 'Error' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Progressing').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Error').length).toBeGreaterThan(0)
    })
  })

  describe('AppSet list', () => {
    it('renders appset name', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [makeAppSet()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('my-appset')).toBeTruthy()
    })

    it('renders app count badge', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [makeAppSet({ appCount: 5 })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('5 apps')).toBeTruthy()
    })

    it('renders sync policy badge', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [makeAppSet({ syncPolicy: 'Automated' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('Automated')).toBeTruthy()
    })

    it('renders template line when template exists', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [makeAppSet({ template: 'my-template' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('my-template')).toBeTruthy()
    })

    it('renders demo notice when isDemoData is true', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [makeAppSet()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: true,
      } as never)
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('ArgoCD ApplicationSet Integration')).toBeTruthy()
    })
  })

  describe('Config filtering', () => {
    it('filters by config.cluster when provided', async () => {
      const { useArgoApplicationSets } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoApplicationSets).mockReturnValue({
        applicationSets: [
          makeAppSet({ cluster: 'cluster-1' }),
          makeAppSet({ name: 'other', cluster: 'cluster-2' }),
        ],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplicationSets config={{ cluster: 'cluster-1' }} />)
      expect(screen.getByText('my-appset')).toBeTruthy()
      expect(screen.queryByText('other')).toBeNull()
    })
  })
})