import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeploymentStatus } from '../DeploymentStatus'
import type { Deployment } from '../../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockDrillToDeployment = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToDeployment: mockDrillToDeployment }),
}))

const mockUseCachedDeployments = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedDeployments: () => mockUseCachedDeployments(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockStatusFilter = vi.fn(() => 'all')
const mockSetStatusFilter = vi.fn()
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useStatusFilter: () => ({
      statusFilter: mockStatusFilter(),
      setStatusFilter: mockSetStatusFilter,
    }),
    useCardFilters: (_data: Deployment[]) => ({ filtered: _data }),
    useCardData: vi.fn((data: Deployment[]) => ({
      items: data,
      totalItems: data.length,
      currentPage: 1,
      totalPages: 1,
      itemsPerPage: 5,
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
    })),
    commonComparators: actual.commonComparators,
  }
})

// Stub UI components
vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ variant }: { variant: string }) => <div data-testid={`skeleton-${variant}`} />,
}))

vi.mock('../../ui/Pagination', () => ({
  Pagination: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination">Page {currentPage}/{totalPages}</div>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
  CardSearchInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder: string
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardAIActions: () => <div data-testid="ai-actions" />,
  CardEmptyState: ({ title, message }: { title?: string; message?: string; icon?: unknown }) => <div data-testid="empty-state">{title}{message && <span>{message}</span>}</div>,
}))

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'my-deploy',
    namespace: 'default',
    cluster: 'prod-cluster',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    progress: 100,
    image: 'nginx:1.25.0',
    ...overrides,
  }
}

