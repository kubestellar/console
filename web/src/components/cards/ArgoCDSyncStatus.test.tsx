import React from 'react'
/**
 * Unit tests for ArgoCDSyncStatus card component.
 *
 * Covers: loading skeleton, empty state, donut chart rendering,
 * sync-status legend counts, cluster filter integration, and
 * demo data notice.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseArgoCDSyncStatus = vi.fn()
vi.mock('../../hooks/useArgoCD', () => ({
  useArgoCDSyncStatus: () => mockUseArgoCDSyncStatus(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockUseChartFilters = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useChartFilters: () => mockUseChartFilters(),
  commonComparators: { string: () => () => 0 },
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultChartFilters = {
  localClusterFilter: [] as string[],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  availableClusters: [] as Array<{ name: string }>,
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
}

const defaultSyncData = {
  stats: { synced: 0, outOfSync: 0, unknown: 0 },
  total: 0,
  syncedPercent: 0,
  outOfSyncPercent: 0,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  consecutiveFailures: 0,
  isDemoData: false,
}

function setupMocks(opts: {
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  total?: number
  stats?: { synced: number; outOfSync: number; unknown: number }
  syncedPercent?: number
  outOfSyncPercent?: number
  isDemoData?: boolean
} = {}) {
  const total = opts.total ?? 0
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockUseChartFilters.mockReturnValue(defaultChartFilters)
  mockUseArgoCDSyncStatus.mockReturnValue({
    ...defaultSyncData,
    isLoading: opts.isLoading ?? false,
    isDemoData: opts.isDemoData ?? false,
    total,
    stats: opts.stats ?? defaultSyncData.stats,
    syncedPercent: opts.syncedPercent ?? 0,
    outOfSyncPercent: opts.outOfSyncPercent ?? 0,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArgoCDSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3)
    })

    it('passes isLoading and hasAnyData correctly to useCardLoadingState', async () => {
      setupMocks({ isLoading: true, total: 0 })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true, hasAnyData: false }),
      )
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('noData')).toBeInTheDocument()
      expect(screen.getByText('connectArgoCD')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders total app count in the donut center', async () => {
      setupMocks({ total: 15, stats: { synced: 12, outOfSync: 2, unknown: 1 }, syncedPercent: 80 })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('15')).toBeInTheDocument()
    })

    it('renders synced and outOfSync counts in legend', async () => {
      setupMocks({ total: 10, stats: { synced: 8, outOfSync: 2, unknown: 1 }, syncedPercent: 80 })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('renders cluster filter component', async () => {
      setupMocks({ total: 5, stats: { synced: 5, outOfSync: 0, unknown: 0 } })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
    })

    it('renders external link to ArgoCD docs', async () => {
      setupMocks({ total: 3, stats: { synced: 3, outOfSync: 0, unknown: 0 } })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', 'https://argo-cd.readthedocs.io/')
    })
  })

  describe('demo data integration notice', () => {
    it('shows integration notice when isDemoData is true and total is 0', async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false })
      mockUseChartFilters.mockReturnValue(defaultChartFilters)
      mockUseArgoCDSyncStatus.mockReturnValue({
        ...defaultSyncData,
        isDemoData: true,
        total: 0,
      })
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('argocdIntegration')).toBeInTheDocument()
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for live data state', async () => {
      setupMocks({ total: 12, stats: { synced: 10, outOfSync: 2, unknown: 0 }, syncedPercent: 83 })
      const { ArgoCDSyncStatus } = await import('./ArgoCDSyncStatus')
      const { container } = render(<ArgoCDSyncStatus />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
