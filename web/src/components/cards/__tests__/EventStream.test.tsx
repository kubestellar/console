import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventStream } from '../EventStream'
import type { ClusterEvent } from '../../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  getDemoMode: () => true, default: () => true,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCachedEvents = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedEvents: (...args: unknown[]) => mockUseCachedEvents(...args),
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

const mockDrillToEvents = vi.fn()
const mockDrillToPod = vi.fn()
const mockDrillToDeployment = vi.fn()
const mockDrillToReplicaSet = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToEvents: mockDrillToEvents,
    drillToPod: mockDrillToPod,
    drillToDeployment: mockDrillToDeployment,
    drillToReplicaSet: mockDrillToReplicaSet,
  }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../ui/LimitedAccessWarning', () => ({
  LimitedAccessWarning: ({ hasError }: { hasError: boolean }) =>
    hasError ? <div data-testid="limited-access-warning" /> : null,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
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
  CardPaginationFooter: ({ needsPagination }: { needsPagination: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
  CardEmptyState: ({ title, message }: { title?: string; message?: string; icon?: unknown }) => <div data-testid="empty-state">{title}{message && <span>{message}</span>}</div>,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: 'Normal',
    message: 'Pod started successfully',
    object: 'Pod/my-pod',
    namespace: 'default',
    cluster: 'prod',
    count: 1,
    lastSeen: new Date().toISOString(),
    ...overrides,
  } as ClusterEvent
}

function makeCardDataReturn(events: ClusterEvent[] = []) {
  return {
    items: events,
    totalItems: events.length,
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
      sortBy: 'time',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }
}