function setupHooks({
  deployments = [] as Deployment[],
  isLoading = false,
  isRefreshing = false,
  isDemoFallback = false,
  isFailed = false,
  consecutiveFailures = 0,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseCachedDeployments.mockReturnValue({
    deployments,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStatusFilter.mockReturnValue('all')
    setupHooks()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeleton when showSkeleton=true', () => {
      setupHooks({ showSkeleton: true })
      render(<DeploymentStatus />)
      expect(screen.getAllByTestId(/skeleton/).length).toBeGreaterThan(0)
    })

    it('does not render deployment rows while loading', () => {
      setupHooks({
        showSkeleton: true,
        deployments: [makeDeployment()],
      })
      render(<DeploymentStatus />)
      expect(screen.queryByText('my-deploy')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state when showEmptyState=true and no filtered deployments', () => {
      setupHooks({ showEmptyState: true, deployments: [] })
      render(<DeploymentStatus />)
      expect(screen.getByText('No deployments found')).toBeInTheDocument()
    })

    it('does NOT show global empty state when deployments exist', () => {
      setupHooks({ deployments: [makeDeployment()] })
      render(<DeploymentStatus />)
      expect(screen.queryByText('No deployments found')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('deployment list', () => {
    it('renders deployment name', () => {
      setupHooks({ deployments: [makeDeployment({ name: 'api-gateway' })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('api-gateway')).toBeInTheDocument()
    })

    it('renders namespace', () => {
      setupHooks({ deployments: [makeDeployment({ namespace: 'kube-system' })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('kube-system')).toBeInTheDocument()
    })

    it('renders cluster badge', () => {
      setupHooks({ deployments: [makeDeployment({ cluster: 'us-east' })] })
      render(<DeploymentStatus />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('us-east')
    })

    it('renders ready replica count', () => {
      setupHooks({ deployments: [makeDeployment({ readyReplicas: 2, replicas: 4 })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('2/4 ready')).toBeInTheDocument()
    })

    it('renders version extracted from image tag', () => {
      setupHooks({ deployments: [makeDeployment({ image: 'myrepo/app:v2.3.1' })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('v2.3.1')).toBeInTheDocument()
    })

    it('renders "latest" when image has no tag', () => {
      setupHooks({ deployments: [makeDeployment({ image: 'nginx' })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('latest')).toBeInTheDocument()
    })

    it('renders "unknown" when image is undefined', () => {
      setupHooks({ deployments: [makeDeployment({ image: undefined })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('unknown')).toBeInTheDocument()
    })

    it('truncates long image digest to 12 chars', () => {
      const digest = 'sha256:abcdef1234567890abcdef'
      setupHooks({ deployments: [makeDeployment({ image: `nginx:${digest}` })] })
      render(<DeploymentStatus />)
      // Last segment after splitting on ':' is 'abcdef1234567890abcdef' (22 chars > 20), truncated to 12
      expect(screen.getByText('abcdef123456')).toBeInTheDocument()
    })

    it('shows "no match" message when paginatedDeployments is empty', () => {
      // useCardData returns empty after filters applied
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      expect(
        screen.getByText('No deployments match the current filters')
      ).toBeInTheDocument()
    })

    it('renders multiple deployments', () => {
      setupHooks({
        deployments: [
          makeDeployment({ name: 'alpha', cluster: 'c1', namespace: 'ns1' }),
          makeDeployment({ name: 'beta', cluster: 'c2', namespace: 'ns2' }),
        ],
      })
      render(<DeploymentStatus />)
      expect(screen.getByText('alpha')).toBeInTheDocument()
      expect(screen.getByText('beta')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('status display', () => {
    it('shows deployment count in header', () => {
      setupHooks({ deployments: [makeDeployment(), makeDeployment({ name: 'b', cluster: 'c2', namespace: 'ns2' })] })
      render(<DeploymentStatus />)
      expect(screen.getByText('2 deployments')).toBeInTheDocument()
    })

    it('renders all four status filter pills', () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      expect(screen.getByText('all')).toBeInTheDocument()
      expect(screen.getByText('running')).toBeInTheDocument()
      expect(screen.getByText('deploying')).toBeInTheDocument()
      expect(screen.getByText('failed')).toBeInTheDocument()
    })

    it('shows AI actions only for failed deployments', () => {
      setupHooks({
        deployments: [
          makeDeployment({ name: 'ok', status: 'running' }),
          makeDeployment({ name: 'broken', cluster: 'c2', namespace: 'ns2', status: 'failed' }),
        ],
      })
      render(<DeploymentStatus />)
      const aiActions = screen.getAllByTestId('ai-actions')
      expect(aiActions).toHaveLength(1)
    })

    it('does NOT show AI actions for running deployments', () => {
      setupHooks({ deployments: [makeDeployment({ status: 'running' })] })
      render(<DeploymentStatus />)
      expect(screen.queryByTestId('ai-actions')).not.toBeInTheDocument()
    })

    it('uses "unknown" cluster when deployment.cluster is undefined', () => {
      setupHooks({ deployments: [makeDeployment({ cluster: undefined })] })
      render(<DeploymentStatus />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('unknown')
    })
  })

  // -------------------------------------------------------------------------
  describe('status filter pills', () => {
    it('calls setStatusFilter and goToPage when a pill is clicked', async () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      await userEvent.click(screen.getByText('failed'))
      expect(mockSetStatusFilter).toHaveBeenCalledWith('failed')
    })

    it('clicking "all" pill calls setStatusFilter with "all"', async () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      await userEvent.click(screen.getByText('all'))
      expect(mockSetStatusFilter).toHaveBeenCalledWith('all')
    })
  })

  // -------------------------------------------------------------------------
  describe('drill-down on click', () => {
    it('calls drillToDeployment with correct args when row is clicked', async () => {
      const deployment = makeDeployment({
        name: 'web',
        namespace: 'prod',
        cluster: 'east',
        status: 'running',
        replicas: 2,
        readyReplicas: 2,
        progress: 100,
        image: 'app:v1.0',
      })
      setupHooks({ deployments: [deployment] })
      render(<DeploymentStatus />)
      await userEvent.click(screen.getByText('web'))
      expect(mockDrillToDeployment).toHaveBeenCalledWith(
        'east',
        'prod',
        'web',
        expect.objectContaining({
          status: 'running',
          version: 'v1.0',
          replicas: 2,
          readyReplicas: 2,
          progress: 100,
        })
      )
    })

    it('uses "unknown" cluster in drill-down when cluster is undefined', async () => {
      setupHooks({ deployments: [makeDeployment({ cluster: undefined })] })
      render(<DeploymentStatus />)
      await userEvent.click(screen.getByText('my-deploy'))
      expect(mockDrillToDeployment).toHaveBeenCalledWith(
        'unknown',
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      )
    })
  })

  // -------------------------------------------------------------------------
  describe('pagination', () => {
    it('does not render Pagination when needsPagination=false', () => {
      setupHooks({ deployments: [makeDeployment()] })
      render(<DeploymentStatus />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })

    it('renders Pagination when needsPagination=true and itemsPerPage is a number', async () => {
      // Override useCardData for this test via module mock
      const { useCardData } = await import('../../../lib/cards/cardHooks')
      vi.mocked(useCardData).mockReturnValueOnce({
        items: [], totalItems: 0, currentPage: 2, totalPages: 3, itemsPerPage: 5,
        goToPage: vi.fn(), needsPagination: true, setItemsPerPage: vi.fn(),
        filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } },
        sorting: { sortBy: 'status', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
        containerRef: { current: null }, containerStyle: {},
      } as ReturnType<typeof useCardData>)

      setupHooks({ deployments: [makeDeployment()] })
      render(<DeploymentStatus />)
      await waitFor(() =>
        expect(screen.getByTestId('pagination')).toBeInTheDocument()
      )
    })
  })

  // -------------------------------------------------------------------------
  describe('UI controls', () => {
    it('renders search input', () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      expect(screen.getByTestId('search-input')).toBeInTheDocument()
    })

    it('renders cluster filter component', () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      expect(screen.getByTestId('cluster-filter')).toBeInTheDocument()
    })

    it('renders card controls (sort/limit)', () => {
      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      expect(screen.getByTestId('card-controls')).toBeInTheDocument()
    })

    it('shows cluster count indicator when localClusterFilter has entries', async () => {
      const { useCardData } = await import('../../../lib/cards/cardHooks')
      vi.mocked(useCardData).mockReturnValueOnce({
        items: [], totalItems: 0, currentPage: 1, totalPages: 1, itemsPerPage: 5,
        goToPage: vi.fn(), needsPagination: false, setItemsPerPage: vi.fn(),
        filters: { search: '', setSearch: vi.fn(), localClusterFilter: ['c1', 'c2'], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: ['c1', 'c2', 'c3'], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } },
        sorting: { sortBy: 'status', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
        containerRef: { current: null }, containerStyle: {},
      } as ReturnType<typeof useCardData>)

      setupHooks({ deployments: [] })
      render(<DeploymentStatus />)
      await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument())
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes correct args to useCardLoadingState', () => {
      const deployments = [makeDeployment()]
      setupHooks({ deployments, isFailed: true, consecutiveFailures: 3 })
      render(<DeploymentStatus />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 3,
          hasAnyData: true,
        })
      )
    })
  })
})