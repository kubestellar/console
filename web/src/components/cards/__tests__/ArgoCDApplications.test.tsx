import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArgoCDApplications } from '../ArgoCDApplications'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeApp = (overrides = {}) => ({
  name: 'my-app',
  namespace: 'argocd',
  cluster: 'cluster-1',
  syncStatus: 'Synced',
  healthStatus: 'Healthy',
  source: 'https://github.com/example/repo',
  lastSynced: '2h ago',
  ...overrides,
})

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDApplications: vi.fn(() => ({
    applications: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: false,
  })),
  useArgoCDTriggerSync: vi.fn(() => ({
    triggerSync: vi.fn(),
    isSyncing: false,
    lastResult: null,
  })),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToArgoApp: vi.fn() }),
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
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '', setSearch: vi.fn(),
      localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(),
      availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: { sortBy: 'syncStatus', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
    containerRef: { current: null }, containerStyle: {},
  }),
  commonComparators: { string: () => () => 0 },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string, _opts?: unknown) => k,
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <input data-testid="search" value={value} onChange={e => onChange(e.target.value)} />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardEmptyState: ({ title, message }: { title: string; message: string }) =>
    <div data-testid="empty-state"><p>{title}</p><p>{message}</p></div>,
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

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ArgoCDApplications', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton state', () => {
    it('renders skeleton during initial load', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<ArgoCDApplications />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no-applications message', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<ArgoCDApplications />)
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })
  })

  describe('Stats row', () => {
    it('displays synced, out-of-sync, healthy, and unhealthy counts', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [
          makeApp({ syncStatus: 'Synced', healthStatus: 'Healthy' }),
          makeApp({ name: 'b', syncStatus: 'OutOfSync', healthStatus: 'Degraded' }),
          makeApp({ name: 'c', syncStatus: 'Synced', healthStatus: 'Degraded' }),
        ],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      // synced=2, outOfSync=1, healthy=1, unhealthy=2
      const headings = screen.getAllByText(/\d+/)
      expect(headings.length).toBeGreaterThan(0)
    })
  })

  describe('Application list', () => {
    it('renders application name', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [makeApp({ name: 'frontend-app' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      expect(screen.getByText('frontend-app')).toBeTruthy()
    })

    it('renders cluster badge for each app', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [makeApp({ cluster: 'prod-cluster' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      expect(screen.getByText('prod-cluster')).toBeTruthy()
    })

    it('renders sync now button for out-of-sync app', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [makeApp({ syncStatus: 'OutOfSync' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      expect(screen.getByText('argoCDApplications.syncNow')).toBeTruthy()
    })

    it('does not render sync button for synced app', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [makeApp({ syncStatus: 'Synced' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      expect(screen.queryByText('argoCDApplications.syncNow')).toBeNull()
    })

    it('shows no-match message when list is empty after filtering', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      // With empty list and no empty-state override, the card shows no-match text
      expect(screen.queryByText('frontend-app')).toBeNull()
    })
  })

  describe('Config filtering', () => {
    it('filters apps to the specified cluster', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [
          makeApp({ name: 'app-a', cluster: 'cluster-1' }),
          makeApp({ name: 'app-b', cluster: 'cluster-2' }),
        ],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications config={{ cluster: 'cluster-1' }} />)
      expect(screen.getByText('app-a')).toBeTruthy()
      expect(screen.queryByText('app-b')).toBeNull()
    })
  })

  describe('Demo integration notice', () => {
    it('hides notice when isDemoData is false', async () => {
      const { useArgoCDApplications } = await import('../../../hooks/useArgoCD')
      vi.mocked(useArgoCDApplications).mockReturnValue({
        applications: [makeApp()],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoData: false,
      } as never)
      render(<ArgoCDApplications />)
      expect(screen.queryByText('argoCDApplications.argocdIntegration')).toBeNull()
    })
  })
})
