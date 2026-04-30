import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HelmReleaseStatus } from '../HelmReleaseStatus'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeRelease = (overrides = {}) => ({
  name: 'prometheus',
  namespace: 'monitoring',
  chart: 'prometheus-25.8.0',
  app_version: '2.48.0',
  status: 'deployed',
  updated: new Date(Date.now() - 3600000).toISOString(),
  revision: '3',
  cluster: 'cluster-1',
  ...overrides,
})

const mockDrillToHelm = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ isLoading: false, deduplicatedClusters: [] }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedHelmReleases: vi.fn(() => ({
    releases: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
  })),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToHelm: mockDrillToHelm }),
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
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
  CardEmptyState: ({ title, message }: { title?: string; message?: string; icon?: unknown }) => <div data-testid="empty-state">{title}{message && <span>{message}</span>}</div>,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HelmReleaseStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no releases message', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('helmReleaseStatus.noReleases')).toBeTruthy()
    })
  })

  describe('Summary stats', () => {
    it('renders total, deployed, failed counts', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease(), makeRelease({ name: 'broken', status: 'failed' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('common:common.total')).toBeTruthy()
      expect(screen.getByText('helmReleaseStatus.deployed')).toBeTruthy()
      expect(screen.getByText('common:common.failed')).toBeTruthy()
    })
  })

  describe('Release list', () => {
    it('renders release name', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('prometheus')).toBeTruthy()
    })

    it('renders chart@version', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('prometheus@25.8.0')).toBeTruthy()
    })

    it('renders status badge for each release', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('deployed')).toBeTruthy()
    })

    it('calls drillToHelm on row click', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      fireEvent.click(screen.getByText('prometheus'))
      expect(mockDrillToHelm).toHaveBeenCalledWith('cluster-1', 'monitoring', 'prometheus', expect.any(Object))
    })

    it('shows AI actions for failed releases', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease({ name: 'broken', status: 'failed' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByTestId('ai-actions')).toBeTruthy()
    })

    it('does not show AI actions for deployed releases', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.queryByTestId('ai-actions')).toBeNull()
    })
  })

  describe('Namespace filter', () => {
    it('renders namespace dropdown', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByRole('combobox')).toBeTruthy()
    })

    it('populates namespace options from releases', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease({ namespace: 'monitoring' }), makeRelease({ name: 'grafana', namespace: 'default' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('monitoring')).toBeTruthy()
      expect(screen.getByText('default')).toBeTruthy()
    })
  })

  // Regression: #9095 — invalid/empty `updated` timestamps rendered "NaNd ago"
  describe('Timestamp guard (#9095)', () => {
    it('renders "Unknown" instead of NaN when updated is an empty string', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease({ updated: '' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('Unknown')).toBeTruthy()
      expect(screen.queryByText(/NaN/)).toBeNull()
    })

    it('renders "Unknown" instead of NaN when updated is a non-ISO string', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease({ updated: 'not-a-real-date' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText('Unknown')).toBeTruthy()
      expect(screen.queryByText(/NaN/)).toBeNull()
    })

    it('renders a normal "h ago" label when updated is a valid ISO timestamp', async () => {
      const { useCachedHelmReleases } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [makeRelease({ updated: new Date(Date.now() - 2 * 3_600_000).toISOString() })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      render(<HelmReleaseStatus />)
      expect(screen.getByText(/\d+h ago/)).toBeTruthy()
    })
  })
})