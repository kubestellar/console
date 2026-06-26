/**
 * Unit tests for PodIssues card component.
 *
 * Tests cover: loading skeleton, API failure empty state, no-clusters state,
 * all-healthy state, issues list rendering (name/namespace/status/restarts/
 * cluster), drill-down on row click, search filtering, pagination footer,
 * and LimitedAccessWarning rendering.
 *
 * Closes #14769
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { PodIssues } from './PodIssues'
import type { PodIssue } from '../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

const mockUseCachedPodIssues = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => mockUseCachedPodIssues(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockDrillToPod = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod: mockDrillToPod }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: (field: string) => (a: Record<string, string>, b: Record<string, string>) =>
      (a[field] ?? '').localeCompare(b[field] ?? ''),
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type, rows }: { type: string; rows: number }) => (
    <div data-testid="card-skeleton" data-type={type} data-rows={rows} />
  ),
  CardEmptyState: ({
    title,
    message,
    variant,
    icon: Icon,
  }: {
    title: string
    message?: string
    variant?: string
    icon?: React.ComponentType
  }) => (
    <div data-testid="card-empty-state" data-variant={variant}>
      <div data-testid="empty-title">{title}</div>
      {message && <div data-testid="empty-message">{message}</div>}
    </div>
  ),
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
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardListItem: ({
    children,
    onClick,
    dataTour,
  }: {
    children: ReactNode
    onClick?: () => void
    dataTour?: string
  }) => (
    <div data-testid="card-list-item" data-tour={dataTour} onClick={onClick} role="button" tabIndex={0}>
      {children}
    </div>
  ),
  CardPaginationFooter: ({
    needsPagination,
    currentPage,
    totalPages,
  }: {
    needsPagination: boolean
    currentPage: number
    totalPages: number
  }) =>
    needsPagination ? (
      <div data-testid="pagination" data-page={currentPage} data-total={totalPages} />
    ) : null,
  CardAIActions: () => <div data-testid="card-ai-actions" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color?: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../ui/LimitedAccessWarning', () => ({
  LimitedAccessWarning: ({ hasError }: { hasError: boolean }) => (
    <div data-testid="limited-access-warning" data-has-error={String(hasError)} />
  ),
}))

vi.mock('../../lib/cards/statusColors', () => ({
  getStatusColors: () => ({ bg: '', border: '', text: '', iconBg: '' }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePodIssue = (overrides: Partial<PodIssue> = {}): PodIssue => ({
  name: 'crashed-pod',
  namespace: 'default',
  cluster: 'prod-cluster',
  status: 'CrashLoopBackOff',
  restarts: 5,
  reason: 'Error',
  issues: ['Exit code 1'],
  ...overrides,
})

const defaultPodIssuesReturn = {
  issues: [makePodIssue()],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  error: null,
}

const defaultClustersReturn = {
  deduplicatedClusters: [{ name: 'prod-cluster' }],
}

const makeCardDataReturn = (items: PodIssue[] = [makePodIssue()]) => ({
  items,
  totalItems: items.length,
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
    availableClusters: [{ name: 'prod-cluster' }],
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
})

function setup(overrides: Partial<typeof defaultPodIssuesReturn> = {}) {
  mockUseCachedPodIssues.mockReturnValue({ ...defaultPodIssuesReturn, ...overrides })
  mockUseClusters.mockReturnValue(defaultClustersReturn)
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockUseCardData.mockReturnValue(makeCardDataReturn(overrides.issues ?? defaultPodIssuesReturn.issues))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PodIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // --- Loading skeleton -----------------------------------------------------

  it('renders CardSkeleton when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<PodIssues />)
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('card-skeleton').getAttribute('data-type')).toBe('list')
  })

  // --- Error empty state ----------------------------------------------------

  it('shows error empty state when fetch failed and no issues', () => {
    setup({ isFailed: true, issues: [], error: 'API down' })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<PodIssues />)
    expect(screen.getByTestId('card-empty-state').getAttribute('data-variant')).toBe('error')
    expect(screen.getByTestId('empty-title').textContent).toMatch(/failedLoadTitle/)
  })

  it('shows error message from hook error field', () => {
    setup({ isFailed: true, issues: [], error: 'cluster unreachable' })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<PodIssues />)
    expect(screen.getByTestId('empty-message').textContent).toBe('cluster unreachable')
  })

  // --- Empty states ---------------------------------------------------------

  it('shows all-healthy empty state when no issues and clusters exist', () => {
    setup({ issues: [] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<PodIssues />)
    const emptyState = screen.getByTestId('card-empty-state')
    expect(emptyState.getAttribute('data-variant')).toBe('success')
    expect(screen.getByTestId('empty-title').textContent).toMatch(/allHealthy/)
  })

  it('shows no-clusters empty state when no issues and no clusters', () => {
    setup({ issues: [] })
    // Override clusters AFTER setup (setup resets to defaultClustersReturn)
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<PodIssues />)
    const title = screen.getByTestId('empty-title').textContent ?? ''
    expect(title).toMatch(/noClustersConfigured/)
  })

  // --- Issues list ----------------------------------------------------------

  it('renders a row for each issue', () => {
    render(<PodIssues />)
    expect(screen.getAllByTestId('card-list-item').length).toBe(1)
  })

  it('renders pod name in each row', () => {
    render(<PodIssues />)
    expect(screen.getByText('crashed-pod')).toBeInTheDocument()
  })

  it('renders namespace in each row', () => {
    render(<PodIssues />)
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('renders pod status', () => {
    render(<PodIssues />)
    expect(screen.getByText('CrashLoopBackOff')).toBeInTheDocument()
  })

  it('renders restart count when > 0', () => {
    render(<PodIssues />)
    expect(screen.getByText('5 restarts')).toBeInTheDocument()
  })

  it('renders cluster badge per issue', () => {
    render(<PodIssues />)
    expect(screen.getByTestId('cluster-badge')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge').textContent).toBe('prod-cluster')
  })

  it('renders issue messages in the row', () => {
    render(<PodIssues />)
    expect(screen.getByText('Exit code 1')).toBeInTheDocument()
  })

  it('renders AI actions per row', () => {
    render(<PodIssues />)
    expect(screen.getByTestId('card-ai-actions')).toBeInTheDocument()
  })

  it('does not show restart count when restarts is 0', () => {
    setup({ issues: [makePodIssue({ restarts: 0 })] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([makePodIssue({ restarts: 0 })]))
    render(<PodIssues />)
    expect(screen.queryByText(/restarts/)).not.toBeInTheDocument()
  })

  // --- Header badge ---------------------------------------------------------

  it('renders issues count badge in header', () => {
    render(<PodIssues />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge').textContent).toContain('1 issues')
  })

  // --- Drill-down -----------------------------------------------------------

  it('calls drillToPod when issue row is clicked', async () => {
    const user = userEvent.setup()
    render(<PodIssues />)

    await user.click(screen.getByTestId('card-list-item'))

    expect(mockDrillToPod).toHaveBeenCalledWith(
      'prod-cluster',
      'default',
      'crashed-pod',
      expect.objectContaining({ status: 'CrashLoopBackOff' })
    )
  })

  it('does not call drillToPod when cluster is missing', async () => {
    const issueNoCluster = makePodIssue({ cluster: undefined })
    setup({ issues: [issueNoCluster] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([issueNoCluster]))

    const user = userEvent.setup()
    render(<PodIssues />)

    await user.click(screen.getByTestId('card-list-item'))
    expect(mockDrillToPod).not.toHaveBeenCalled()
  })

  // --- Search ---------------------------------------------------------------

  it('renders search input', () => {
    render(<PodIssues />)
    expect(screen.getByTestId('card-search')).toBeInTheDocument()
  })

  it('renders controls row', () => {
    render(<PodIssues />)
    expect(screen.getByTestId('card-controls')).toBeInTheDocument()
  })

  // --- Pagination -----------------------------------------------------------

  it('renders pagination footer when needsPagination is true', () => {
    mockUseCardData.mockReturnValue({
      ...makeCardDataReturn(),
      needsPagination: true,
      totalPages: 3,
      currentPage: 1,
      itemsPerPage: 5,
    })
    render(<PodIssues />)
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
    expect(screen.getByTestId('pagination').getAttribute('data-total')).toBe('3')
  })

  it('does not render pagination footer when not needed', () => {
    render(<PodIssues />)
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
  })

  // --- LimitedAccessWarning -------------------------------------------------

  it('renders LimitedAccessWarning with hasError=false when no error', () => {
    render(<PodIssues />)
    const warning = screen.getByTestId('limited-access-warning')
    expect(warning.getAttribute('data-has-error')).toBe('false')
  })

  it('renders LimitedAccessWarning with hasError=true when error present', () => {
    setup({ error: 'partial access' })
    render(<PodIssues />)
    const warning = screen.getByTestId('limited-access-warning')
    expect(warning.getAttribute('data-has-error')).toBe('true')
  })

  // --- Multiple issues ------------------------------------------------------

  it('renders multiple issue rows', () => {
    const issues = [
      makePodIssue({ name: 'pod-a' }),
      makePodIssue({ name: 'pod-b', status: 'Pending', restarts: 0 }),
      makePodIssue({ name: 'pod-c', status: 'OOMKilled', restarts: 12 }),
    ]
    setup({ issues })
    mockUseCardData.mockReturnValue(makeCardDataReturn(issues))

    render(<PodIssues />)
    expect(screen.getAllByTestId('card-list-item').length).toBe(3)
    expect(screen.getByText('pod-a')).toBeInTheDocument()
    expect(screen.getByText('pod-b')).toBeInTheDocument()
    expect(screen.getByText('pod-c')).toBeInTheDocument()
  })

  it('first row gets data-tour="drilldown" attribute', () => {
    const issues = [makePodIssue({ name: 'pod-a' }), makePodIssue({ name: 'pod-b' })]
    setup({ issues })
    mockUseCardData.mockReturnValue(makeCardDataReturn(issues))

    render(<PodIssues />)
    const rows = screen.getAllByTestId('card-list-item')
    expect(rows[0].getAttribute('data-tour')).toBe('drilldown')
    expect(rows[1].getAttribute('data-tour')).toBeFalsy()
  })
})
