import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NamespaceOverview } from './NamespaceOverview'

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
const mockUseCachedPodIssues = vi.fn()
const mockUseCachedDeploymentIssues = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedNamespaces: (_cluster?: string) => mockUseCachedNamespaces(_cluster),
  useCachedPodIssues: (_cluster?: string) => mockUseCachedPodIssues(_cluster),
  useCachedDeploymentIssues: (_cluster?: string) => mockUseCachedDeploymentIssues(_cluster),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod: vi.fn(), drillToDeployment: vi.fn() }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

vi.mock('../../lib/constants/storage', () => ({
  STORAGE_KEY_NS_OVERVIEW_CLUSTER: 'ns-overview-cluster',
  STORAGE_KEY_NS_OVERVIEW_NAMESPACE: 'ns-overview-namespace',
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../ui/ClusterStatusBadge', () => ({
  ClusterStatusBadge: ({ state }: { state: string }) => (
    <span data-testid="cluster-status-badge">{state}</span>
  ),
  getClusterState: vi.fn(() => 'healthy'),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
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
  podIssues?: unknown[]
  deploymentIssues?: unknown[]
  showSkeleton?: boolean
  showEmptyState?: boolean
  selectedClusters?: string[]
  isAllClustersSelected?: boolean
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: opts.clusters ?? [],
    isLoading: opts.clustersLoading ?? false,
    isRefreshing: false,
    isFailed: opts.clustersFailed ?? false,
    consecutiveFailures: opts.clustersFailures ?? 0,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: opts.selectedClusters ?? [],
    isAllClustersSelected: opts.isAllClustersSelected ?? true,
    customFilter: '',
  })

  mockUseCachedNamespaces.mockReturnValue({
    namespaces: opts.namespaces ?? [],
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
  })

  mockUseCachedPodIssues.mockReturnValue({
    issues: opts.podIssues ?? [],
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    lastRefresh: null,
  })

  mockUseCachedDeploymentIssues.mockReturnValue({
    issues: opts.deploymentIssues ?? [],
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    lastRefresh: null,
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NamespaceOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    setupMocks()
    const { container } = render(<NamespaceOverview />)
    expect(container).toBeDefined()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setupMocks({ showSkeleton: true })
    render(<NamespaceOverview />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders empty state when showEmptyState is true', () => {
    setupMocks({ showEmptyState: true })
    render(<NamespaceOverview />)
    expect(screen.getByText('noNamespaces')).toBeInTheDocument()
  })

  it('renders cluster badges when clusters are present', () => {
    setupMocks({
      clusters: [makeCluster('cluster-a'), makeCluster('cluster-b')],
      namespaces: ['default', 'kube-system'],
    })
    render(<NamespaceOverview />)
    const badges = screen.getAllByTestId('cluster-badge')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('passes isLoading=true to useCardLoadingState when clusters are loading', () => {
    setupMocks({ clustersLoading: true })
    render(<NamespaceOverview />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
    )
  })

  it('passes isFailed=true to useCardLoadingState when clusters fail', () => {
    setupMocks({ clustersFailed: true, clustersFailures: 3 })
    render(<NamespaceOverview />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true }),
    )
  })

  it('accepts a config prop with cluster and namespace', () => {
    setupMocks({ clusters: [makeCluster('my-cluster')], namespaces: ['staging'] })
    const { container } = render(
      <NamespaceOverview config={{ cluster: 'my-cluster', namespace: 'staging' }} />,
    )
    expect(container).toBeDefined()
  })
})
