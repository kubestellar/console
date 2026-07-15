import React from 'react'
/**
 * Unit tests for ArgoCDApplicationSets card component.
 *
 * Covers: loading skeleton, empty state, live data rendering,
 * stats summary, config.cluster pre-filter, CardData integration,
 * and demo data integration notice.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ArgoApplicationSet } from '../../hooks/useArgoCD'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseArgoApplicationSets = vi.fn()
vi.mock('../../hooks/useArgoCD', () => ({
  useArgoApplicationSets: () => mockUseArgoApplicationSets(),
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
    string: () => (a: Record<string, string>, b: Record<string, string>) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
  },
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination" data-page={currentPage} data-total={totalPages} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppSet(overrides: Partial<ArgoApplicationSet> = {}): ArgoApplicationSet {
  return {
    name: 'my-appset',
    namespace: 'argocd',
    cluster: 'prod-cluster',
    status: 'Healthy',
    appCount: 3,
    syncPolicy: 'Automated',
    generators: ['cluster'],
    template: 'app-template',
    ...overrides,
  }
}

const defaultCardData = {
  items: [] as ArgoApplicationSet[],
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
  appSets?: ArgoApplicationSet[]
  isLoading?: boolean
  isDemoData?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  cardDataItems?: ArgoApplicationSet[]
} = {}) {
  const appSets = opts.appSets ?? []
  mockUseArgoApplicationSets.mockReturnValue({
    applicationSets: appSets,
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData: opts.isDemoData ?? false,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
    hasData: appSets.length > 0,
  })
  const cardItems = opts.cardDataItems ?? appSets
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    totalItems: cardItems.length,
    totalPages: Math.max(1, Math.ceil(cardItems.length / 5)),
    needsPagination: cardItems.length > 5,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArgoCDApplicationSets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3)
    })

    it('passes correct args to useCardLoadingState', async () => {
      setupMocks({ isLoading: true, appSets: [] })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true, hasAnyData: false }),
      )
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('noApplicationSets')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders application set names and cluster badges', async () => {
      const appSets = [
        makeAppSet({ name: 'fleet-deploy', cluster: 'us-east' }),
        makeAppSet({ name: 'monitoring', cluster: 'eu-west', status: 'Error' }),
      ]
      setupMocks({ appSets, cardDataItems: appSets })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('fleet-deploy')).toBeInTheDocument()
      expect(screen.getByText('monitoring')).toBeInTheDocument()
      const badges = screen.getAllByTestId('cluster-badge')
      expect(badges.map(b => b.textContent)).toContain('us-east')
      expect(badges.map(b => b.textContent)).toContain('eu-west')
    })

    it('renders search input', async () => {
      const appSets = [makeAppSet()]
      setupMocks({ appSets, cardDataItems: appSets })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(screen.getByTestId('card-search')).toBeInTheDocument()
    })

    it('renders stats summary with correct healthy/error counts', async () => {
      const appSets = [
        makeAppSet({ status: 'Healthy', appCount: 5 }),
        makeAppSet({ name: 'b', status: 'Healthy', appCount: 3 }),
        makeAppSet({ name: 'c', status: 'Error', appCount: 1 }),
      ]
      setupMocks({ appSets, cardDataItems: appSets })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      // stats grid shows healthy: 2, error: 1
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })

  describe('config.cluster pre-filter', () => {
    it('passes only matching cluster items to useCardData', async () => {
      const appSets = [
        makeAppSet({ name: 'a', cluster: 'c1' }),
        makeAppSet({ name: 'b', cluster: 'c2' }),
      ]
      setupMocks({ appSets, cardDataItems: appSets })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets config={{ cluster: 'c1' }} />)
      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0] as ArgoApplicationSet[]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].cluster).toBe('c1')
    })
  })

  describe('demo data notice', () => {
    it('shows demo integration notice when isDemoData is true and no real data', async () => {
      const appSets = [] as ArgoApplicationSet[]
      mockUseArgoApplicationSets.mockReturnValue({
        applicationSets: appSets,
        isLoading: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        isDemoData: true,
      })
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
      mockUseCardData.mockReturnValue({ ...defaultCardData, items: appSets, totalItems: 0 })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      expect(screen.getByText('demoNotice')).toBeInTheDocument()
    })
  })

  describe('CardData integration', () => {
    it('passes correct sort config to useCardData', async () => {
      setupMocks({ appSets: [makeAppSet()] })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      render(<ArgoCDApplicationSets />)
      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('status')
      expect(config.sort.comparators).toHaveProperty('status')
      expect(config.sort.comparators).toHaveProperty('name')
    })
  })

  describe('snapshot', () => {
    it('renders without crashing', async () => {
      const appSets = [makeAppSet({ name: 'demo-appset', status: 'Healthy', appCount: 2 })]
      setupMocks({ appSets, cardDataItems: appSets })
      const { ArgoCDApplicationSets } = await import('./ArgoCDApplicationSets')
      const { container } = render(<ArgoCDApplicationSets />)
      expect(container.firstChild).toBeTruthy()
    })
  })
})
