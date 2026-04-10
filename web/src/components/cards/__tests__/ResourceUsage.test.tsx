import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceUsage } from '../ResourceUsage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => opts ? `${k}:${JSON.stringify(opts)}` : k }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  getDemoMode: () => true, default: () => true,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedGPUNodes = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockUseCachedGPUNodes(),
}))

const mockDrillToResources = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToResources: mockDrillToResources }),
}))

const mockUseChartFilters = vi.fn()
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useChartFilters: (...args: unknown[]) => mockUseChartFilters(...args),
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />,
}))

vi.mock('../../charts', () => ({
  Gauge: ({ value, max }: { value: number; max: number }) => (
    <div data-testid="gauge" data-value={value} data-max={max}>{value}%</div>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ClusterStub = {
  name: string
  cpuCores?: number
  memoryGB?: number
  cpuRequestsCores?: number
  memoryRequestsGB?: number
  // Actual metrics-server usage (#6105)
  cpuUsageCores?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
}

type GPUNodeStub = {
  cluster: string
  gpuCount: number
  gpuAllocated: number
  acceleratorType?: string
}

function makeChartFiltersReturn(clusters: ClusterStub[] = []) {
  return {
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: clusters.map((c) => c.name),
    filteredClusters: clusters,
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  }
}

function setupDefaults({
  clusters = [] as ClusterStub[],
  gpuNodes = [] as GPUNodeStub[],
  clustersLoading = false,
  clustersRefreshing = false,
  isDemoFallback = false,
  gpuRefreshing = false,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseClusters.mockReturnValue({ isLoading: clustersLoading, isRefreshing: clustersRefreshing })
  mockUseCachedGPUNodes.mockReturnValue({ nodes: gpuNodes, isDemoFallback, isRefreshing: gpuRefreshing })
  mockUseChartFilters.mockReturnValue(makeChartFiltersReturn(clusters))
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResourceUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeleton when showSkeleton=true', () => {
      setupDefaults({ showSkeleton: true })
      render(<ResourceUsage />)
      expect(screen.getAllByTestId('skeleton-circular').length).toBeGreaterThan(0)
    })

    it('does not render gauges while loading', () => {
      setupDefaults({ showSkeleton: true })
      render(<ResourceUsage />)
      expect(screen.queryByTestId('gauge')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state message when showEmptyState=true', () => {
      setupDefaults({ showEmptyState: true })
      render(<ResourceUsage />)
      expect(screen.getByText('resourceUsage.noClusters')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('CPU and memory gauges', () => {
    it('renders CPU gauge', () => {
      setupDefaults({
        clusters: [{ name: 'c1', cpuCores: 16, cpuRequestsCores: 8 }],
      })
      render(<ResourceUsage />)
      const gauges = screen.getAllByTestId('gauge')
      expect(gauges.length).toBeGreaterThanOrEqual(2)
    })

    it('shows correct CPU percent', () => {
      setupDefaults({
        clusters: [{ name: 'c1', cpuCores: 10, cpuRequestsCores: 5 }],
      })
      render(<ResourceUsage />)
      // 5/10 = 50%
      expect(screen.getAllByTestId('gauge')[0]).toHaveAttribute('data-value', '50')
    })

    it('shows 0% CPU when no total cores', () => {
      setupDefaults({ clusters: [{ name: 'c1', cpuCores: 0, cpuRequestsCores: 0 }] })
      render(<ResourceUsage />)
      expect(screen.getAllByTestId('gauge')[0]).toHaveAttribute('data-value', '0')
    })

    it('shows correct memory percent', () => {
      setupDefaults({
        clusters: [{ name: 'c1', memoryGB: 100, memoryRequestsGB: 75 }],
      })
      render(<ResourceUsage />)
      expect(screen.getAllByTestId('gauge')[1]).toHaveAttribute('data-value', '75')
    })

    it('shows 0% memory when no total memory', () => {
      setupDefaults({ clusters: [{ name: 'c1', memoryGB: 0, memoryRequestsGB: 0 }] })
      render(<ResourceUsage />)
      expect(screen.getAllByTestId('gauge')[1]).toHaveAttribute('data-value', '0')
    })

    it('prefers actual metrics-server usage over requests when available (#6105)', () => {
      // Requests say 8 cores / 80GB, but metrics-server says actual usage is
      // 2 cores / 20GB. The card is labeled "Resource Usage" so it must
      // display the actual usage, not the allocation.
      setupDefaults({
        clusters: [{
          name: 'c1',
          cpuCores: 10,
          memoryGB: 100,
          cpuRequestsCores: 8,
          memoryRequestsGB: 80,
          cpuUsageCores: 2,
          memoryUsageGB: 20,
          metricsAvailable: true }],
      })
      render(<ResourceUsage />)
      const gauges = screen.getAllByTestId('gauge')
      // 2 / 10 = 20%
      expect(gauges[0]).toHaveAttribute('data-value', '20')
      // 20 / 100 = 20%
      expect(gauges[1]).toHaveAttribute('data-value', '20')
    })

    it('falls back to requests when metrics-server data is unavailable (#6105)', () => {
      setupDefaults({
        clusters: [{
          name: 'c1',
          cpuCores: 10,
          memoryGB: 100,
          cpuRequestsCores: 5,
          memoryRequestsGB: 50,
          // metricsAvailable omitted — simulating metrics-server not installed
          cpuUsageCores: undefined,
          memoryUsageGB: undefined }],
      })
      render(<ResourceUsage />)
      const gauges = screen.getAllByTestId('gauge')
      expect(gauges[0]).toHaveAttribute('data-value', '50')
      expect(gauges[1]).toHaveAttribute('data-value', '50')
    })
  })

  // -------------------------------------------------------------------------
  describe('footer totals', () => {
    it('shows total CPU cores', () => {
      setupDefaults({
        clusters: [
          { name: 'c1', cpuCores: 8 },
          { name: 'c2', cpuCores: 4 },
        ],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('12 resourceUsage.cores')).toBeInTheDocument()
    })

    it('shows total RAM in GB', () => {
      setupDefaults({
        clusters: [{ name: 'c1', memoryGB: 128 }],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('128 GB')).toBeInTheDocument()
    })

    it('accumulates cores across multiple clusters', () => {
      setupDefaults({
        clusters: [
          { name: 'c1', cpuCores: 16, memoryGB: 64 },
          { name: 'c2', cpuCores: 8, memoryGB: 32 },
        ],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('24 resourceUsage.cores')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('GPU accelerators', () => {
    it('shows GPU gauge when GPU nodes exist', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1', gpuCount: 4, gpuAllocated: 2 }],
      })
      render(<ResourceUsage />)
      const gauges = screen.getAllByTestId('gauge')
      expect(gauges.length).toBe(3) // CPU + Memory + GPU
    })

    it('shows correct GPU percent', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1', gpuCount: 8, gpuAllocated: 4 }],
      })
      render(<ResourceUsage />)
      const gpuGauge = screen.getAllByTestId('gauge')[2]
      expect(gpuGauge).toHaveAttribute('data-value', '50')
    })

    it('shows TPU gauge for TPU accelerator nodes', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'TPU' }],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('TPU')).toBeInTheDocument()
    })

    it('shows AIU gauge for AIU accelerator nodes', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'AIU' }],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('AIU')).toBeInTheDocument()
    })

    it('shows XPU gauge for XPU accelerator nodes', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'XPU' }],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('XPU')).toBeInTheDocument()
    })

    it('does NOT show GPU gauge when no GPU nodes', () => {
      setupDefaults({ clusters: [{ name: 'c1' }], gpuNodes: [] })
      render(<ResourceUsage />)
      expect(screen.getAllByTestId('gauge')).toHaveLength(2) // CPU + Memory only
    })

    it('filters GPU nodes to match selected clusters only', () => {
      // c2 nodes should be excluded when clusters only contains c1
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [
          { cluster: 'c1', gpuCount: 4, gpuAllocated: 2 },
          { cluster: 'c2', gpuCount: 8, gpuAllocated: 8 },
        ],
      })
      render(<ResourceUsage />)
      // GPU gauge should show 2/4 = 50%, not include c2's 8/8
      const gpuGauge = screen.getAllByTestId('gauge')[2]
      expect(gpuGauge).toHaveAttribute('data-value', '50')
    })

    it('handles cluster names with slash prefix (cluster/node)', () => {
      setupDefaults({
        clusters: [{ name: 'c1' }],
        gpuNodes: [{ cluster: 'c1/node-1', gpuCount: 2, gpuAllocated: 1 }],
      })
      render(<ResourceUsage />)
      // GPU gauge should appear — cluster prefix matches
      expect(screen.getAllByTestId('gauge')).toHaveLength(3)
    })
  })

  // -------------------------------------------------------------------------
  describe('drill-down', () => {
    it('calls drillToResources when gauge area is clicked', async () => {
      setupDefaults({ clusters: [{ name: 'c1', cpuCores: 4 }] })
      render(<ResourceUsage />)
      // The wrapper div is clickable
      const clickTarget = screen.getAllByTestId('gauge')[0].closest('div[class*="cursor-pointer"]')!
      await userEvent.click(clickTarget)
      expect(mockDrillToResources).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  describe('cluster count display', () => {
    it('shows cluster count label when no filter active', () => {
      setupDefaults({ clusters: [{ name: 'c1' }, { name: 'c2' }] })
      render(<ResourceUsage />)
      // t('common:common.nClusters', { count: 2 })
      expect(screen.getByText(/nClusters/)).toBeInTheDocument()
    })

    it('shows selected/total count badge when cluster filter active', () => {
      setupDefaults({ clusters: [{ name: 'c1' }] })
      mockUseChartFilters.mockReturnValue({
        ...makeChartFiltersReturn([{ name: 'c1' }]),
        localClusterFilter: ['c1'],
        availableClusters: ['c1', 'c2'],
      })
      render(<ResourceUsage />)
      expect(screen.getByText('1/2')).toBeInTheDocument()
    })

    it('renders cluster filter component', () => {
      setupDefaults({ clusters: [] })
      render(<ResourceUsage />)
      expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when isDemoMode', () => {
      mockIsDemoMode.mockReturnValue(true)
      setupDefaults()
      render(<ResourceUsage />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true })
      )
    })

    it('passes isDemoData=true when isDemoFallback', () => {
      setupDefaults({ isDemoFallback: true })
      render(<ResourceUsage />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true })
      )
    })

    it('passes isRefreshing combining clusters and GPU refreshing', () => {
      setupDefaults({ clustersRefreshing: true, gpuRefreshing: false })
      render(<ResourceUsage />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true })
      )
    })
  })
})