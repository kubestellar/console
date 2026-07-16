import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NamespaceEvents } from './NamespaceEvents'
import type { ClusterEvent } from '../../hooks/useMCP'
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

const mockUseCachedWarningEvents = vi.fn()
const mockUseCachedNamespaces = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedWarningEvents: () => mockUseCachedWarningEvents(),
  useCachedNamespaces: (_cluster?: string) => mockUseCachedNamespaces(_cluster),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToEvents: vi.fn() }),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockUseDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
const mockUseCascadingSelection = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  useCascadingSelection: (...args: unknown[]) => mockUseCascadingSelection(...args),
  commonComparators: {
    string: (_field: string) => () => 0,
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ rows }: { rows?: number }) => <div data-testid="card-skeleton" data-rows={rows} />,
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-controls-row">{children}</div>
  ),
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
  MS_PER_HOUR: 3_600_000,
  MS_PER_DAY: 86_400_000,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type: 'Warning',
    object: 'Pod/my-pod',
    message: 'Back-off restarting failed container',
    reason: 'BackOff',
    namespace: 'default',
    cluster: 'prod-cluster',
    count: 1,
    lastSeen: new Date().toISOString(),
    ...overrides,
  }
}

function setupMocks(opts: {
  events?: ClusterEvent[]
  eventsLoading?: boolean
  eventsFailed?: boolean
  clustersLoading?: boolean
  isDemoMode?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  cardItems?: ClusterEvent[]
} = {}) {
  mockUseClusters.mockReturnValue({
    isLoading: opts.clustersLoading ?? false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
  })

  const events = opts.events ?? []
  mockUseCachedWarningEvents.mockReturnValue({
    events,
    isLoading: opts.eventsLoading ?? false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: opts.eventsFailed ?? false,
    consecutiveFailures: 0,
  })

  mockUseCachedNamespaces.mockReturnValue({
    namespaces: ['default', 'kube-system'],
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: false,
  })

  mockUseDemoMode.mockReturnValue(opts.isDemoMode ?? false)

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })

  const cardItems = opts.cardItems ?? events
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
    sorting: { sortBy: 'time', setSortBy: vi.fn(), sortDirection: 'desc', setSortDirection: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  })

  mockUseCascadingSelection.mockReturnValue({
    selectedFirst: '',
    setSelectedFirst: vi.fn(),
    selectedSecond: '',
    setSelectedSecond: vi.fn(),
    availableFirstLevel: [],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NamespaceEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    setupMocks()
    const { container } = render(<NamespaceEvents />)
    expect(container).toBeDefined()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setupMocks({ showSkeleton: true })
    render(<NamespaceEvents />)
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
  })

  it('renders empty state when showEmptyState is true', () => {
    setupMocks({ showEmptyState: true })
    render(<NamespaceEvents />)
    expect(screen.getByText('noEvents')).toBeInTheDocument()
  })

  it('passes isLoading=true to useCardLoadingState when loading', () => {
    setupMocks({ eventsLoading: true })
    render(<NamespaceEvents />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
    )
  })

  it('passes isFailed=true to useCardLoadingState when events fail', () => {
    setupMocks({ eventsFailed: true })
    render(<NamespaceEvents />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true }),
    )
  })

  it('renders event rows when data is available', () => {
    const evt = makeEvent({ id: 'evt-1', object: 'Pod/crashing-pod', type: 'Warning' })
    setupMocks({ events: [evt], cardItems: [evt] })
    render(<NamespaceEvents />)
    expect(screen.getByText('Pod/crashing-pod')).toBeInTheDocument()
  })

  it('renders multiple events', () => {
    const e1 = makeEvent({ id: 'e1', object: 'Pod/alpha' })
    const e2 = makeEvent({ id: 'e2', object: 'Pod/beta' })
    setupMocks({ events: [e1, e2], cardItems: [e1, e2] })
    render(<NamespaceEvents />)
    expect(screen.getByText('Pod/alpha')).toBeInTheDocument()
    expect(screen.getByText('Pod/beta')).toBeInTheDocument()
  })

  it('accepts config prop', () => {
    setupMocks()
    const { container } = render(
      <NamespaceEvents config={{ cluster: 'staging', namespace: 'default' }} />,
    )
    expect(container).toBeDefined()
  })
})
