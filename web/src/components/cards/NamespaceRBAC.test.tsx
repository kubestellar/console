import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../ui/Input'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, optsOrFallback?: Record<string, unknown> | string) => {
      if (typeof optsOrFallback === 'string') return optsOrFallback
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCachedNamespaces = vi.fn()
const mockUseCachedK8sRoles = vi.fn()
const mockUseCachedK8sRoleBindings = vi.fn()
const mockUseCachedK8sServiceAccounts = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedNamespaces: (_cluster?: string) => mockUseCachedNamespaces(_cluster),
  useCachedK8sRoles: (_cluster?: string, _ns?: string) => mockUseCachedK8sRoles(_cluster, _ns),
  useCachedK8sRoleBindings: (_cluster?: string, _ns?: string) => mockUseCachedK8sRoleBindings(_cluster, _ns),
  useCachedK8sServiceAccounts: (_cluster?: string, _ns?: string) => mockUseCachedK8sServiceAccounts(_cluster, _ns),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToRBAC: vi.fn() }),
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
    string: (_field: string) => () => 0,
    number: (_field: string) => () => 0,
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-controls-row">{children}</div>
  ),
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ name }: { name: string }) => <span data-testid="cluster-badge">{name}</span>,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(name = 'prod-cluster') {
  return { name, context: name, healthy: true, nodeCount: 3 }
}

function setupMocks(opts: {
  clusters?: ReturnType<typeof makeCluster>[]
  clustersLoading?: boolean
  clustersFailed?: boolean
  clustersFailures?: number
  namespaces?: string[]
  roles?: unknown[]
  bindings?: unknown[]
  serviceAccounts?: unknown[]
  showSkeleton?: boolean
  showEmptyState?: boolean
  selectedClusters?: string[]
  isAllClustersSelected?: boolean
  cardItems?: unknown[]
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: opts.clusters ?? [],
    isLoading: opts.clustersLoading ?? false,
    isRefreshing: false,
    isFailed: opts.clustersFailed ?? false,
    consecutiveFailures: opts.clustersFailures ?? 0,
    error: null,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: opts.selectedClusters ?? [],
    isAllClustersSelected: opts.isAllClustersSelected ?? true,
    customFilter: '',
  })

  mockUseCachedNamespaces.mockReturnValue({
    namespaces: opts.namespaces ?? ['default'],
    isDemoFallback: false,
    isRefreshing: false,
  })

  mockUseCachedK8sRoles.mockReturnValue({
    roles: opts.roles ?? [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
  })

  mockUseCachedK8sRoleBindings.mockReturnValue({
    bindings: opts.bindings ?? [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
  })

  mockUseCachedK8sServiceAccounts.mockReturnValue({
    serviceAccounts: opts.serviceAccounts ?? [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })

  const cardItems = opts.cardItems ?? []
  mockUseCardData.mockReturnValue({
    items: cardItems,
    totalItems: cardItems.length,
    currentPage: 1,
    totalPages: 1,
    needsPagination: false,
    goToPage: vi.fn(),
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
    sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { NamespaceRBAC } from './NamespaceRBAC'

describe('NamespaceRBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    setupMocks()
    const { container } = render(<NamespaceRBAC />)
    expect(container).toBeDefined()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setupMocks({ showSkeleton: true })
    render(<NamespaceRBAC />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('renders empty state when showEmptyState is true', () => {
    setupMocks({ showEmptyState: true })
    render(<NamespaceRBAC />)
    expect(screen.getByText('noRBACData')).toBeInTheDocument()
  })

  it('passes isLoading=true when clusters are loading', () => {
    setupMocks({ clustersLoading: true })
    render(<NamespaceRBAC />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
    )
  })

  it('passes isFailed=true when clusters fail', () => {
    setupMocks({ clustersFailed: true, clustersFailures: 2 })
    render(<NamespaceRBAC />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true }),
    )
  })

  it('renders roles tab items', () => {
    const roleItem = { name: 'pod-reader', type: 'Role' as const, rules: 3, cluster: 'prod-cluster' }
    setupMocks({ cardItems: [roleItem] })
    render(<NamespaceRBAC />)
    expect(screen.getByText('pod-reader')).toBeInTheDocument()
  })

  it('renders cluster badges when clusters are present', () => {
    setupMocks({ clusters: [makeCluster('cluster-x')] })
    render(<NamespaceRBAC />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('accepts config prop', () => {
    setupMocks()
    const { container } = render(
      <NamespaceRBAC config={{ cluster: 'dev', namespace: 'default' }} />,
    )
    expect(container).toBeDefined()
  })
})
