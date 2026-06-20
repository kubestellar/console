import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StorageOverview } from '../StorageOverview'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count}`
      if (opts && 'pvcs' in opts && 'clusters' in opts) return `${opts.pvcs} PVCs, ${opts.clusters} clusters`
      if (opts && 'error' in opts) return `Failed: ${opts.error}`
      return key
    },
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedPVCs = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPVCs: () => mockUseCachedPVCs(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

const mockUseChartFilters = vi.fn()
vi.mock('../../../lib/cards/cardHooks', () => ({
  useChartFilters: () => mockUseChartFilters(),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: ({ availableClusters }: { availableClusters: Array<{ name: string }> }) => (
    <div data-testid="cluster-filter" data-count={availableClusters.length} />
  ),
}))

vi.mock('../../../lib/formatStats', () => ({
  formatStat: (value: number) => String(value),
  formatStorageStat: (value: number, hasRealData?: boolean) => (hasRealData === false ? 'N/A' : `${value}GB`),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ width, height }: { width?: number; height?: number }) => (
    <div data-testid="skeleton" style={{ width, height }} />
  ),
  SkeletonStats: ({ className }: { className?: string }) => (
    <div data-testid="skeleton-stats" className={className} />
  ),
  SkeletonList: ({ items, className }: { items?: number; className?: string }) => (
    <div data-testid="skeleton-list" data-items={items} className={className} />
  ),
}))

type MockPVC = {
  status: string
  cluster: string
  namespace: string
  name: string
  storageClass: string
}

const makePVC = (
  status: string,
  cluster = 'cluster-1',
  storageClass = 'standard',
  name = `pvc-${status.toLowerCase()}`
): MockPVC => ({
  status,
  cluster,
  namespace: 'default',
  name,
  storageClass,
})

const defaultClustersReturn = {
  deduplicatedClusters: [{ name: 'cluster-1', storageGB: 100, nodeCount: 3, reachable: true }],
  isLoading: false,
  isRefreshing: false,
}

const defaultPVCsReturn = {
  pvcs: [makePVC('Bound'), makePVC('Pending'), makePVC('Lost')],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  error: null,
}

const defaultGlobalFilters = {
  selectedClusters: [],
  isAllClustersSelected: true,
}

const defaultChartFilters = {
  localClusterFilter: [],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  availableClusters: [{ name: 'cluster-1' }],
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
}

function setup(): void {
  mockUseClusters.mockReturnValue(defaultClustersReturn)
  mockUseCachedPVCs.mockReturnValue(defaultPVCsReturn)
  mockUseGlobalFilters.mockReturnValue(defaultGlobalFilters)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockUseChartFilters.mockReturnValue(defaultChartFilters)
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('StorageOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  describe('Skeleton / empty states', () => {
    it('renders loading spinner when showSkeleton', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })

      render(<StorageOverview />)

      expect(screen.getByText('storageOverview.loading')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton-stats')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument()
    })

    it('renders no data message when showEmptyState', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
      mockUseCachedPVCs.mockReturnValue({ ...defaultPVCsReturn, pvcs: [] })

      render(<StorageOverview />)

      expect(screen.getByText('storageOverview.noData')).toBeInTheDocument()
    })
  })

  describe('Main stats', () => {
    it('renders total capacity and PVCs tiles', () => {
      render(<StorageOverview />)

      expect(screen.getByText('storageOverview.totalCapacity')).toBeInTheDocument()
      expect(screen.getByText('storageOverview.pvcs')).toBeInTheDocument()
      expect(screen.getByText('100GB')).toBeInTheDocument()
      expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    })

    it('renders bound, pending, failed PVC breakdown', () => {
      render(<StorageOverview />)

      expect(screen.getByText('storageOverview.bound')).toBeInTheDocument()
      expect(screen.getByText('common:common.pending')).toBeInTheDocument()
      expect(screen.getByText('common:common.failed')).toBeInTheDocument()
    })
  })

  describe('PVC counts', () => {
    it('counts bound/pending/failed PVCs correctly', () => {
      mockUseCachedPVCs.mockReturnValue({
        ...defaultPVCsReturn,
        pvcs: [
          makePVC('Bound', 'cluster-1', 'gp2', 'pvc-1'),
          makePVC('Pending', 'cluster-1', 'gp2', 'pvc-2'),
          makePVC('Lost', 'cluster-1', 'gp2', 'pvc-3'),
        ],
      })

      render(<StorageOverview />)

      const ones = screen.getAllByText('1')
      expect(ones.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('PVC tiles', () => {
    it('PVC status tiles are not clickable (no drilldown view)', () => {
      render(<StorageOverview />)

      const boundLabel = screen.getByText('storageOverview.bound')
      const tile = boundLabel.closest('[class*="border"]')
      expect(tile).not.toBeNull()
      expect(tile?.className).toContain('cursor-default')
      expect(tile?.className).not.toContain('cursor-pointer')
    })
  })

  describe('Storage classes', () => {
    it('renders storage class list when PVCs have classes', () => {
      mockUseCachedPVCs.mockReturnValue({
        ...defaultPVCsReturn,
        pvcs: [
          makePVC('Bound', 'cluster-1', 'gp2', 'p1'),
          makePVC('Bound', 'cluster-1', 'standard', 'p2'),
        ],
      })

      render(<StorageOverview />)

      expect(screen.getByText('storageOverview.storageClasses')).toBeInTheDocument()
      expect(screen.getByText('gp2')).toBeInTheDocument()
      expect(screen.getByText('standard')).toBeInTheDocument()
    })
  })

  describe('Cluster filter', () => {
    it('renders cluster filter dropdown', () => {
      render(<StorageOverview />)

      expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
    })
  })

  describe('Footer', () => {
    it('renders footer with PVC and cluster count', () => {
      render(<StorageOverview />)

      expect(screen.getByText(/PVCs, 1 clusters/)).toBeInTheDocument()
    })
  })
})
