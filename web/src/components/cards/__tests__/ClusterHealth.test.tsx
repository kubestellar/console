import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterHealth } from '../ClusterHealth'
import type { ClusterInfo } from '../../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => opts ? `${k}:${JSON.stringify(opts)}` : k }),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
  useClusterHealth: () => ({ health: null, isLoading: false }),
  getDemoClusters: () => [],
}))

const mockUseCachedGPUNodes = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockUseCachedGPUNodes(),
}))

const mockSelectedClusters = vi.fn(() => [])
const mockIsAllClustersSelected = vi.fn(() => true)
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: mockSelectedClusters(),
    isAllClustersSelected: mockIsAllClustersSelected(),
  }),
}))

vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: false }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  getDemoMode: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
  useCardDemoState: () => ({ shouldUseDemoData: false }),
}))

const mockUseCardData = vi.fn()
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useCardData: (...args: unknown[]) => mockUseCardData(...args),
  }
})

vi.mock('../../../hooks/useFederation', () => ({
  useFederationAwareness: () => ({ hubs: [], clusters: [], groups: [], pendingJoins: [], errors: [], isDemoFallback: false }),
  getProviderLabel: (p: string) => p,
  getStateLabel: (s: string) => s,
  getStateColorClasses: () => '',
  getFederationProviderLabel: (p: string) => p,
}))

vi.mock('../../clusters/utils', () => ({
  isClusterUnreachable: (c: ClusterInfo) => c.reachable === false,
  isClusterTokenExpired: (c: ClusterInfo) => c.errorMessage?.includes('token') ?? false,
  isClusterHealthy: (c: ClusterInfo) => c.healthy === true,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: ({ provider }: { provider: string }) => <span data-testid={`cloud-${provider}`} />,
  detectCloudProvider: () => 'other',
  getProviderLabel: () => 'Other',
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
}))

vi.mock('../../ui/Tooltip', () => ({
  Tooltip: ({ children, wrapperClassName }: { children: React.ReactNode; wrapperClassName?: string }) => (
    <div data-testid="tooltip-wrapper" className={wrapperClassName}>{children}</div>
  ),
}))

