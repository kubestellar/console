import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelmHistory } from '../HelmHistory'
import type { HelmHistoryEntry } from '../../../hooks/useMCP'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEntry = (overrides: Partial<HelmHistoryEntry> = {}): HelmHistoryEntry => ({
  revision: 1,
  status: 'deployed',
  chart: 'nginx-1.2.3',
  description: 'Install complete',
  updated: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const mockDrillToHelm = vi.fn()
const mockOnClose = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1', aliases: [], reachable: true }],
  }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedHelmReleases: vi.fn(() => ({
    releases: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
  })),
  useCachedHelmHistory: vi.fn(() => ({
    history: [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToHelm: mockDrillToHelm }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: HelmHistoryEntry[], _opts: unknown) => ({
    items,
    totalItems: items.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
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
      sortBy: 'revision',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${k}:${opts.count}`
      if (opts?.revision !== undefined) return `${k}:${opts.revision}`
      if (opts?.shown !== undefined) return `${k}:${String(opts.shown)}`
      return k
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) =>
    <input data-testid="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../deploy/HelmHistoryDetailModal', () => ({
  HelmHistoryDetailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="detail-modal" role="dialog"><button onClick={onClose}>Close</button></div> : null,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HelmHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDrillToHelm.mockReset()
    mockOnClose.mockReset()
  })

  describe('loading skeleton', () => {
    it('renders skeletons during initial load', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<HelmHistory />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('empty state', () => {
    it('shows no-releases hint when empty state is active', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<HelmHistory />)
      expect(screen.getByText('helmHistory.noReleases')).toBeInTheDocument()
      expect(screen.getByText('helmHistory.noReleasesHint')).toBeInTheDocument()
    })
  })

  describe('selector prompt', () => {
    it('shows select-cluster-release prompt when no cluster or release is chosen', () => {
      render(<HelmHistory />)
      expect(screen.getByText('helmHistory.selectClusterRelease')).toBeInTheDocument()
    })

    it('renders cluster and release dropdowns', () => {
      render(<HelmHistory />)
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })

    it('populates cluster dropdown from useClusters', () => {
      render(<HelmHistory />)
      expect(screen.getByText('cluster-1')).toBeInTheDocument()
    })
  })

  describe('history list', () => {
    beforeEach(async () => {
      const { useCachedHelmReleases, useCachedHelmHistory } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [{ cluster: 'cluster-1', name: 'nginx', namespace: 'default', chart: 'nginx-1.2.3', app_version: '1.0', status: 'deployed', updated: '2026-01-01T00:00:00Z', revision: '3' }],
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoFallback: false,
      } as never)
      vi.mocked(useCachedHelmHistory).mockReturnValue({
        history: [
          makeEntry({ revision: 3, status: 'deployed', chart: 'nginx-1.2.3' }),
          makeEntry({ revision: 2, status: 'superseded', chart: 'nginx-1.1.0' }),
          makeEntry({ revision: 1, status: 'superseded', chart: 'nginx-1.0.0', description: '' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
    })

    it('renders revision entries after cluster+release are pre-set via config', () => {
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)
      expect(screen.getByText('helmHistory.rev:3')).toBeInTheDocument()
      expect(screen.getByText('helmHistory.rev:2')).toBeInTheDocument()
    })

    it('shows the current badge on the deployed revision', () => {
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)
      expect(screen.getByText('helmHistory.current')).toBeInTheDocument()
    })

    it('renders entry description when present', () => {
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)
      expect(screen.getByText('Install complete')).toBeInTheDocument()
    })

    it('renders the revision count badge', () => {
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)
      expect(screen.getByText('helmHistory.nRevisions:3')).toBeInTheDocument()
    })

    it('opens the detail modal when a revision row is clicked', async () => {
      const user = userEvent.setup()
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)

      const rows = screen.getAllByTitle(/Click to view details for revision/)
      await user.click(rows[0])

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('drill-down button', () => {
    beforeEach(async () => {
      const { useCachedHelmReleases, useCachedHelmHistory } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [{ cluster: 'cluster-1', name: 'nginx', namespace: 'default', chart: 'nginx-1.2.3', app_version: '1.0', status: 'deployed', updated: '2026-01-01T00:00:00Z', revision: '3' }],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      vi.mocked(useCachedHelmHistory).mockReturnValue({
        history: [makeEntry({ revision: 3, status: 'deployed' })],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0,
      } as never)
    })

    it('calls drillToHelm when the scope badge button is clicked', async () => {
      const user = userEvent.setup()
      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)

      await user.click(screen.getByTitle('Click to view details for nginx'))

      expect(mockDrillToHelm).toHaveBeenCalledWith(
        'cluster-1',
        'default',
        'nginx',
        expect.objectContaining({ currentRevision: 3 }),
      )
    })
  })

  describe('no-history found', () => {
    it('shows the no-history-found message when history is empty after a release is selected', async () => {
      const { useCachedHelmReleases, useCachedHelmHistory } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedHelmReleases).mockReturnValue({
        releases: [{ cluster: 'cluster-1', name: 'nginx', namespace: 'default', chart: 'nginx-1.2.3', app_version: '1.0', status: 'deployed', updated: '2026-01-01T00:00:00Z', revision: '3' }],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      } as never)
      vi.mocked(useCachedHelmHistory).mockReturnValue({
        history: [],
        isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0,
      } as never)

      render(<HelmHistory config={{ cluster: 'cluster-1', release: 'nginx' }} />)

      expect(screen.getByText('helmHistory.noHistoryFound')).toBeInTheDocument()
    })
  })
})
