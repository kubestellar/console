import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module that transitively imports them
// ---------------------------------------------------------------------------

const mockUseArgoCDSyncStatus = vi.fn()
vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDSyncStatus: (...args: unknown[]) => mockUseArgoCDSyncStatus(...args),
}))

const mockUseCardLoadingState = vi.fn()
const mockUseReportCardDataState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useReportCardDataState: (state: unknown) => mockUseReportCardDataState(state),
  CardDataReportContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, setDemoMode: vi.fn() }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useChartFilters: () => ({
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: ['cluster-a', 'cluster-b'],
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

// ---------------------------------------------------------------------------
// Import the component under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { ArgoCDSyncStatus } from '../ArgoCDSyncStatus'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default hook return for live data scenario */
function liveDataDefaults() {
  return {
    stats: { synced: 18, outOfSync: 4, unknown: 1 },
    total: 23,
    syncedPercent: (18 / 23) * 100,
    outOfSyncPercent: (4 / 23) * 100,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
    error: null,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
  }
}

/** Default hook return for demo data scenario */
function demoDataDefaults() {
  return {
    stats: { synced: 8, outOfSync: 2, unknown: 1 },
    total: 11,
    syncedPercent: (8 / 11) * 100,
    outOfSyncPercent: (2 / 11) * 100,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: true,
    error: null,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArgoCDSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: useCardLoadingState returns "show content"
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
  })

  // -------------------------------------------------------------------------
  // Loading / skeleton state
  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeletons when showSkeleton is true and no data exists', () => {
      mockUseArgoCDSyncStatus.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: true,
        total: 0,
        stats: { synced: 0, outOfSync: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
        hasData: false,
        isRefreshing: false,
      })

      const { container } = render(<ArgoCDSyncStatus />)
      // Should render Skeleton placeholders, not the real content
      expect(container.querySelector('.content-loaded')).toBeNull()
      // No donut chart or stats text visible
      expect(screen.queryByText('argoCDSyncStatus.synced')).toBeNull()
    })

    it('passes correct isLoading/hasAnyData to useCardLoadingState', () => {
      mockUseArgoCDSyncStatus.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: true,
        total: 0,
        stats: { synced: 0, outOfSync: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
        hasData: false,
        isRefreshing: false,
      })

      render(<ArgoCDSyncStatus />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('renders empty state when showEmptyState is true', () => {
      mockUseArgoCDSyncStatus.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: false,
        total: 0,
        stats: { synced: 0, outOfSync: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: true,
        hasData: false,
        isRefreshing: false,
      })

      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('argoCDSyncStatus.noData')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.connectArgoCD')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Live data rendering
  // -------------------------------------------------------------------------
  describe('live data', () => {
    it('renders donut chart, total, and stat rows with live data', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(liveDataDefaults())

      render(<ArgoCDSyncStatus />)

      // Total apps count in the donut center
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.apps')).toBeInTheDocument()

      // Stat rows
      expect(screen.getByText('18')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.synced')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.outOfSync')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.unknown')).toBeInTheDocument()
    })

    it('reports isDemoData as false for live data', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(liveDataDefaults())

      render(<ArgoCDSyncStatus />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: false,
        })
      )
    })

    it.skip('renders the integration notice banner', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(liveDataDefaults())

      render(<ArgoCDSyncStatus />)

      expect(screen.getByText('argoCDSyncStatus.argocdIntegration')).toBeInTheDocument()
      expect(screen.getByText('argoCDSyncStatus.installArgoCD')).toBeInTheDocument()
    })

    it('renders the ArgoCD documentation link', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(liveDataDefaults())

      render(<ArgoCDSyncStatus />)

      const link = screen.getByTitle('argoCDSyncStatus.argocdDocumentation')
      expect(link).toHaveAttribute('href', 'https://argo-cd.readthedocs.io/')
      expect(link).toHaveAttribute('target', '_blank')
    })
  })

  // -------------------------------------------------------------------------
  // Demo data rendering
  // -------------------------------------------------------------------------
  describe('demo data', () => {
    it('renders the donut chart and stats even when isDemoData is true', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(demoDataDefaults())

      render(<ArgoCDSyncStatus />)

      // The card should render demo data values
      expect(screen.getByText('11')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('reports isDemoData as true so CardWrapper shows demo badge', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(demoDataDefaults())

      render(<ArgoCDSyncStatus />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: true,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Failure / consecutive failures
  // -------------------------------------------------------------------------
  describe('failure states', () => {
    it('passes isFailed and consecutiveFailures to useCardLoadingState', () => {
      mockUseArgoCDSyncStatus.mockReturnValue({
        ...liveDataDefaults(),
        isFailed: true,
        consecutiveFailures: 4,
      })

      render(<ArgoCDSyncStatus />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 4,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Cluster filter UI
  // -------------------------------------------------------------------------
  describe('cluster filter', () => {
    it('renders the cluster filter component', () => {
      mockUseArgoCDSyncStatus.mockReturnValue(liveDataDefaults())

      render(<ArgoCDSyncStatus />)

      expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // SVG donut chart correctness
  // -------------------------------------------------------------------------
  describe('donut chart', () => {
    it('computes correct strokeDasharray for synced and outOfSync segments', () => {
      const data = liveDataDefaults()
      mockUseArgoCDSyncStatus.mockReturnValue(data)

      const { container } = render(<ArgoCDSyncStatus />)

      // Select only the SVG donut circles (r="48") to avoid lucide icon circles
      const circles = container.querySelectorAll('svg circle[r="48"]')
      expect(circles.length).toBe(3)

      const syncedCircle = circles[1]
      const expectedSyncedDash = `${data.syncedPercent * 3.02} 302`
      expect(syncedCircle.getAttribute('stroke-dasharray')).toBe(expectedSyncedDash)

      const outOfSyncCircle = circles[2]
      const expectedOutOfSyncDash = `${data.outOfSyncPercent * 3.02} 302`
      expect(outOfSyncCircle.getAttribute('stroke-dasharray')).toBe(expectedOutOfSyncDash)
    })
  })
})
