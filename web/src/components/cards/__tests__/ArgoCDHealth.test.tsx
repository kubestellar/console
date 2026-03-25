import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module that transitively imports them
// ---------------------------------------------------------------------------

const mockUseArgoCDHealth = vi.fn()
vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDHealth: () => mockUseArgoCDHealth(),
}))

const mockUseCardLoadingState = vi.fn()
const mockUseReportCardDataState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useReportCardDataState: (state: unknown) => mockUseReportCardDataState(state),
  CardDataReportContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// ---------------------------------------------------------------------------
// Import the component under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { ArgoCDHealth } from '../ArgoCDHealth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default hook return for live data scenario */
function liveDataDefaults() {
  return {
    stats: { healthy: 15, degraded: 3, progressing: 2, missing: 1, unknown: 1 },
    total: 22,
    healthyPercent: (15 / 22) * 100,
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
    stats: { healthy: 7, degraded: 2, progressing: 1, missing: 0, unknown: 0 },
    total: 10,
    healthyPercent: 70,
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

describe('ArgoCDHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, setDemoMode: vi.fn() })
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
    it('renders skeletons when showSkeleton is true', () => {
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: true,
        total: 0,
        stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
        hasData: false,
        isRefreshing: false,
      })

      const { container } = render(<ArgoCDHealth />)
      expect(container.querySelector('.content-loaded')).toBeNull()
      expect(screen.queryByText('argoCDHealth.healthy')).toBeNull()
    })

    it('passes correct isLoading/hasAnyData to useCardLoadingState', () => {
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: true,
        total: 0,
        stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: true,
        showEmptyState: false,
        hasData: false,
        isRefreshing: false,
      })

      render(<ArgoCDHealth />)
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
    it('renders empty state text when showEmptyState is true', () => {
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        isLoading: false,
        total: 0,
        stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 },
      })
      mockUseCardLoadingState.mockReturnValue({
        showSkeleton: false,
        showEmptyState: true,
        hasData: false,
        isRefreshing: false,
      })

      render(<ArgoCDHealth />)
      expect(screen.getByText('argoCDHealth.noData')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.connectArgoCD')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Live data rendering
  // -------------------------------------------------------------------------
  describe('live data', () => {
    it('renders the health gauge with correct percentage and total', () => {
      const data = liveDataDefaults()
      mockUseArgoCDHealth.mockReturnValue(data)

      render(<ArgoCDHealth />)

      // Healthy percent (rounded)
      expect(screen.getByText(`${data.healthyPercent.toFixed(0)}%`)).toBeInTheDocument()
      // Total apps
      expect(screen.getByText('22')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.totalApps')).toBeInTheDocument()
    })

    it('renders all health breakdown rows with correct counts', () => {
      mockUseArgoCDHealth.mockReturnValue(liveDataDefaults())

      render(<ArgoCDHealth />)

      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()

      // Labels (from the breakdown rows)
      expect(screen.getAllByText('argoCDHealth.healthy').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('argoCDHealth.degraded')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.progressing')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.missing')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.unknown')).toBeInTheDocument()
    })

    it('renders the health bar with correct segment widths', () => {
      const data = liveDataDefaults()
      mockUseArgoCDHealth.mockReturnValue(data)

      const { container } = render(<ArgoCDHealth />)

      const segments = container.querySelectorAll('.bg-green-500, .bg-red-500, .bg-blue-500, .bg-orange-500, .bg-gray-500')
      // The health bar has 5 segments
      expect(segments.length).toBe(5)

      // Verify healthy segment width
      const healthySegment = segments[0] as HTMLElement
      const expectedWidth = `${(data.stats.healthy / data.total) * 100}%`
      expect(healthySegment.style.width).toBe(expectedWidth)
    })

    it('reports isDemoData as false for live data', () => {
      mockUseArgoCDHealth.mockReturnValue(liveDataDefaults())

      render(<ArgoCDHealth />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: false,
        })
      )
    })

    it('renders the integration notice banner', () => {
      mockUseArgoCDHealth.mockReturnValue(liveDataDefaults())

      render(<ArgoCDHealth />)

      expect(screen.getByText('argoCDHealth.argocdIntegration')).toBeInTheDocument()
      expect(screen.getByText('argoCDHealth.installArgoCD')).toBeInTheDocument()
    })

    it('renders the ArgoCD documentation link', () => {
      mockUseArgoCDHealth.mockReturnValue(liveDataDefaults())

      render(<ArgoCDHealth />)

      const link = screen.getByTitle('argoCDHealth.argocdDocumentation')
      expect(link).toHaveAttribute('href', 'https://argo-cd.readthedocs.io/')
      expect(link).toHaveAttribute('target', '_blank')
    })
  })

  // -------------------------------------------------------------------------
  // Demo data rendering
  // -------------------------------------------------------------------------
  describe('demo data', () => {
    it('renders the health gauge and stats even when isDemoData is true', () => {
      mockUseArgoCDHealth.mockReturnValue(demoDataDefaults())

      render(<ArgoCDHealth />)

      expect(screen.getByText('70%')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('reports isDemoData as true so CardWrapper shows demo badge', () => {
      mockUseArgoCDHealth.mockReturnValue(demoDataDefaults())

      render(<ArgoCDHealth />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: true,
        })
      )
    })

    it('reports isDemoData as true when global demo mode is enabled, even if hook returns live data', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true, setDemoMode: vi.fn() })
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        isDemoData: false,
      })

      render(<ArgoCDHealth />)

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
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        isFailed: true,
        consecutiveFailures: 5,
      })

      render(<ArgoCDHealth />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 5,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Progress / missing / unknown rows
  // -------------------------------------------------------------------------
  describe('health breakdown details', () => {
    it('renders progressing, missing, and unknown with correct values', () => {
      mockUseArgoCDHealth.mockReturnValue({
        ...liveDataDefaults(),
        stats: { healthy: 10, degraded: 0, progressing: 5, missing: 3, unknown: 2 },
        total: 20,
        healthyPercent: 50,
      })

      render(<ArgoCDHealth />)

      expect(screen.getByText('5')).toBeInTheDocument()  // progressing
      expect(screen.getByText('3')).toBeInTheDocument()  // missing
      expect(screen.getByText('2')).toBeInTheDocument()  // unknown
    })
  })
})
