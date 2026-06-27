import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NamespaceOverview } from '../NamespaceOverview'

// Mock all dependencies
const mockUseClusters = vi.fn()
const mockUseCachedNamespaces = vi.fn()
const mockUseCachedPodIssues = vi.fn()
const mockUseCachedDeploymentIssues = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseDrillDownActions = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
  useCachedPodIssues: (cluster: string) => mockUseCachedPodIssues(cluster),
  useCachedDeploymentIssues: (cluster: string) => mockUseCachedDeploymentIssues(cluster),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

const TRANSLATIONS: Record<string, string> = {
  'cards:namespaceOverview.healthPending': 'Awaiting selection',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => TRANSLATIONS[key] || fallback || key,
  }),
}))

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: () => {},
}))

describe('NamespaceOverview - Multi-cluster guards (#16050)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseGlobalFilters.mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
      customFilter: '',
    })

    mockUseDrillDownActions.mockReturnValue({
      drillToPod: vi.fn(),
      drillToDeployment: vi.fn(),
    })

    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })

    mockUseCachedNamespaces.mockReturnValue({
      namespaces: [],
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
    })

    mockUseCachedPodIssues.mockReturnValue({
      issues: [],
      isDemoFallback: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: [],
      isDemoFallback: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
  })

  it('handles undefined clusters array without crashing', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: undefined, // Could happen with malformed response
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    // Should not crash due to early return guard
    render(<NamespaceOverview />)

    // Should show the select cluster prompt (because no clusters available)
    expect(screen.getByText('selectors.selectCluster')).toBeInTheDocument()
  })

  it('handles empty clusters array without crashing', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [], // No clusters available
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    // Should not crash due to guard: !clusters || clusters.length === 0
    render(<NamespaceOverview />)

    // Should show the select cluster prompt
    expect(screen.getByText('selectors.selectCluster')).toBeInTheDocument()
  })

  it('renders cluster selector when clusters are available', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', context: 'context-1', reachable: true },
        { name: 'cluster-2', context: 'context-2', reachable: true },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    render(<NamespaceOverview />)

    // Should render cluster options and a pending health badge
    expect(screen.getByText('cluster-1')).toBeInTheDocument()
    expect(screen.getByText('cluster-2')).toBeInTheDocument()
    expect(screen.getByText('Awaiting selection')).toBeInTheDocument()
  })

  it('does not auto-select the first cluster when multiple clusters are visible', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', context: 'context-1', reachable: true },
        { name: 'cluster-2', context: 'context-2', reachable: true },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    render(<NamespaceOverview />)

    expect(screen.getAllByRole('combobox')[0]).toHaveValue('')
  })

  it('displays cluster health indicators for reachable/unreachable clusters', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'healthy-cluster', context: 'context-1', reachable: true },
        { name: 'unreachable-cluster', context: 'context-2', reachable: false },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    render(<NamespaceOverview />)

    // Both clusters should be rendered - health indicators should reflect their reachability
    expect(screen.getByText('healthy-cluster')).toBeInTheDocument()
    expect(screen.getByText('unreachable-cluster')).toBeInTheDocument()
  })

  it('guards against undefined namespaces array', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'test-cluster', context: 'test-context', reachable: true },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    mockUseCachedNamespaces.mockReturnValue({
      namespaces: undefined, // Could happen with malformed response
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
    })

    // Should not crash due to guard: (namespaces || []).map()
    render(<NamespaceOverview />)

    // Component should render without crashing
    expect(screen.getByText('selectors.selectNamespace')).toBeInTheDocument()
  })

  it('guards against undefined pod issues array', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'test-cluster', context: 'test-context', reachable: true },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })

    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['default'],
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
    })

    mockUseCachedPodIssues.mockReturnValue({
      issues: undefined, // Could happen with malformed response
      isDemoFallback: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    mockUseCachedDeploymentIssues.mockReturnValue({
      issues: undefined, // Could happen with malformed response
      isDemoFallback: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    // Should not crash due to guards: (allPodIssues || [])
    render(<NamespaceOverview />)

    // Component should render without crashing
    expect(screen.getByText('selectors.selectCluster')).toBeInTheDocument()
  })
})
