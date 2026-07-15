import React from 'react'
/**
 * Unit tests for HelmReleaseStatus card component.
 *
 * Covers: loading skeleton, empty state, live data rendering,
 * summary counts, drill-down action, namespace filter, and
 * CardData integration.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count} total`
      return String(key).split(':').pop()?.split('.').pop() ?? key
    },
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedHelmReleases = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedHelmReleases: () => mockUseCachedHelmReleases(),
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

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
  CardEmptyState: ({ title, message }: { title: string; message: string }) => (
    <div data-testid="card-empty-state"><p>{title}</p><p>{message}</p></div>
  ),
}))

vi.mock('../../lib/formatters', () => ({
  formatTimeAgo: () => '2h ago',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HelmReleaseMock {
  name: string
  namespace: string
  chart: string
  version: string
  appVersion: string
  status: 'deployed' | 'failed' | 'pending' | 'superseded' | 'uninstalling'
  updated: string
  revision: number
  cluster?: string
}

function makeRelease(overrides: Partial<HelmReleaseMock> = {}): HelmReleaseMock {
  return {
    name: 'nginx',
    namespace: 'default',
    chart: 'nginx',
    version: '1.0.0',
    appVersion: '1.0.0',
    status: 'deployed',
    updated: '2024-01-15T10:00:00Z',
    revision: 1,
    cluster: 'prod',
    ...overrides,
  }
}

const defaultCardData = {
  items: [] as HelmReleaseMock[],
  allFilteredItems: [] as HelmReleaseMock[],
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
    sortBy: 'status',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

function setupMocks(opts: {
  releases?: HelmReleaseMock[]
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  cardDataItems?: HelmReleaseMock[]
} = {}) {
  const releases = opts.releases ?? []

  mockUseClusters.mockReturnValue({ isLoading: false })
  mockUseCachedHelmReleases.mockReturnValue({
    releases: releases.map(r => ({
      ...r,
      chart: `${r.chart}-${r.version}`,
      app_version: r.appVersion,
    })),
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
  })
  const cardItems = opts.cardDataItems ?? releases
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    allFilteredItems: cardItems,
    totalItems: cardItems.length,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HelmReleaseStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('empty state', () => {
    it('renders empty state component when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      expect(screen.getByTestId('card-empty-state')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders release names and status badges', async () => {
      const releases = [
        makeRelease({ name: 'prometheus', status: 'deployed' }),
        makeRelease({ name: 'grafana', status: 'failed', cluster: 'staging' }),
      ]
      setupMocks({ releases, cardDataItems: releases })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      expect(screen.getByText('prometheus')).toBeInTheDocument()
      expect(screen.getByText('grafana')).toBeInTheDocument()
      expect(screen.getByText('deployed')).toBeInTheDocument()
      expect(screen.getByText('failed')).toBeInTheDocument()
    })

    it('renders cluster badges for each release', async () => {
      const releases = [
        makeRelease({ name: 'nginx', cluster: 'prod' }),
        makeRelease({ name: 'redis', cluster: 'staging' }),
      ]
      setupMocks({ releases, cardDataItems: releases })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      const badges = screen.getAllByTestId('cluster-badge')
      expect(badges.map(b => b.textContent)).toContain('prod')
      expect(badges.map(b => b.textContent)).toContain('staging')
    })

    it('renders summary counts (total, deployed, failed)', async () => {
      const releases = [
        makeRelease({ name: 'a', status: 'deployed' }),
        makeRelease({ name: 'b', status: 'deployed' }),
        makeRelease({ name: 'c', status: 'failed' }),
      ]
      setupMocks({ releases, cardDataItems: releases })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      // Summary boxes show total (3), deployed (2), failed (1)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('triggers drill-down when a release row is clicked', async () => {
      const release = makeRelease({ name: 'nginx', cluster: 'prod', namespace: 'default' })
      setupMocks({ releases: [release], cardDataItems: [release] })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      await userEvent.click(screen.getByText('nginx'))
      expect(mockDrillToHelm).toHaveBeenCalledWith(
        'prod',
        'default',
        'nginx',
        expect.any(Object),
      )
    })

    it('shows AI actions button for non-deployed/superseded releases', async () => {
      const release = makeRelease({ name: 'broken', status: 'failed' })
      setupMocks({ releases: [release], cardDataItems: [release] })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      expect(screen.getByTestId('ai-actions')).toBeInTheDocument()
    })
  })

  describe('CardData integration', () => {
    it('passes correct sort config to useCardData', async () => {
      setupMocks({ releases: [makeRelease()] })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      render(<HelmReleaseStatus />)
      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('status')
      expect(config.sort.comparators).toHaveProperty('status')
      expect(config.sort.comparators).toHaveProperty('name')
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for live data state', async () => {
      const releases = [makeRelease({ name: 'nginx', status: 'deployed' })]
      setupMocks({ releases, cardDataItems: releases })
      const { HelmReleaseStatus } = await import('./HelmReleaseStatus')
      const { container } = render(<HelmReleaseStatus />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
