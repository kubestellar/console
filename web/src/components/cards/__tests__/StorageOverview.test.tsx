import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StorageOverview } from '../StorageOverview'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDrillToPVC = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1', storageGB: 100, nodeCount: 3, reachable: true }],
    isLoading: false,
    isRefreshing: false,
  }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPVCs: vi.fn(() => ({
    pvcs: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPVC: mockDrillToPVC }),
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${k}:${opts.count}`
      return k
    },
  }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useChartFilters: () => ({
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [{ name: 'cluster-1' }],
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

vi.mock('../../../lib/formatStats', () => ({
  formatStat: (n: number) => String(n),
  formatStorageStat: (n: number, real?: boolean) => (real ? `${n}GB` : 'N/A'),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StorageOverview', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton / empty states', () => {
    it('renders loading spinner when showSkeleton', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<StorageOverview />)
      expect(screen.getByText('storageOverview.loading')).toBeTruthy()
    })

    it('renders no data message when showEmptyState', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<StorageOverview />)
      expect(screen.getByText('storageOverview.noData')).toBeTruthy()
    })
  })

  describe('Main stats', () => {
    it('renders total capacity and PVCs tiles', () => {
      render(<StorageOverview />)
      expect(screen.getByText('storageOverview.totalCapacity')).toBeTruthy()
      expect(screen.getByText('storageOverview.pvcs')).toBeTruthy()
    })

    it('renders bound, pending, failed PVC breakdown', () => {
      render(<StorageOverview />)
      expect(screen.getByText('storageOverview.bound')).toBeTruthy()
      expect(screen.getByText('common:common.pending')).toBeTruthy()
      expect(screen.getByText('common:common.failed')).toBeTruthy()
    })
  })

  describe('PVC counts', () => {
    it('counts bound/pending/failed PVCs correctly', async () => {
      const { useCachedPVCs } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPVCs).mockReturnValue({
        pvcs: [
          { cluster: 'cluster-1', namespace: 'default', name: 'pvc-1', status: 'Bound', storageClass: 'gp2' },
          { cluster: 'cluster-1', namespace: 'default', name: 'pvc-2', status: 'Pending', storageClass: 'gp2' },
          { cluster: 'cluster-1', namespace: 'default', name: 'pvc-3', status: 'Lost', storageClass: 'gp2' },
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      render(<StorageOverview />)
      // bound=1, pending=1, failed=1 — all rendered as "1"
      const ones = screen.getAllByText('1')
      expect(ones.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Storage classes', () => {
    it('renders storage class list when PVCs have classes', async () => {
      const { useCachedPVCs } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPVCs).mockReturnValue({
        pvcs: [
          { cluster: 'cluster-1', namespace: 'default', name: 'p1', status: 'Bound', storageClass: 'gp2' },
          { cluster: 'cluster-1', namespace: 'default', name: 'p2', status: 'Bound', storageClass: 'standard' },
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      render(<StorageOverview />)
      expect(screen.getByText('storageOverview.storageClasses')).toBeTruthy()
      expect(screen.getByText('gp2')).toBeTruthy()
      expect(screen.getByText('standard')).toBeTruthy()
    })
  })

  describe('Drill-down', () => {
    it('calls drillToPVC when bound PVC tile clicked', async () => {
      const { useCachedPVCs } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPVCs).mockReturnValue({
        pvcs: [{ cluster: 'cluster-1', namespace: 'default', name: 'pvc-1', status: 'Bound', storageClass: 'gp2' }],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      render(<StorageOverview />)
      fireEvent.click(screen.getByText('storageOverview.bound').closest('div')!)
      expect(mockDrillToPVC).toHaveBeenCalledWith('cluster-1', 'default', 'pvc-1')
    })
  })

  describe('Cluster filter', () => {
    it('renders cluster filter dropdown', () => {
      render(<StorageOverview />)
      expect(screen.getByTestId('cluster-filter')).toBeTruthy()
    })
  })

  describe('Footer', () => {
    it('renders footer with PVC and cluster count', () => {
      render(<StorageOverview />)
      expect(screen.getByText(/storageOverview.footer/)).toBeTruthy()
    })
  })
})