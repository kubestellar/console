import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUInventory } from '../GPUInventory'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeNode = (overrides = {}) => ({
  name: 'gpu-node-1',
  cluster: 'cluster-1',
  gpuType: 'NVIDIA A100',
  gpuCount: 8,
  gpuAllocated: 4,
  ...overrides,
})

const mockDrillToGPUNode = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(() => ({
    nodes: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToGPUNode: mockDrillToGPUNode }),
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
    goToPage: vi.fn(),
    needsPagination: false,
    itemsPerPage: 5,
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
      return k
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search" value={value} onChange={e => onChange(e.target.value)} />
  ),
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

vi.mock('../../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../ui/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GPUInventory', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
    vi.mocked(useCachedGPUNodes).mockReturnValue({
      nodes: [], isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
    } as never)
  })

  describe('Loading skeleton', () => {
    it('renders skeletons when isLoading and no nodes', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [], isLoading: true, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValueOnce({ showSkeleton: true, showEmptyState: false } as never)
      render(<GPUInventory />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no GPU nodes message when no data', () => {
      render(<GPUInventory />)
      expect(screen.getByText('gpuInventory.noGPUNodes')).toBeTruthy()
      expect(screen.getByText('gpuInventory.noGPUResourcesDetected')).toBeTruthy()
    })
  })

  describe('Summary stats', () => {
    it('renders total, in-use, available GPU counts', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText('common:common.total')).toBeTruthy()
      expect(screen.getByText('gpuInventory.inUse')).toBeTruthy()
      expect(screen.getByText('common:common.available')).toBeTruthy()
      // total=8, allocated=4, available=4
      expect(screen.getByText('8')).toBeTruthy()
      expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(2)
    })

    it('renders green badge with total GPU count', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText(/gpuInventory.gpuCount/)).toBeTruthy()
    })
  })

  describe('Node list', () => {
    it('renders node name', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText('gpu-node-1')).toBeTruthy()
    })

    it('renders cluster badge', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText('cluster-1')).toBeTruthy()
    })

    it('renders GPU type and allocated/total', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText('NVIDIA A100')).toBeTruthy()
      expect(screen.getByText('4/8')).toBeTruthy()
    })

    it('calls drillToGPUNode on row click', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      fireEvent.click(screen.getByText('gpu-node-1'))
      expect(mockDrillToGPUNode).toHaveBeenCalledWith('cluster-1', 'gpu-node-1', expect.objectContaining({
        gpuType: 'NVIDIA A100',
        gpuCount: 8,
        gpuAllocated: 4,
      }))
    })

    it('renders utilization progress bar', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      const bar = document.querySelector('.bg-purple-500')
      expect(bar).toBeTruthy()
      expect((bar as HTMLElement).style.width).toBe('50%')
    })
  })

  describe('Error banner', () => {
    it('shows simulated data warning when error exists', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: 'connection refused', isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByText('gpuInventory.usingSimulatedData')).toBeTruthy()
    })

    it('hides simulated data warning when no error', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.queryByText('gpuInventory.usingSimulatedData')).toBeNull()
    })
  })

  describe('Controls', () => {
    it('renders search input', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByTestId('search')).toBeTruthy()
    })

    it('renders cluster filter', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, error: null, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUInventory />)
      expect(screen.getByTestId('cluster-filter')).toBeTruthy()
    })
  })
})