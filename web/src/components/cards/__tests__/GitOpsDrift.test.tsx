import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GitOpsDrift } from '../GitOpsDrift'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeDrift = (overrides = {}) => ({
  resource: 'my-deployment',
  kind: 'Deployment',
  cluster: 'cluster-1',
  namespace: 'default',
  driftType: 'modified',
  severity: 'high' as const,
  details: 'replicas changed',
  gitVersion: 'main@abc123',
  ...overrides,
})

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGitOpsDrifts: vi.fn(() => ({
    drifts: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
  })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedSeverities: ['critical', 'high', 'medium', 'low', 'info'],
    isAllSeveritiesSelected: true,
    customFilter: '',
  })),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
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
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'severity',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${k}:${opts.count}`
      return k
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

vi.mock('../../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../ui/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../deploy/GitOpsDriftDetailModal', () => ({
  GitOpsDriftDetailModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="drift-modal" /> : null,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GitOpsDrift', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders loader spinner when showSkeleton', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<GitOpsDrift />)
      // Loader2 renders as svg with animate-spin
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeTruthy()
    })
  })

  describe('Empty state', () => {
    it('shows no drift message when showEmptyState', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText('gitOpsDrift.noDrift')).toBeTruthy()
    })

    it('shows in sync message when drift list is empty', () => {
      render(<GitOpsDrift />)
      expect(screen.getByText('gitOpsDrift.noDriftDetected')).toBeTruthy()
    })
  })

  describe('Drift list', () => {
    it('renders drift resource name and kind', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift()],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText('my-deployment')).toBeTruthy()
      expect(screen.getByText('Deployment')).toBeTruthy()
    })

    it('renders cluster badge', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift()],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText('cluster-1')).toBeTruthy()
    })

    it('renders drift type badge', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift({ driftType: 'modified' })],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText('cards:gitOpsDrift.modified')).toBeTruthy()
    })

    it('shows high severity count badge when high drifts exist', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift({ severity: 'high' })],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText(/gitOpsDrift.nCritical/)).toBeTruthy()
    })

    it('opens modal when drift item clicked', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift()],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      fireEvent.click(screen.getByText('my-deployment'))
      expect(screen.getByTestId('drift-modal')).toBeTruthy()
    })

    it('renders git version code', async () => {
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift({ gitVersion: 'main@abc123' })],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.getByText('main@abc123')).toBeTruthy()
    })
  })

  describe('Severity filter', () => {
    it('filters out low severity drifts when only critical selected', async () => {
      const { useGlobalFilters } = await import('../../../hooks/useGlobalFilters')
      vi.mocked(useGlobalFilters).mockReturnValue({
        selectedSeverities: ['critical'],
        isAllSeveritiesSelected: false,
        customFilter: '',
      } as never)
      const { useCachedGitOpsDrifts } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGitOpsDrifts).mockReturnValue({
        drifts: [makeDrift({ severity: 'low', resource: 'low-resource' })],
        isLoading: false, isRefreshing: false, error: null, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<GitOpsDrift />)
      expect(screen.queryByText('low-resource')).toBeNull()
    })
  })
})