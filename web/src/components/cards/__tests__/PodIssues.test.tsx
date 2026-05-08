import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PodIssues } from '../PodIssues'
import type { PodIssue } from '../../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseCachedPodIssues = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => mockUseCachedPodIssues(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockUseCardData = vi.fn()
vi.mock('../../../lib/cards/cardHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cards/cardHooks')>()
  return {
    ...actual,
    useCardData: (...args: unknown[]) => mockUseCardData(...args),
  }
})

const mockDrillToPod = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod: mockDrillToPod }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../ui/LimitedAccessWarning', () => ({
  LimitedAccessWarning: ({ hasError }: { hasError: boolean }) =>
    hasError ? <div data-testid="limited-access-warning" /> : null,
}))

vi.mock('../../../lib/cards/statusColors', () => ({
  getStatusColors: () => ({
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    iconBg: 'bg-red-500/20',
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
  CardEmptyState: ({
    title,
    message,
  }: {
    title: string
    message: string
  }) => (
    <div data-testid="card-empty-state">
      <p>{title}</p>
      <p>{message}</p>
    </div>
  ),
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardListItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick: () => void
  }) => (
    <div role="button" tabIndex={0} data-testid="card-list-item" onClick={onClick}>
      {children}
    </div>
  ),
  CardPaginationFooter: ({ needsPagination }: { needsPagination: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
  CardAIActions: () => <div data-testid="ai-actions" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'crashing-pod',
    namespace: 'default',
    cluster: 'prod',
    status: 'CrashLoopBackOff',
    restarts: 5,
    issues: ['Container exited with code 1'],
    ...overrides,
  } as PodIssue
}

function makeCardDataReturn(issues: PodIssue[] = []) {
  return {
    items: issues,
    totalItems: issues.length,
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
  }
}

function setupDefaults({
  issues = [] as PodIssue[],
  clusterCount = 1,
  isLoading = false,
  isRefreshing = false,
  isDemoFallback = false,
  isFailed = false,
  consecutiveFailures = 0,
  error = null as string | null,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: Array.from({ length: clusterCount }, (_, index) => ({ name: `cluster-${index}` })),
  })
  mockUseCachedPodIssues.mockReturnValue({
    issues,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
  mockUseCardData.mockReturnValue(makeCardDataReturn(issues))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PodIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('shows CardSkeleton when showSkeleton=true', () => {
      setupDefaults({ showSkeleton: true })
      render(<PodIssues />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })

    it('does not render issue rows while loading', () => {
      setupDefaults({ showSkeleton: true, issues: [makePodIssue()] })
      render(<PodIssues />)
      expect(screen.queryByText('crashing-pod')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('error state', () => {
    it('shows error CardEmptyState when isFailed and no data', () => {
      setupDefaults({ isFailed: true, error: 'API unavailable', issues: [] })
      render(<PodIssues />)
      expect(screen.getByText('Failed to load pod data')).toBeInTheDocument()
      expect(screen.getByText('API unavailable')).toBeInTheDocument()
    })

    it('shows fallback error message when error is null', () => {
      setupDefaults({ isFailed: true, error: null, issues: [] })
      render(<PodIssues />)
      expect(screen.getByText('Pod API is unavailable')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('all-healthy empty state', () => {
    it('shows all-healthy CardEmptyState when clusters exist but no issues were found', () => {
      setupDefaults({ issues: [], clusterCount: 1 })
      render(<PodIssues />)
      expect(screen.getByText('All pods healthy')).toBeInTheDocument()
      expect(screen.getByText('No issues detected')).toBeInTheDocument()
    })

    it('shows a neutral empty state when no clusters are connected', () => {
      setupDefaults({ issues: [], clusterCount: 0 })
      render(<PodIssues />)
      expect(screen.getByText('No clusters connected')).toBeInTheDocument()
      expect(screen.getByText('Pod health will appear here after you connect a cluster')).toBeInTheDocument()
      expect(screen.queryByText('All pods healthy')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('showEmptyState', () => {
    it('shows no-pod-issues message when showEmptyState=true', () => {
      // Need raw issues > 0 so the all-healthy path is skipped
      setupDefaults({ showEmptyState: true, issues: [makePodIssue()] })
      // Override useCardData to return empty items (simulating filter emptying the list)
      mockUseCardData.mockReturnValue({ ...makeCardDataReturn([]), items: [] })
      render(<PodIssues />)
      expect(screen.getByText('No pod issues')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('issue list', () => {
    it('renders pod name', () => {
      setupDefaults({ issues: [makePodIssue({ name: 'my-bad-pod' })] })
      render(<PodIssues />)
      expect(screen.getByText('my-bad-pod')).toBeInTheDocument()
    })

    it('renders namespace', () => {
      setupDefaults({ issues: [makePodIssue({ namespace: 'kube-system' })] })
      render(<PodIssues />)
      expect(screen.getByText('kube-system')).toBeInTheDocument()
    })

    it('renders cluster badge', () => {
      setupDefaults({ issues: [makePodIssue({ cluster: 'us-west' })] })
      render(<PodIssues />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('us-west')
    })

    it('renders "unknown" cluster when cluster is undefined', () => {
      setupDefaults({ issues: [makePodIssue({ cluster: undefined })] })
      render(<PodIssues />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('unknown')
    })

    it('renders status badge', () => {
      setupDefaults({ issues: [makePodIssue({ status: 'OOMKilled' })] })
      render(<PodIssues />)
      expect(screen.getByText('OOMKilled')).toBeInTheDocument()
    })

    it('renders restart count when > 0', () => {
      setupDefaults({ issues: [makePodIssue({ restarts: 12 })] })
      render(<PodIssues />)
      expect(screen.getByText('12 restarts')).toBeInTheDocument()
    })

    it('does NOT render restart text when restarts = 0', () => {
      setupDefaults({ issues: [makePodIssue({ restarts: 0 })] })
      render(<PodIssues />)
      expect(screen.queryByText(/restarts/)).not.toBeInTheDocument()
    })

    it('renders issue messages joined by comma', () => {
      setupDefaults({
        issues: [makePodIssue({ issues: ['ImagePullError', 'BackOff'] })],
      })
      render(<PodIssues />)
      expect(screen.getByText('ImagePullError, BackOff')).toBeInTheDocument()
    })

    it('renders AI actions for every issue', () => {
      setupDefaults({
        issues: [makePodIssue(), makePodIssue({ name: 'pod2', namespace: 'ns2' })],
      })
      render(<PodIssues />)
      expect(screen.getAllByTestId('ai-actions')).toHaveLength(2)
    })

    it('renders multiple issues', () => {
      setupDefaults({
        issues: [
          makePodIssue({ name: 'alpha' }),
          makePodIssue({ name: 'beta', namespace: 'ns2' }),
        ],
      })
      render(<PodIssues />)
      expect(screen.getByText('alpha')).toBeInTheDocument()
      expect(screen.getByText('beta')).toBeInTheDocument()
    })

    it('shows issue count in header badge', () => {
      setupDefaults({ issues: [makePodIssue(), makePodIssue({ name: 'p2', namespace: 'n2' })] })
      render(<PodIssues />)
      expect(screen.getByTestId('status-badge')).toHaveTextContent('2 issues')
    })
  })

  // -------------------------------------------------------------------------
  describe('status icon mapping', () => {
    it('shows OOM icon tooltip for OOMKilled status', () => {
      setupDefaults({ issues: [makePodIssue({ status: 'OOMKilled' })] })
      render(<PodIssues />)
      // The CardListItem wraps the icon div with a title
      const iconDiv = document.querySelector('[title="Out of Memory - Pod exceeded memory limits"]')
      expect(iconDiv).toBeInTheDocument()
    })

    it('shows Image icon tooltip for ImagePullBackOff status', () => {
      setupDefaults({ issues: [makePodIssue({ status: 'ImagePullBackOff' })] })
      render(<PodIssues />)
      const iconDiv = document.querySelector('[title="Image Pull Error - Failed to pull container image"]')
      expect(iconDiv).toBeInTheDocument()
    })

    it('shows Pending icon tooltip for Pending status', () => {
      setupDefaults({ issues: [makePodIssue({ status: 'Pending' })] })
      render(<PodIssues />)
      const iconDiv = document.querySelector('[title="Pending - Pod is waiting to be scheduled"]')
      expect(iconDiv).toBeInTheDocument()
    })

    it('shows Restart icon tooltip for CrashLoopBackOff status', () => {
      setupDefaults({ issues: [makePodIssue({ status: 'CrashLoopBackOff' })] })
      render(<PodIssues />)
      const iconDiv = document.querySelector('[title="Restart Loop - Pod is repeatedly crashing"]')
      expect(iconDiv).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('drill-down on click', () => {
    it('calls drillToPod with correct args when row clicked', async () => {
      const issue = makePodIssue({
        name: 'web-pod',
        namespace: 'prod',
        cluster: 'east',
        status: 'CrashLoopBackOff',
        restarts: 3,
        issues: ['exited 1'],
      })
      setupDefaults({ issues: [issue] })
      render(<PodIssues />)
      await userEvent.click(screen.getByTestId('card-list-item'))
      expect(mockDrillToPod).toHaveBeenCalledWith('east', 'prod', 'web-pod', {
        status: 'CrashLoopBackOff',
        restarts: 3,
        issues: ['exited 1'],
      })
    })

    it('does NOT call drillToPod when cluster is undefined', async () => {
      setupDefaults({ issues: [makePodIssue({ cluster: undefined })] })
      render(<PodIssues />)
      await userEvent.click(screen.getByTestId('card-list-item'))
      expect(mockDrillToPod).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe('controls & footer', () => {
    it('renders search input', () => {
      setupDefaults({ issues: [makePodIssue()] })
      render(<PodIssues />)
      expect(screen.getByTestId('search-input')).toBeInTheDocument()
    })

    it('renders card controls row', () => {
      setupDefaults({ issues: [makePodIssue()] })
      render(<PodIssues />)
      expect(screen.getByTestId('card-controls-row')).toBeInTheDocument()
    })

    it('shows LimitedAccessWarning when error exists', () => {
      setupDefaults({ issues: [makePodIssue()], error: 'forbidden' })
      render(<PodIssues />)
      expect(screen.getByTestId('limited-access-warning')).toBeInTheDocument()
    })

    it('does not show LimitedAccessWarning when no error', () => {
      setupDefaults({ issues: [makePodIssue()] })
      render(<PodIssues />)
      expect(screen.queryByTestId('limited-access-warning')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isFailed and consecutiveFailures', () => {
      setupDefaults({ isFailed: true, consecutiveFailures: 4, issues: [] })
      render(<PodIssues />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true, consecutiveFailures: 4 })
      )
    })

    it('passes isDemoData when isDemoFallback=true', () => {
      setupDefaults({ isDemoFallback: true, issues: [] })
      render(<PodIssues />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true })
      )
    })
  })
})