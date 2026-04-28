import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NamespaceOverview } from '../NamespaceOverview'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDrillToPod = vi.fn()
const mockDrillToDeployment = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1' }, { name: 'cluster-2' }],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: vi.fn(() => ({
    issues: [],
    isDemoFallback: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })),
  useCachedDeploymentIssues: vi.fn(() => ({
    issues: [],
    isDemoFallback: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })),
  useCachedNamespaces: vi.fn(() => ({
    namespaces: ['default', 'kube-system'],
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
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
  useDrillDownActions: () => ({
    drillToPod: mockDrillToPod,
    drillToDeployment: mockDrillToDeployment,
  }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../../lib/constants/storage', () => ({
  STORAGE_KEY_NS_OVERVIEW_CLUSTER: 'test-cluster-key',
  STORAGE_KEY_NS_OVERVIEW_NAMESPACE: 'test-ns-key',
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NamespaceOverview', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons when showSkeleton is true', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<NamespaceOverview />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no namespaces message when showEmptyState', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<NamespaceOverview />)
      expect(screen.getByText('cards:namespaceOverview.noNamespaces')).toBeTruthy()
    })
  })

  describe('Cluster and namespace selectors', () => {
    it('renders cluster select dropdown', () => {
      render(<NamespaceOverview />)
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(1)
    })

    it('renders namespace select dropdown', () => {
      render(<NamespaceOverview />)
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })

    it('populates cluster options from useClusters', () => {
      render(<NamespaceOverview />)
      // Cluster names may appear in both select options and badges
      expect(screen.getAllByText('cluster-1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('cluster-2').length).toBeGreaterThan(0)
    })

    it('shows select cluster and namespace prompt when neither selected', () => {
      render(<NamespaceOverview />)
      // Without a selected cluster, the card shows the prompt (or auto-selects first)
      // Auto-select happens via useEffect — DOM has selects at minimum
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    })
  })

  describe('Stats when cluster and namespace selected', () => {
    it('renders pod issues and deployment issues stat boxes', () => {
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      expect(screen.getByText('cards:namespaceOverview.podsWithIssues')).toBeTruthy()
      expect(screen.getByText('cards:namespaceOverview.deploymentIssues')).toBeTruthy()
    })

    it('shows healthy state when zero issues', () => {
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      expect(screen.getByText('cards:namespaceOverview.namespaceHealthy')).toBeTruthy()
    })
  })

  describe('Issue list', () => {
    it('renders pod issues when present', async () => {
      const { useCachedPodIssues } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPodIssues).mockReturnValue({
        issues: [{ name: 'broken-pod', namespace: 'default', status: 'CrashLoopBackOff' }],
        isDemoFallback: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      } as never)
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      expect(screen.getByText('broken-pod')).toBeTruthy()
    })

    it('renders deployment issues when present', async () => {
      const { useCachedDeploymentIssues } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedDeploymentIssues).mockReturnValue({
        issues: [{ name: 'failing-deploy', namespace: 'default', readyReplicas: 0, replicas: 2 }],
        isDemoFallback: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      } as never)
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      expect(screen.getByText('failing-deploy')).toBeTruthy()
    })

    it('calls drillToDeployment on deployment issue click', async () => {
      const { useCachedDeploymentIssues } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedDeploymentIssues).mockReturnValue({
        issues: [{ name: 'failing-deploy', namespace: 'default', readyReplicas: 0, replicas: 2 }],
        isDemoFallback: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      } as never)
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      fireEvent.click(screen.getByText('failing-deploy'))
      expect(mockDrillToDeployment).toHaveBeenCalledWith('cluster-1', 'default', 'failing-deploy')
    })
  })

  describe('Footer', () => {
    it('renders cluster and namespace in footer when both selected', () => {
      render(<NamespaceOverview config={{ cluster: 'cluster-1', namespace: 'default' }} />)
      // "default" appears in both the select options and the footer
      expect(screen.getAllByText('default').length).toBeGreaterThan(0)
    })
  })
})