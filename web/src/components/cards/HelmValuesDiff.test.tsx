import React from 'react'
import { Input } from '../ui/Input'
/**
 * Unit tests for HelmValuesDiff card component.
 *
 * Covers: loading skeleton, selector-only state, values rendering,
 * empty values state, drill-down action, and CardData integration.
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
    t: (key: string) => String(key).split('.').pop() ?? key,
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedHelmReleases = vi.fn()
const mockUseCachedHelmValues = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedHelmReleases: () => mockUseCachedHelmReleases(),
  useCachedHelmValues: () => mockUseCachedHelmValues(),
}))

const mockDrillToHelm = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToHelm: mockDrillToHelm }),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
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
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
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
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ValueEntry {
  path: string
  value: string
}

const defaultCardData = {
  items: [] as ValueEntry[],
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

function setupMocks(opts: {
  clusters?: Array<{ name: string; context?: string }>
  releases?: Array<{ name: string; cluster: string; namespace: string; chart: string; status: string; updated: string; revision: number }>
  values?: Record<string, unknown> | null
  isLoadingClusters?: boolean
  isLoadingReleases?: boolean
  isLoadingValues?: boolean
  isDemoFallback?: boolean
  cardDataItems?: ValueEntry[]
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: opts.clusters ?? [],
    isLoading: opts.isLoadingClusters ?? false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })
  mockUseCachedHelmReleases.mockReturnValue({
    releases: opts.releases ?? [],
    isLoading: opts.isLoadingReleases ?? false,
    isRefreshing: false,
    isDemoFallback: opts.isDemoFallback ?? false,
    lastRefresh: null,
  })
  mockUseCachedHelmValues.mockReturnValue({
    values: opts.values ?? null,
    isLoading: opts.isLoadingValues ?? false,
    isRefreshing: false,
    lastRefresh: null,
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  })
  const cardItems = opts.cardDataItems ?? []
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    totalItems: cardItems.length,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HelmValuesDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton when clusters and releases are loading with no cached data', async () => {
      setupMocks({ isLoadingClusters: true, isLoadingReleases: true })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('selector state', () => {
    it('shows prompt to select cluster and release when none selected', async () => {
      setupMocks({ clusters: [{ name: 'prod' }] })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff />)
      expect(screen.getByText('Select a cluster and release to compare values')).toBeInTheDocument()
    })

    it('renders cluster selector with available clusters', async () => {
      setupMocks({ clusters: [{ name: 'prod' }, { name: 'staging' }] })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff />)
      expect(screen.getByText('prod')).toBeInTheDocument()
      expect(screen.getByText('staging')).toBeInTheDocument()
    })
  })

  describe('values rendering', () => {
    it('renders custom values list when values are available', async () => {
      const valueEntries: ValueEntry[] = [
        { path: 'replicaCount', value: '3' },
        { path: 'image.tag', value: '"v1.2.0"' },
      ]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        values: { replicaCount: 3, image: { tag: 'v1.2.0' } },
        cardDataItems: valueEntries,
      })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff config={{ cluster: 'prod', release: 'nginx' }} />)
      expect(screen.getByText('replicaCount')).toBeInTheDocument()
      expect(screen.getByText('image.tag')).toBeInTheDocument()
    })

    it('shows "no custom values" message when values object is empty', async () => {
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        values: {},
        cardDataItems: [],
      })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff config={{ cluster: 'prod', release: 'nginx' }} />)
      expect(screen.getByText('No custom values set (using chart defaults)')).toBeInTheDocument()
    })

    it('shows loading spinner while values are being fetched', async () => {
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        values: null,
        isLoadingValues: true,
      })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff config={{ cluster: 'prod', release: 'nginx' }} />)
      // Shows "Loading values" spinner
      expect(screen.getByText(/Loading values for nginx/i)).toBeInTheDocument()
    })

    it('triggers drill-down when scope badge is clicked', async () => {
      const valueEntries: ValueEntry[] = [{ path: 'replicaCount', value: '3' }]
      setupMocks({
        clusters: [{ name: 'prod' }],
        releases: [{ name: 'nginx', cluster: 'prod', namespace: 'default', chart: 'nginx-1.0.0', status: 'deployed', updated: '2024-01-15T10:00:00Z', revision: 1 }],
        values: { replicaCount: 3 },
        cardDataItems: valueEntries,
      })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      render(<HelmValuesDiff config={{ cluster: 'prod', release: 'nginx' }} />)
      const scopeBadge = screen.getByText('nginx').closest('[class*="cursor-pointer"]')!
      await userEvent.click(scopeBadge)
      expect(mockDrillToHelm).toHaveBeenCalledWith('prod', 'default', 'nginx', expect.any(Object))
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for selector state', async () => {
      setupMocks({ clusters: [{ name: 'prod' }] })
      const { HelmValuesDiff } = await import('./HelmValuesDiff')
      const { container } = render(<HelmValuesDiff />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
