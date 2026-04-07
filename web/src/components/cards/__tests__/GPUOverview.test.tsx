import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUOverview } from '../GPUOverview'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeNode = (overrides = {}) => ({
  name: 'gpu-node-1',
  cluster: 'cluster-1',
  gpuType: 'NVIDIA A100',
  gpuCount: 4,
  gpuAllocated: 2,
  ...overrides,
})

const mockDrillToResources = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: vi.fn(() => ({
    nodes: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [{ name: 'cluster-1', reachable: true, nodeCount: 3, healthy: true }],
  })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToResources: mockDrillToResources }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false })),
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
      sortBy: 'count',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
  commonComparators: {
    number: () => () => 0,
    string: () => () => 0,
  },
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
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardSearchInput: () => <input data-testid="search" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterStatusBadge', () => ({
  ClusterStatusDot: ({ state }: { state: string }) => <span data-testid={`dot-${state}`} />,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GPUOverview', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
    const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
    vi.mocked(useCachedGPUNodes).mockReturnValue({
      nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
    } as never)
    const { useClusters } = await import('../../../hooks/useMCP')
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [{ name: 'cluster-1', reachable: true, nodeCount: 3, healthy: true }],
    } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons when showSkeleton and reachable clusters', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true } as never)
      render(<GPUOverview />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('No reachable clusters', () => {
    it('shows no reachable clusters message', async () => {
      const { useClusters } = await import('../../../hooks/useMCP')
      vi.mocked(useClusters).mockReturnValue({
        deduplicatedClusters: [{ name: 'c1', reachable: false }],
      } as never)
      render(<GPUOverview />)
      expect(screen.getByText('gpuOverview.noReachableClusters')).toBeTruthy()
    })
  })

  describe('Empty GPU state', () => {
    it('shows no GPU data when clusters reachable but no GPU nodes', () => {
      render(<GPUOverview />)
      // nodes=[], totalGPUs=0 → empty state
      expect(screen.getByText('gpuStatus.noGPUData')).toBeTruthy()
    })
  })

  describe('GPU gauge', () => {
    it('renders utilization percent in donut', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      // 2/4 = 50% utilization
      expect(screen.getByText('50%')).toBeTruthy()
      expect(screen.getByText('gpuOverview.utilized')).toBeTruthy()
    })
  })

  describe('Stats tiles', () => {
    it('renders total, allocated, cluster count', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      expect(screen.getAllByText('4').length).toBeGreaterThan(0) // totalGPUs
      expect(screen.getAllByText('2').length).toBeGreaterThan(0) // allocated
      expect(screen.getByText('gpuOverview.totalGPUs')).toBeTruthy()
    })

    it('calls drillToResources when total tile clicked', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      fireEvent.click(screen.getByText('gpuOverview.totalGPUs').closest('div')!)
      expect(mockDrillToResources).toHaveBeenCalled()
    })
  })

  describe('GPU types list', () => {
    it('renders GPU type rows', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      expect(screen.getByText('NVIDIA A100')).toBeTruthy()
    })
  })

  describe('GPU type filter dropdown', () => {
    it('renders dropdown when multiple GPU types present', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [
          makeNode({ gpuType: 'NVIDIA A100' }),
          makeNode({ name: 'n2', gpuType: 'NVIDIA H100' }),
        ],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      expect(screen.getByRole('combobox')).toBeTruthy()
    })
  })

  describe('Cluster health indicator', () => {
    it('renders healthy cluster count', async () => {
      const { useCachedGPUNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedGPUNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<GPUOverview />)
      expect(screen.getByText(/gpuOverview.healthyCount/)).toBeTruthy()
    })
  })
})