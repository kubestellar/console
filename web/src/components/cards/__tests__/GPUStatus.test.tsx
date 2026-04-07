import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUStatus } from '../GPUStatus'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeNode = (overrides = {}) => ({
  name: 'gpu-node-1',
  cluster: 'cluster-1',
  gpuType: 'NVIDIA A100',
  gpuCount: 4,
  gpuAllocated: 2,
  ...overrides,
})

const mockDrillToCluster = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(() => ({
    nodes: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: mockDrillToCluster }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  getDemoMode: () => false, default: () => false,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
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
      sortBy: 'utilization',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
  commonComparators: { string: () => () => 0 },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${k}:${opts.count}`
      if (opts?.percent !== undefined) return `${k}:${opts.percent}`
      return k
    },
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

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GPUStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<GPUStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no GPU data message when empty', () => {
      render(<GPUStatus />)
      expect(screen.getByText('gpuStatus.noGPUData')).toBeTruthy()
    })
  })

  describe('Cluster GPU stats', () => {
    it('renders cluster rows with utilization badge', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      expect(screen.getByText('cluster-1')).toBeTruthy()
      // used/total
      expect(screen.getByText('2/4 gpuStatus.gpus')).toBeTruthy()
    })

    it('aggregates multiple nodes in same cluster', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [
          makeNode({ gpuCount: 4, gpuAllocated: 2 }),
          makeNode({ name: 'gpu-node-2', gpuCount: 4, gpuAllocated: 4 }),
        ],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      // total=8, used=6
      expect(screen.getByText('6/8 gpuStatus.gpus')).toBeTruthy()
    })

    it('calls drillToCluster on row click', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      fireEvent.click(screen.getByText('cluster-1').closest('.cursor-pointer')!)
      expect(mockDrillToCluster).toHaveBeenCalledWith('cluster-1', expect.any(Object))
    })

    it('shows red utilization badge above 80%', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode({ gpuCount: 10, gpuAllocated: 9 })],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      const badge = document.querySelector('.bg-red-500\\/20')
      expect(badge).toBeTruthy()
    })
  })

  describe('GPU type filter', () => {
    it('renders GPU type dropdown when multiple types present', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [
          makeNode({ gpuType: 'NVIDIA A100' }),
          makeNode({ name: 'n2', gpuType: 'NVIDIA H100', cluster: 'cluster-2' }),
        ],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThan(0)
    })

    it('does not render GPU type dropdown with single type', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      expect(screen.queryByRole('combobox')).toBeNull()
    })
  })

  describe('Cluster count badge', () => {
    it('renders cluster count status badge', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null,
      } as never)
      render(<GPUStatus />)
      expect(screen.getByText(/gpuStatus.clusterCount/)).toBeTruthy()
    })
  })
})