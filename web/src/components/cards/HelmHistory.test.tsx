import React from 'react'
/**
 * Unit tests for HelmHistory card component.
 *
 * Covers: loading skeleton, empty state, cluster/release selectors,
 * history timeline rendering, modal behavior, drill-down action,
 * and CardData integration.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HelmHistoryEntry } from '../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count} revisions`
      if (opts && 'revision' in opts) return `Rev ${opts.revision}`
      if (opts && 'shown' in opts) return `Showing ${opts.shown} of ${opts.total}`
      return String(key).split(':').pop()?.split('.').pop() ?? key
    },
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedHelmReleases = vi.fn()
const mockUseCachedHelmHistory = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedHelmReleases: () => mockUseCachedHelmReleases(),
  useCachedHelmHistory: () => mockUseCachedHelmHistory(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockDrillToHelm = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToHelm: mockDrillToHelm }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: { string: () => () => 0 },
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('./deploy/HelmHistoryDetailModal', () => ({
  HelmHistoryDetailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="history-modal">
        <button onClick={onClose}>Close modal</button>
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHistoryEntry(overrides: Partial<HelmHistoryEntry> = {}): HelmHistoryEntry {
  return {
    revision: 1,
    chart: 'prometheus-25.8.0',
    status: 'deployed',
    updated: '2024-01-15T10:00:00Z',
    description: 'Install complete',
    ...overrides,
  }
}

const defaultCardData = {
  items: [] as HelmHistoryEntry[],
  totalItems: 0,
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 5,
  goToPage: vi.fn(),
  needsPagination: false,
  setItemsPerPage: vi.fn(),
  filters: {
    search: '',
    setSearch: vi.fn(),
    localClusterFilter: [] as string[],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [] as Array<{ name: string }>,
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
}

function setupMocks(opts: {
  clusters?: Array<{ name: string; context?: string }>
  releases?: Array<{ name: string; cluster: string; namespace: string; chart: string; status: string; updated: string; revision: number; app_version?: string }>
  history?: HelmHistoryEntry[]
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  isDemoFallback?: boolean
  cardDataItems?: HelmHistoryEntry[]
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: opts.clusters ?? [],
    isLoading: opts.isLoading ?? false,
  })
  mockUseCachedHelmReleases.mockReturnValue({
    releases: opts.releases ?? [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: opts.isDemoFallback ?? false,
  })
  mockUseCachedHelmHistory.mockReturnValue({
    history: opts.history ?? [],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
    hasData: (opts.history?.length ?? 0) > 0,
  })
  const cardItems = opts.cardDataItems ?? opts.history ?? []
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    totalItems: cardItems.length,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HelmHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory />)
      expect(screen.getByText('noReleases')).toBeInTheDocument()
    })
  })

  describe('selector state', () => {
    it('shows prompt to select cluster/release when no selection made', async () => {
      setupMocks({ clusters: [{ name: 'prod' }] })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory />)
      expect(screen.getByText('selectClusterRelease')).toBeInTheDocument()
    })
  })

  describe('history rendering', () => {
    it('renders history timeline entries when cluster and release are preselected', async () => {
      const history = [
        makeHistoryEntry({ revision: 3, status: 'deployed' }),
        makeHistoryEntry({ revision: 2, status: 'superseded' }),
        makeHistoryEntry({ revision: 1, status: 'superseded' }),
      ]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'prometheus', cluster: 'prod', namespace: 'monitoring', chart: 'prometheus-25.8.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 3 }],
        history,
        cardDataItems: history,
      })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory config={{ cluster: 'prod', release: 'prometheus' }} />)
      expect(screen.getByText('Rev 3')).toBeInTheDocument()
      expect(screen.getByText('Rev 2')).toBeInTheDocument()
    })

    it('shows "current" badge on deployed revision', async () => {
      const history = [makeHistoryEntry({ revision: 2, status: 'deployed' })]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 2 }],
        history,
        cardDataItems: history,
      })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory config={{ cluster: 'prod', release: 'nginx' }} />)
      expect(screen.getByText('current')).toBeInTheDocument()
    })

    it('opens detail modal when a history entry is clicked', async () => {
      const history = [makeHistoryEntry({ revision: 1, status: 'deployed' })]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        history,
        cardDataItems: history,
      })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory config={{ cluster: 'prod', release: 'nginx' }} />)
      // Click the revision row
      const revRow = screen.getByText('Rev 1').closest('[class*="cursor-pointer"]')!
      await userEvent.click(revRow)
      expect(screen.getByTestId('history-modal')).toBeInTheDocument()
    })

    it('triggers drill-down when scope badge is clicked', async () => {
      const history = [makeHistoryEntry({ revision: 1, status: 'deployed' })]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        history,
        cardDataItems: history,
      })
      const { HelmHistory } = await import('./HelmHistory')
      render(<HelmHistory config={{ cluster: 'prod', release: 'nginx' }} />)
      const scopeBtn = screen.getByTitle(/view details for nginx/i)
      await userEvent.click(scopeBtn)
      expect(mockDrillToHelm).toHaveBeenCalledWith('prod', 'default', 'nginx', expect.any(Object))
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for selector-only state', async () => {
      setupMocks({ clusters: [{ name: 'prod' }] })
      const { HelmHistory } = await import('./HelmHistory')
      const { container } = render(<HelmHistory />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