vi.mock('../../../lib/constants/network', () => ({
  CARD_LOADING_TIMEOUT_MS: 30000,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

vi.mock('../../../config/routes', () => ({
  ROUTES: { CLUSTERS: '/clusters' },
}))

vi.mock('../../clusters/ClusterDetailModal', () => ({
  ClusterDetailModal: ({ clusterName, onClose }: { clusterName: string; onClose: () => void }) => (
    <div data-testid="cluster-detail-modal">
      <span>{clusterName}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardPaginationFooter: ({ needsPagination }: { needsPagination: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
  CardAIActions: () => <div data-testid="ai-actions" />,
  CardEmptyState: ({ title, message }: { title?: string; message?: string; icon?: unknown }) => <div data-testid="empty-state">{title}{message && <span>{message}</span>}</div>,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'prod-cluster',
    context: 'prod-ctx',
    server: 'https://k8s.example.com',
    reachable: true,
    healthy: true,
    nodeCount: 3,
    podCount: 10,
    cpuCores: 16,
    memoryGB: 64,
    ...overrides,
  } as ClusterInfo
}

function makeCardDataReturn(clusters: ClusterInfo[] = []) {
  return {
    items: clusters,
    totalItems: clusters.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 'unlimited',
    goToPage: vi.fn(),
    needsPagination: false,
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
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

function setupDefaults({
  clusters = [] as ClusterInfo[],
  isLoading = false,
  isRefreshing = false,
  error = null as string | null,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: clusters,
    isLoading,
    isRefreshing,
    error,
    lastRefresh: null,
    consecutiveFailures: 0,
    isFailed: false,
  })
  mockUseCachedGPUNodes.mockReturnValue({
    nodes: [],
    isDemoFallback: false,
    isRefreshing: false,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
  mockUseCardData.mockReturnValue(makeCardDataReturn(clusters))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClusterHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAllClustersSelected.mockReturnValue(true)
    mockSelectedClusters.mockReturnValue([])
    mockIsDemoMode.mockReturnValue(false)
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeleton when showSkeleton=true', () => {
      setupDefaults({ showSkeleton: true })
      render(<ClusterHealth />)
      expect(screen.getByTestId('skeleton-stats')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument()
    })

    it('does not render cluster rows while loading', () => {
      setupDefaults({ showSkeleton: true, clusters: [makeCluster()] })
      render(<ClusterHealth />)
      expect(screen.queryByText('prod-cluster')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state message when showEmptyState=true', () => {
      setupDefaults({ showEmptyState: true })
      render(<ClusterHealth />)
      expect(screen.getByText('clusterHealth.noClustersConfigured')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('stats tiles', () => {
    it('renders healthy cluster count', () => {
      const clusters = [makeCluster({ healthy: true, reachable: true })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      // healthy count = 1
      const healthyTiles = screen.getAllByTitle(/healthyTooltip/)
      expect(healthyTiles.some(el => el.textContent?.includes('1'))).toBe(true)
    })

    it('renders unhealthy cluster count', () => {
      const clusters = [makeCluster({ healthy: false, reachable: true })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      const unhealthyTiles = screen.getAllByTitle(/unhealthyTooltip/)
      expect(unhealthyTiles.some(el => el.textContent?.includes('1'))).toBe(true)
    })

    it('renders token-expired count', () => {
      const clusters = [
        makeCluster({ reachable: false, errorMessage: 'token expired' }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      const authTiles = screen.getAllByTitle(/authErrorTooltip/)
      expect(authTiles.some(el => el.textContent?.includes('1'))).toBe(true)
    })

    it('renders offline (non-auth) cluster count', () => {
      const clusters = [
        makeCluster({ reachable: false, errorMessage: 'connection refused' }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      const offlineTiles = screen.getAllByTitle(/offlineTooltip/)
      expect(offlineTiles.some(el => el.textContent?.includes('1'))).toBe(true)
    })

    it('renders total nodes in footer', () => {
      const clusters = [
        makeCluster({ nodeCount: 5 }),
        makeCluster({ name: 'c2', nodeCount: 3 }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByText(/8/)).toBeInTheDocument()
    })

    it('renders total pods in footer', () => {
      const clusters = [makeCluster({ podCount: 42 })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getAllByText(/42/).length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  describe('cluster list', () => {
    it('renders cluster name', () => {
      const clusters = [makeCluster({ name: 'my-cluster' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByText('my-cluster')).toBeInTheDocument()
    })

    it('stretches each cluster row to the full card width', () => {
      const clusters = [makeCluster({ name: 'full-width-cluster' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTestId('tooltip-wrapper')).toHaveClass('block', 'w-full')
      expect(screen.getByRole('button', { name: /full-width-cluster/i })).toHaveClass('w-full')
    })

    it('renders node and pod count per row', () => {
      const clusters = [makeCluster({ nodeCount: 4, podCount: 20 })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      // Node and pod counts are rendered inline with translated labels (e.g. "4 nodes")
      expect(screen.getAllByText(/\b4\b/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/\b20\b/).length).toBeGreaterThan(0)
    })

    it('shows AI actions for unhealthy clusters', () => {
      const clusters = [makeCluster({ healthy: false, reachable: true })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTestId('ai-actions')).toBeInTheDocument()
    })

    it('does NOT show AI actions for healthy clusters', () => {
      const clusters = [makeCluster({ healthy: true, reachable: true })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.queryByTestId('ai-actions')).not.toBeInTheDocument()
    })

    it('shows AI actions for unreachable clusters', () => {
      const clusters = [makeCluster({ reachable: false })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTestId('ai-actions')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('cluster detail modal', () => {
    it('opens ClusterDetailModal when a cluster row is clicked', async () => {
      const clusters = [makeCluster({ name: 'click-me' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      await userEvent.click(screen.getByText('click-me'))
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument()
      // Cluster name appears both in the list row and in the modal
      expect(screen.getAllByText('click-me').length).toBeGreaterThanOrEqual(2)
    })

    it('closes modal when onClose is called', async () => {
      const clusters = [makeCluster({ name: 'click-me' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      await userEvent.click(screen.getByText('click-me'))
      await userEvent.click(screen.getByText('close'))
      expect(screen.queryByTestId('cluster-detail-modal')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('error banners', () => {
    it('shows error banner when error is set and no data', () => {
      setupDefaults({ error: 'kubeconfig not found', clusters: [] })
      render(<ClusterHealth />)
      expect(screen.getByText('clusterHealth.unableToConnect')).toBeInTheDocument()
    })

    it('shows token-expired summary banner when tokenExpiredClusters > 0', () => {
      const clusters = [makeCluster({ reachable: false, errorMessage: 'token expired' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTitle(/reauthenticateToRestore/i)).toBeInTheDocument()
    })

    it('shows offline summary banner when networkOfflineClusters > 0', () => {
      const clusters = [makeCluster({ reachable: false, errorMessage: 'refused' })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTitle(/checkNetworkVpn/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('GPU data', () => {
    it('shows GPU count in footer when GPUs exist', () => {
      const clusters = [makeCluster()]
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: clusters,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastRefresh: null,
        consecutiveFailures: 0,
        isFailed: false,
      })
      mockUseCachedGPUNodes.mockReturnValue({
        nodes: [{ cluster: 'prod-cluster', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' }],
        isDemoFallback: false,
        isRefreshing: false,
      })
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
      mockUseCardData.mockReturnValue(makeCardDataReturn(clusters))
      render(<ClusterHealth />)
      expect(screen.getByTitle(/totalGpusTitle/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true in demo mode', () => {
      mockIsDemoMode.mockReturnValue(true)
      setupDefaults()
      render(<ClusterHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true })
      )
    })

    it('passes isFailed=true when error set and no data', () => {
      setupDefaults({ error: 'fail', clusters: [] })
      render(<ClusterHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true })
      )
    })
  })

  // -------------------------------------------------------------------------
  // #5283 — Strengthened ClusterHealth tests
  // -------------------------------------------------------------------------

  describe('rendering quality (#5283)', () => {
    it('renders all four status tiles (healthy, unhealthy, auth-error, offline)', () => {
      const clusters = [
        makeCluster({ name: 'c1', healthy: true, reachable: true }),
        makeCluster({ name: 'c2', healthy: false, reachable: true }),
        makeCluster({ name: 'c3', reachable: false, errorMessage: 'token expired' }),
        makeCluster({ name: 'c4', reachable: false, errorMessage: 'connection refused' }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)

      // Verify all four status tile categories are rendered
      const healthyTiles = screen.getAllByTitle(/healthyTooltip/)
      const unhealthyTiles = screen.getAllByTitle(/unhealthyTooltip/)
      const authTiles = screen.getAllByTitle(/authErrorTooltip/)
      const offlineTiles = screen.getAllByTitle(/offlineTooltip/)

      expect(healthyTiles.length).toBeGreaterThanOrEqual(1)
      expect(unhealthyTiles.length).toBeGreaterThanOrEqual(1)
      expect(authTiles.length).toBeGreaterThanOrEqual(1)
      expect(offlineTiles.length).toBeGreaterThanOrEqual(1)
    })

    it('does NOT show an error message for healthy clusters', () => {
      const clusters = [makeCluster({ healthy: true, reachable: true })]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      // No error banners should be present
      expect(screen.queryByText('clusterHealth.unableToConnect')).not.toBeInTheDocument()
      expect(screen.queryByTitle(/reauthenticateToRestore/i)).not.toBeInTheDocument()
      expect(screen.queryByTitle(/checkNetworkVpn/i)).not.toBeInTheDocument()
    })

    it('renders multiple clusters in the list, each with distinct names', () => {
      const clusters = [
        makeCluster({ name: 'alpha-cluster', nodeCount: 2 }),
        makeCluster({ name: 'beta-cluster', nodeCount: 5 }),
        makeCluster({ name: 'gamma-cluster', nodeCount: 8 }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByText('alpha-cluster')).toBeInTheDocument()
      expect(screen.getByText('beta-cluster')).toBeInTheDocument()
      expect(screen.getByText('gamma-cluster')).toBeInTheDocument()
    })

    it('does NOT render skeleton when data is loaded', () => {
      const clusters = [makeCluster()]
      setupDefaults({ clusters, showSkeleton: false })
      render(<ClusterHealth />)
      expect(screen.queryByTestId('skeleton-stats')).not.toBeInTheDocument()
      expect(screen.queryByTestId('skeleton-list')).not.toBeInTheDocument()
    })

    it('renders both skeleton variants during loading', () => {
      setupDefaults({ showSkeleton: true })
      render(<ClusterHealth />)
      expect(screen.getByTestId('skeleton-stats')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument()
    })

    it('renders search input for cluster list', () => {
      const clusters = [makeCluster()]
      setupDefaults({ clusters })
      render(<ClusterHealth />)
      expect(screen.getByTestId('search-input')).toBeInTheDocument()
    })

    it('computes correct stats with mixed cluster states', () => {
      const clusters = [
        makeCluster({ name: 'h1', healthy: true, reachable: true, nodeCount: 3, podCount: 10 }),
        makeCluster({ name: 'h2', healthy: true, reachable: true, nodeCount: 2, podCount: 5 }),
        makeCluster({ name: 'u1', healthy: false, reachable: true, nodeCount: 1, podCount: 3 }),
        makeCluster({ name: 'off1', reachable: false, errorMessage: 'refused', nodeCount: 0, podCount: 0 }),
      ]
      setupDefaults({ clusters })
      render(<ClusterHealth />)

      // Verify all expected status tile categories are present
      expect(screen.getAllByTitle(/healthyTooltip/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByTitle(/unhealthyTooltip/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByTitle(/offlineTooltip/).length).toBeGreaterThanOrEqual(1)

      // Verify all cluster names are rendered
      expect(screen.getByText('h1')).toBeInTheDocument()
      expect(screen.getByText('h2')).toBeInTheDocument()
      expect(screen.getByText('u1')).toBeInTheDocument()
      expect(screen.getByText('off1')).toBeInTheDocument()
    })

    it('passes consecutiveFailures to useCardLoadingState', () => {
      setupDefaults({ error: 'backend error', clusters: [] })
      render(<ClusterHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ consecutiveFailures: expect.any(Number) })
      )
    })

    it('passes hasAnyData correctly based on cluster count', () => {
      setupDefaults({ clusters: [] })
      render(<ClusterHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: false })
      )
    })

    it('passes hasAnyData=true when clusters exist', () => {
      setupDefaults({ clusters: [makeCluster()] })
      render(<ClusterHealth />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true })
      )
    })
  })
})