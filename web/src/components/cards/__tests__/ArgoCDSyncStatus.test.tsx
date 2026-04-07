import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArgoCDSyncStatus } from '../ArgoCDSyncStatus'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDSyncStatus: vi.fn((_filter?: string[]) => ({
    stats: { synced: 0, outOfSync: 0, unknown: 0 },
    total: 0,
    syncedPercent: 0,
    outOfSyncPercent: 0,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
  })),
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
  useChartFilters: () => ({
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [],
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ArgoCDSyncStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no data message', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('argoCDSyncStatus.noData')).toBeTruthy()
    })
  })

  describe('Stats legend', () => {
    it('renders synced, out-of-sync, unknown rows', async () => {
      const { useArgoCDSyncStatus } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDSyncStatus).mockReturnValue({
        stats: { synced: 8, outOfSync: 2, unknown: 0 },
        total: 10,
        syncedPercent: 80,
        outOfSyncPercent: 20,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('argoCDSyncStatus.synced')).toBeTruthy()
      expect(screen.getByText('argoCDSyncStatus.outOfSync')).toBeTruthy()
      expect(screen.getByText('argoCDSyncStatus.unknown')).toBeTruthy()
    })

    it('shows correct counts', async () => {
      const { useArgoCDSyncStatus } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDSyncStatus).mockReturnValue({
        stats: { synced: 6, outOfSync: 3, unknown: 1 },
        total: 10,
        syncedPercent: 60,
        outOfSyncPercent: 30,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('6')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
      expect(screen.getByText('1')).toBeTruthy()
    })
  })

  describe('Donut chart', () => {
    it('renders total apps in centre of donut', async () => {
      const { useArgoCDSyncStatus } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDSyncStatus).mockReturnValue({
        stats: { synced: 10, outOfSync: 0, unknown: 0 },
        total: 10,
        syncedPercent: 100,
        outOfSyncPercent: 0,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getAllByText('10').length).toBeGreaterThan(0)
      expect(screen.getByText('argoCDSyncStatus.apps')).toBeTruthy()
    })
  })

  describe('Demo notice', () => {
    it('shows integration notice when isDemoData', async () => {
      const { useArgoCDSyncStatus } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDSyncStatus).mockReturnValue({
        stats: { synced: 1, outOfSync: 0, unknown: 0 },
        total: 1,
        syncedPercent: 100,
        outOfSyncPercent: 0,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: true,
      } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getByText('argoCDSyncStatus.argocdIntegration')).toBeTruthy()
    })
  })

  describe('Cluster filter', () => {
    it('renders cluster filter dropdown', async () => {
      const { useArgoCDSyncStatus } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDSyncStatus).mockReturnValue({
        stats: { synced: 1, outOfSync: 0, unknown: 0 },
        total: 1,
        syncedPercent: 100,
        outOfSyncPercent: 0,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: false,
      } as never)
      render(<ArgoCDSyncStatus />)
      expect(screen.getByTestId('cluster-filter')).toBeTruthy()
    })
  })
})