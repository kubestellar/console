import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServiceStatus } from '../ServiceStatus'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeService = (overrides = {}) => ({
  name: 'my-svc',
  namespace: 'default',
  cluster: 'cluster-1',
  type: 'ClusterIP',
  ports: ['80/TCP'],
  clusterIP: '10.0.0.1',
  ...overrides,
})

const mockDrillToService = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedServices: vi.fn(() => ({
    services: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    error: null,
  })),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToService: mockDrillToService }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false })),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
    items,
    allFilteredItems: items,
    totalItems: (items as unknown[]).length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
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
      sortBy: 'type',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search" value={value} onChange={e => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ServiceStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons when loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true } as never)
      render(<ServiceStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no services found when empty and no error', () => {
      render(<ServiceStatus />)
      expect(screen.getByText('serviceStatus.noServices')).toBeTruthy()
    })

    it('shows failed message on error', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: 'network error',
      } as never)
      render(<ServiceStatus />)
      expect(screen.getByText('serviceStatus.loadError')).toBeTruthy()
    })
  })

  describe('Stats row', () => {
    it('renders total, LB, NodePort, ClusterIP counts', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [
          makeService({ type: 'LoadBalancer' }),
          makeService({ name: 'np', type: 'NodePort' }),
          makeService({ name: 'ci', type: 'ClusterIP' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      // LB count = 1
      expect(screen.getByText('LB')).toBeTruthy()
      expect(screen.getAllByText('NodePort').length).toBeGreaterThan(0)
      expect(screen.getAllByText('ClusterIP').length).toBeGreaterThan(0)
    })
  })

  describe('Service list', () => {
    it('renders service name and namespace', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [makeService()],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      expect(screen.getByText('my-svc')).toBeTruthy()
      expect(screen.getByText('default')).toBeTruthy()
    })

    it('renders cluster badge for each service', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [makeService()],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      expect(screen.getByTestId('cluster-badge')).toBeTruthy()
    })

    it('shows service type badge', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [makeService({ type: 'LoadBalancer' })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      expect(screen.getByText('LoadBalancer')).toBeTruthy()
    })

    it('shows port info when ports exist', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [makeService({ ports: ['443/TCP', '80/TCP'] })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      expect(screen.getByText('443/TCP, 80/TCP')).toBeTruthy()
    })

    it('calls drillToService when row clicked', async () => {
      const { useCachedServices } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedServices).mockReturnValue({
        services: [makeService()],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
        error: null,
      } as never)
      render(<ServiceStatus />)
      fireEvent.click(screen.getByText('my-svc'))
      expect(mockDrillToService).toHaveBeenCalledWith('cluster-1', 'default', 'my-svc', expect.any(Object))
    })
  })

  describe('Search', () => {
    it('renders search input', () => {
      render(<ServiceStatus />)
      expect(screen.getByTestId('search')).toBeTruthy()
    })
  })
})