function setupDefaults({
  events = [] as ClusterEvent[],
  isLoading = false,
  isRefreshing = false,
  isFailed = false,
  consecutiveFailures = 0,
  error = null as string | null,
  isDemoFallback = false,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseCachedEvents.mockReturnValue({
    events,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error,
    lastRefresh: null,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
  mockUseCardData.mockReturnValue(makeCardDataReturn(events))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    setupDefaults()
  })

  it('wraps content in DynamicCardErrorBoundary', () => {
    render(<EventStream />)
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('shows CardSkeleton when showSkeleton=true', () => {
      setupDefaults({ showSkeleton: true })
      render(<EventStream />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })

    it('does not render event rows while loading', () => {
      setupDefaults({ showSkeleton: true, events: [makeEvent()] })
      render(<EventStream />)
      expect(screen.queryByText('Pod started successfully')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state when showEmptyState=true', () => {
      setupDefaults({ showEmptyState: true })
      render(<EventStream />)
      const el = screen.getByTestId('empty-state')
      expect(el).toBeInTheDocument()
      expect(el.textContent).toContain('cards:eventStream.noEvents')
    })

    it('shows no-recent-events message when events list is empty after filtering', () => {
      setupDefaults({ events: [] })
      render(<EventStream />)
      expect(screen.getByText('cards:eventStream.noMatchingEvents')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('event list', () => {
    it('renders event message', () => {
      setupDefaults({ events: [makeEvent({ message: 'OOMKilled detected' })] })
      render(<EventStream />)
      expect(screen.getByText('OOMKilled detected')).toBeInTheDocument()
    })

    it('renders event object', () => {
      setupDefaults({ events: [makeEvent({ object: 'Deployment/api-server' })] })
      render(<EventStream />)
      expect(screen.getByText('Deployment/api-server')).toBeInTheDocument()
    })

    it('renders namespace', () => {
      setupDefaults({ events: [makeEvent({ namespace: 'kube-system' })] })
      render(<EventStream />)
      expect(screen.getByText('kube-system')).toBeInTheDocument()
    })

    it('renders cluster badge', () => {
      setupDefaults({ events: [makeEvent({ cluster: 'us-east' })] })
      render(<EventStream />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('us-east')
    })

    it('shows "unknown" cluster badge when cluster is undefined', () => {
      setupDefaults({ events: [makeEvent({ cluster: undefined })] })
      render(<EventStream />)
      expect(screen.getByTestId('cluster-badge')).toHaveTextContent('unknown')
    })

    it('shows count badge when count > 1', () => {
      setupDefaults({ events: [makeEvent({ count: 5 })] })
      render(<EventStream />)
      expect(screen.getByText('x5')).toBeInTheDocument()
    })

    it('does not show count badge when count is 1', () => {
      setupDefaults({ events: [makeEvent({ count: 1 })] })
      render(<EventStream />)
      expect(screen.queryByText('x1')).not.toBeInTheDocument()
    })

    it('renders multiple events', () => {
      setupDefaults({
        events: [
          makeEvent({ message: 'Alpha event' }),
          makeEvent({ message: 'Beta event', object: 'Pod/other', namespace: 'ns2' }),
        ],
      })
      render(<EventStream />)
      expect(screen.getByText('Alpha event')).toBeInTheDocument()
      expect(screen.getByText('Beta event')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('event styles', () => {
    it('applies Warning style for Warning type events', () => {
      setupDefaults({ events: [makeEvent({ type: 'Warning', message: 'Warn msg' })] })
      render(<EventStream />)
      const iconBox = screen.getByTitle('Warning event - Potential issue detected')
      expect(iconBox.className).toContain('bg-yellow-500/10')
    })

    it('applies Error style for Error type events', () => {
      setupDefaults({ events: [makeEvent({ type: 'Error', message: 'Err msg' })] })
      render(<EventStream />)
      const iconBox = screen.getByTitle('Error event - Action required')
      expect(iconBox.className).toContain('bg-red-500/10')
    })

    it('applies Normal/Info style for Normal type events', () => {
      setupDefaults({ events: [makeEvent({ type: 'Normal', message: 'Info msg' })] })
      render(<EventStream />)
      const iconBox = screen.getByTitle('Informational event')
      expect(iconBox.className).toContain('bg-blue-500/10')
    })
  })

  // -------------------------------------------------------------------------
  describe('drill-down on click', () => {
    it('calls drillToPod for Pod resource type', async () => {
      setupDefaults({
        events: [makeEvent({ object: 'Pod/my-pod', cluster: 'c1', namespace: 'ns1' })],
      })
      render(<EventStream />)
      await userEvent.click(screen.getByText('Pod started successfully'))
      expect(mockDrillToPod).toHaveBeenCalledWith('c1', 'ns1', 'my-pod', { fromEvent: true })
    })

    it('calls drillToDeployment for Deployment resource type', async () => {
      setupDefaults({
        events: [makeEvent({ object: 'Deployment/my-deploy', cluster: 'c1', namespace: 'ns1', message: 'Deploy event' })],
      })
      render(<EventStream />)
      await userEvent.click(screen.getByText('Deploy event'))
      expect(mockDrillToDeployment).toHaveBeenCalledWith('c1', 'ns1', 'my-deploy', { fromEvent: true })
    })

    it('calls drillToReplicaSet for ReplicaSet resource type', async () => {
      setupDefaults({
        events: [makeEvent({ object: 'ReplicaSet/rs-1', cluster: 'c1', namespace: 'ns1', message: 'RS event' })],
      })
      render(<EventStream />)
      await userEvent.click(screen.getByText('RS event'))
      expect(mockDrillToReplicaSet).toHaveBeenCalledWith('c1', 'ns1', 'rs-1', { fromEvent: true })
    })

    it('calls drillToEvents for generic resource type', async () => {
      setupDefaults({
        events: [makeEvent({ object: 'Service/my-svc', cluster: 'c1', namespace: 'ns1', message: 'Svc event' })],
      })
      render(<EventStream />)
      await userEvent.click(screen.getByText('Svc event'))
      expect(mockDrillToEvents).toHaveBeenCalledWith('c1', 'ns1', 'Service/my-svc')
    })

    it('does not call any drill-down when cluster is undefined', async () => {
      setupDefaults({
        events: [makeEvent({ object: 'Pod/p', cluster: undefined, message: 'No cluster' })],
      })
      render(<EventStream />)
      await userEvent.click(screen.getByText('No cluster'))
      expect(mockDrillToPod).not.toHaveBeenCalled()
      expect(mockDrillToEvents).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe('controls & footer', () => {
    it('renders search input', () => {
      setupDefaults({ events: [] })
      render(<EventStream />)
      expect(screen.getByTestId('search-input')).toBeInTheDocument()
    })

    it('renders card controls row', () => {
      setupDefaults({ events: [] })
      render(<EventStream />)
      expect(screen.getByTestId('card-controls-row')).toBeInTheDocument()
    })

    it('renders refresh indicator', () => {
      setupDefaults({ events: [] })
      render(<EventStream />)
      expect(screen.getByTestId('refresh-indicator')).toBeInTheDocument()
    })

    it('shows LimitedAccessWarning when error exists', () => {
      setupDefaults({ events: [], error: 'forbidden' })
      render(<EventStream />)
      expect(screen.getByTestId('limited-access-warning')).toBeInTheDocument()
    })

    it('does not show LimitedAccessWarning when no error', () => {
      setupDefaults({ events: [] })
      render(<EventStream />)
      expect(screen.queryByTestId('limited-access-warning')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCachedEvents args', () => {
    it('calls useCachedEvents with limit:100 and category:realtime', () => {
      render(<EventStream />)
      expect(mockUseCachedEvents).toHaveBeenCalledWith(
        undefined,
        undefined,
        expect.objectContaining({ limit: 100, category: 'realtime' })
      )
    })
  })
})