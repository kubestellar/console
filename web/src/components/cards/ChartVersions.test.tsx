import React from 'react'
/**
 * Unit tests for ChartVersions card component.
 *
 * Covers: loading skeleton, empty state, live data rendering,
 * unique chart count summary, cluster filter, and CardData integration.
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
    t: (key: string, optsOrDefault?: Record<string, unknown> | string, maybeOpts?: Record<string, unknown>) => {
      const opts = typeof optsOrDefault === 'object' && optsOrDefault !== null ? optsOrDefault : maybeOpts
      const template = typeof optsOrDefault === 'string' ? optsOrDefault : key
      if (opts) return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? `{{${k}}}`))
      if (key === 'common.searchCharts') return 'Search charts...'
      return String(key).split('.').pop() ?? key
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

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: (field: string) => (a: Record<string, string>, b: Record<string, string>) =>
      (a[field] ?? '').localeCompare(b[field] ?? ''),
  },
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    // eslint-disable-next-line no-restricted-syntax -- mock component; production code uses the ui/Input wrapper
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ChartInfo {
  name: string
  chart: string
  version: string
  namespace: string
  cluster?: string
}

const defaultCardData = {
  items: [] as ChartInfo[],
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
    sortBy: 'name',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

interface HelmReleaseMock {
  name: string
  chart: string
  namespace: string
  cluster?: string
  status: string
  updated: string
  revision: number
  app_version?: string
}

function makeHelmRelease(overrides: Partial<HelmReleaseMock> = {}): HelmReleaseMock {
  return {
    name: 'prometheus',
    chart: 'prometheus-25.8.0',
    namespace: 'monitoring',
    cluster: 'prod',
    status: 'deployed',
    updated: '2024-01-15T10:00:00Z',
    revision: 1,
    ...overrides,
  }
}

function setupMocks(opts: {
  releases?: HelmReleaseMock[]
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  cardDataItems?: ChartInfo[]
  availableClusters?: Array<{ name: string }>
} = {}) {
  const releases = opts.releases ?? []
  mockUseClusters.mockReturnValue({ isLoading: false })
  mockUseCachedHelmReleases.mockReturnValue({
    releases,
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    lastRefresh: null,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
  })
  const cardItems = opts.cardDataItems ?? releases.map(r => {
    const chartParts = r.chart.match(/^(.+)-(\d+\.\d+\.\d+.*)$/)
    return {
      name: r.name,
      chart: chartParts ? chartParts[1] : r.chart,
      version: chartParts ? chartParts[2] : '',
      namespace: r.namespace,
      cluster: r.cluster,
    }
  })
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    totalItems: cardItems.length,
    filters: {
      ...defaultCardData.filters,
      availableClusters: opts.availableClusters ?? releases.map(r => ({ name: r.cluster ?? '' })),
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChartVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders CardSkeleton when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      expect(screen.getByText('noCharts')).toBeInTheDocument()
      expect(screen.getByText('installCharts')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders chart names with versions and cluster badges', async () => {
      const releases = [
        makeHelmRelease({ name: 'prometheus', chart: 'prometheus-25.8.0', cluster: 'prod' }),
        makeHelmRelease({ name: 'grafana', chart: 'grafana-7.0.0', cluster: 'staging' }),
      ]
      setupMocks({
        releases,
        availableClusters: [{ name: 'prod' }, { name: 'staging' }],
      })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      expect(screen.getAllByText('prometheus')[0]).toBeInTheDocument()
      expect(screen.getAllByText('grafana')[0]).toBeInTheDocument()
      const badges = screen.getAllByTestId('cluster-badge')
      expect(badges.map(b => b.textContent)).toContain('prod')
      expect(badges.map(b => b.textContent)).toContain('staging')
    })

    it('renders summary counts (releases and unique charts)', async () => {
      const releases = [
        makeHelmRelease({ name: 'prom-a', chart: 'prometheus-25.8.0', cluster: 'c1' }),
        makeHelmRelease({ name: 'prom-b', chart: 'prometheus-25.8.0', cluster: 'c2' }),
        makeHelmRelease({ name: 'grafana', chart: 'grafana-7.0.0', cluster: 'c1' }),
      ]
      setupMocks({ releases, availableClusters: [{ name: 'c1' }, { name: 'c2' }] })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      // 3 releases total, 2 unique charts
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('renders search input', async () => {
      const releases = [makeHelmRelease()]
      setupMocks({ releases, availableClusters: [{ name: 'prod' }] })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      expect(screen.getByTestId('card-search')).toBeInTheDocument()
    })

    it('shows no releases found when card data items are empty after filter', async () => {
      setupMocks({
        releases: [makeHelmRelease()],
        cardDataItems: [],
        availableClusters: [{ name: 'prod' }],
      })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      expect(screen.getByText('No Helm releases found')).toBeInTheDocument()
    })
  })

  describe('CardData integration', () => {
    it('passes correct sort comparators to useCardData', async () => {
      setupMocks({ releases: [makeHelmRelease()] })
      const { ChartVersions } = await import('./ChartVersions')
      render(<ChartVersions />)
      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('name')
      expect(config.sort.comparators).toHaveProperty('name')
      expect(config.sort.comparators).toHaveProperty('chart')
    })
  })

  describe('snapshot', () => {
    it('renders without crashing', async () => {
      const releases = [makeHelmRelease({ name: 'nginx', chart: 'nginx-1.0.0' })]
      setupMocks({ releases, availableClusters: [{ name: 'prod' }] })
      const { ChartVersions } = await import('./ChartVersions')
      const { container } = render(<ChartVersions />)
      expect(container.firstChild).toBeTruthy()
    })
  })
})
