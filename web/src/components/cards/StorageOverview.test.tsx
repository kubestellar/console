/**
 * Unit tests for StorageOverview card component.
 *
 * Tests cover: loading skeleton (including sr-only accessible label),
 * empty state variants (no data / fetch failed), stats rendering
 * (total PVCs, bound/pending/failed counts, storage classes),
 * all-fetches-failed error state, PVC error banner, and cluster filter.
 *
 * Closes #14769
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StorageOverview } from './StorageOverview'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Pass-through with template substitution for count/pvcs/clusters
      if (opts && 'count' in opts) return `${opts.count}`
      if (opts && 'pvcs' in opts && 'clusters' in opts) return `${opts.pvcs} PVCs, ${opts.clusters} clusters`
      if (opts && 'error' in opts) return `Failed: ${opts.error}`
      return key.split('.').pop() ?? key
    },
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedPVCs = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedPVCs: () => mockUseCachedPVCs(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockIsDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockIsDemoMode(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

const mockUseChartFilters = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useChartFilters: () => mockUseChartFilters(),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardClusterFilter: ({ availableClusters }: { availableClusters: Array<{ name: string }> }) => (
    <div data-testid="cluster-filter" data-count={availableClusters.length} />
  ),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ width, height }: { width?: number; height?: number }) => (
    <div data-testid="skeleton" style={{ width, height }} />
  ),
  SkeletonStats: ({ className }: { className?: string }) => (
    <div data-testid="skeleton-stats" className={className} />
  ),
  SkeletonList: ({ items, className }: { items?: number; className?: string }) => (
    <div data-testid="skeleton-list" data-items={items} className={className} />
  ),
}))

vi.mock('../../lib/formatStats', () => ({
  formatStat: (n: number) => String(n),
  formatStorageStat: (gb: number, hasRealData?: boolean) =>
    hasRealData === false ? 'N/A' : `${gb}GB`,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePVC = (
  status: string,
  cluster = 'cluster-a',
  storageClass = 'standard'
) => ({ status, cluster, storageClass })

const defaultClustersReturn = {
  deduplicatedClusters: [
    { name: 'cluster-a', storageGB: 100, reachable: true },
  ],
  isLoading: false,
  isRefreshing: false,
}

const defaultPVCsReturn = {
  pvcs: [
    makePVC('Bound'),
    makePVC('Bound'),
    makePVC('Pending'),
    makePVC('Failed'),
  ],
  isLoading: false,
  isRefreshing: false,
  consecutiveFailures: 0,
  isFailed: false,
  isDemoFallback: false,
  error: null,
}

const defaultChartFilters = {
  localClusterFilter: [],
  toggleClusterFilter: vi.fn(),
  clearClusterFilter: vi.fn(),
  availableClusters: [{ name: 'cluster-a' }],
  showClusterFilter: false,
  setShowClusterFilter: vi.fn(),
  clusterFilterRef: { current: null },
}

const defaultGlobalFilters = {
  selectedClusters: ['cluster-a'],
  isAllClustersSelected: true,
}

function setup() {
  mockUseClusters.mockReturnValue(defaultClustersReturn)
  mockUseCachedPVCs.mockReturnValue(defaultPVCsReturn)
  mockUseGlobalFilters.mockReturnValue(defaultGlobalFilters)
  mockUseChartFilters.mockReturnValue(defaultChartFilters)
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockIsDemoMode.mockReturnValue({ isDemoMode: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // --- Loading skeleton -----------------------------------------------------

  it('renders loading skeleton with sr-only accessible label', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<StorageOverview />)
    // sr-only paragraph provides accessible loading label
    const srLabel = document.querySelector('.sr-only')
    expect(srLabel).toBeTruthy()
    expect(srLabel?.textContent).toMatch(/loading/i)
    // Skeleton components render
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    expect(screen.getByTestId('skeleton-stats')).toBeInTheDocument()
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument()
  })

  // --- Empty state variants -------------------------------------------------

  it('renders no-data empty state text when no PVCs and showEmptyState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    mockUseCachedPVCs.mockReturnValue({ ...defaultPVCsReturn, pvcs: [], isFailed: false })
    render(<StorageOverview />)
    // Both noData and noDataHint keys appear — check noData exists
    const noDataEls = screen.getAllByText(/noData/)
    expect(noDataEls.length).toBeGreaterThan(0)
  })

  it('renders fetch-failed empty state when isFailed and showEmptyState', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    mockUseCachedPVCs.mockReturnValue({
      ...defaultPVCsReturn,
      pvcs: [],
      isFailed: true,
      error: 'connection refused',
    })
    render(<StorageOverview />)
    expect(screen.getByText(/fetchFailed/)).toBeInTheDocument()
  })

  // --- Stats rendering ------------------------------------------------------

  it('renders total PVC count', () => {
    render(<StorageOverview />)
    // The PVCs tile renders "pvcs" label and "4" stat — check both are present
    const statValues = screen.getAllByText('4')
    expect(statValues.length).toBeGreaterThan(0)
  })

  it('renders bound PVC count', () => {
    render(<StorageOverview />)
    // 2 bound
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThan(0)
  })

  it('renders pending PVC count', () => {
    render(<StorageOverview />)
    // 1 pending
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThan(0)
  })

  it('renders failed PVC count', () => {
    render(<StorageOverview />)
    // 1 failed — stat labels: bound=2, pending=1, failed=1
    const failedStat = screen.getAllByText('1')
    expect(failedStat.length).toBeGreaterThan(0)
  })

  it('renders storage capacity stat', () => {
    render(<StorageOverview />)
    // cluster-a has storageGB=100, hasRealData=true → "100GB"
    expect(screen.getByText('100GB')).toBeInTheDocument()
  })

  // --- Storage classes ------------------------------------------------------

  it('renders storage class list', () => {
    const pvcs = [
      makePVC('Bound', 'cluster-a', 'fast-ssd'),
      makePVC('Bound', 'cluster-a', 'fast-ssd'),
      makePVC('Pending', 'cluster-a', 'standard'),
    ]
    mockUseCachedPVCs.mockReturnValue({ ...defaultPVCsReturn, pvcs })

    render(<StorageOverview />)
    expect(screen.getByText('fast-ssd')).toBeInTheDocument()
    expect(screen.getByText('standard')).toBeInTheDocument()
  })

  it('renders storage class section label', () => {
    render(<StorageOverview />)
    expect(screen.getByText(/storageClasses/)).toBeInTheDocument()
  })

  it('limits storage class list to top 5', () => {
    const pvcs = Array.from({ length: 8 }, (_, i) =>
      makePVC('Bound', 'cluster-a', `class-${i}`)
    )
    mockUseCachedPVCs.mockReturnValue({ ...defaultPVCsReturn, pvcs })

    render(<StorageOverview />)
    // Only first 5 storage classes should render
    const classLabels = screen.queryAllByText(/class-/)
    expect(classLabels.length).toBeLessThanOrEqual(5)
  })

  // --- All-fetches-failed error state ---------------------------------------

  it('shows all-fetches-failed state when consecutive failures > 0 and not refreshing', () => {
    mockUseCachedPVCs.mockReturnValue({
      ...defaultPVCsReturn,
      pvcs: [makePVC('Bound')],
      consecutiveFailures: 3,
      isRefreshing: false,
      isDemoFallback: false,
    })
    mockUseClusters.mockReturnValue({
      ...defaultClustersReturn,
      isRefreshing: false,
    })

    render(<StorageOverview />)
    // Both allFetchesFailed and allFetchesFailedHint render — check at least one
    const els = screen.getAllByText(/allFetchesFailed/)
    expect(els.length).toBeGreaterThan(0)
  })

  it('does not show all-fetches-failed during active refresh', () => {
    mockUseCachedPVCs.mockReturnValue({
      ...defaultPVCsReturn,
      pvcs: [makePVC('Bound')],
      consecutiveFailures: 3,
      isRefreshing: true,
      isDemoFallback: false,
    })

    render(<StorageOverview />)
    expect(screen.queryByText(/allFetchesFailed/)).not.toBeInTheDocument()
  })

  // --- PVC error banner -----------------------------------------------------

  it('shows PVC error banner when pvcsError is set', () => {
    mockUseCachedPVCs.mockReturnValue({
      ...defaultPVCsReturn,
      error: 'API timeout',
    })

    render(<StorageOverview />)
    expect(screen.getByText(/Failed: API timeout/)).toBeInTheDocument()
  })

  // --- Cluster filter -------------------------------------------------------

  it('renders cluster filter control', () => {
    render(<StorageOverview />)
    expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
  })

  it('shows cluster count indicator when local filter is active', () => {
    mockUseChartFilters.mockReturnValue({
      ...defaultChartFilters,
      localClusterFilter: ['cluster-a'],
    })

    render(<StorageOverview />)
    // "1/1" indicator should appear
    expect(screen.getByText(/1\/1/)).toBeInTheDocument()
  })

  // --- Footer ---------------------------------------------------------------

  it('renders footer with PVC and cluster counts', () => {
    render(<StorageOverview />)
    // formatStat(4) PVCs, 1 cluster
    expect(screen.getByText(/4 PVCs, 1 clusters/)).toBeInTheDocument()
  })
})
