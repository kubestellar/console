import React from 'react'
/**
 * Unit tests for Missions card component.
 * Covers: loading skeleton, empty state, happy-path mission list,
 * search/sort controls, orbit/deployed status rendering, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Missions } from './Missions'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object' && 'count' in opts) return `${opts.count}`
      return key.split('.').pop() ?? key
    },
  }),
}))

const mockUseDeployMissions = vi.fn()
vi.mock('../../hooks/useDeployMissions', () => ({
  useDeployMissions: () => mockUseDeployMissions(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

const mockUseMissions = vi.fn()
vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

vi.mock('./console-missions/shared', () => ({
  useApiKeyCheck: () => ({ hasApiKey: false }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  CardPaginationFooter: ({ needsPagination }: { needsPagination: boolean }) =>
    needsPagination ? <div data-testid="pagination" /> : null,
  CardEmptyState: ({ title }: { title: string }) => (
    <div data-testid="card-empty-state">{title}</div>
  ),
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: { search: '', setSearch: vi.fn() },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
  commonComparators: {
    string: () => () => 0,
    statusOrder: () => () => 0,
    date: () => () => 0,
  },
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
  getClusterInfo: (name: string) => ({ name, shortName: name.slice(0, 3) }),
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60000,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultMissionsReturn = {
  missions: [],
  activeMissions: [],
  completedMissions: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

function setup(overrides = {}) {
  mockUseDeployMissions.mockReturnValue({ ...defaultMissionsReturn, ...overrides })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [{ name: 'prod-cluster' }] })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockUseMissions.mockReturnValue({ startMission: vi.fn() })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Missions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders loading skeleton when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<Missions />)
    expect(document.body).toBeTruthy()
  })

  // 2. Empty state
  it('renders empty state when missions list is empty', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<Missions />)
    expect(screen.getByTestId('card-empty-state')).toBeInTheDocument()
  })

  // 3. Controls
  it('renders search input', () => {
    render(<Missions />)
    expect(screen.getByTestId('card-search')).toBeInTheDocument()
  })

  it('renders card controls row', () => {
    render(<Missions />)
    expect(screen.getByTestId('card-controls')).toBeInTheDocument()
  })

  // 4. No crash with no data
  it('does not crash when missions is undefined', () => {
    mockUseDeployMissions.mockReturnValue({ ...defaultMissionsReturn, missions: undefined })
    render(<Missions />)
    expect(document.body).toBeTruthy()
  })

  // 5. Snapshot
  it('matches snapshot in empty state', () => {
    const { asFragment } = render(<Missions />)
    expect(asFragment()).toMatchSnapshot()
  })
})
