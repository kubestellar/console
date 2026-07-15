import React from 'react'
/**
 * Unit tests for GitOpsDrift card component.
 *
 * Covers: loading skeleton, empty state, error state, live data rendering,
 * severity stats, modal open behavior, and CardData integration.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitOpsDrift as GitOpsDriftType } from '../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count}`
      return String(key).split('.').pop() ?? key
    },
  }),
}))

const mockUseCachedGitOpsDrifts = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedGitOpsDrifts: () => mockUseCachedGitOpsDrifts(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: { string: () => () => 0 },
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
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
}))

vi.mock('../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../ui/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

vi.mock('./deploy/GitOpsDriftDetailModal', () => ({
  GitOpsDriftDetailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="drift-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDrift(overrides: Partial<GitOpsDriftType> = {}): GitOpsDriftType {
  return {
    resource: 'Deployment/app',
    kind: 'Deployment',
    cluster: 'prod',
    namespace: 'default',
    driftType: 'modified',
    severity: 'medium',
    details: 'replicas changed',
    gitVersion: 'abc123',
    ...overrides,
  }
}

const defaultCardData = {
  items: [] as GitOpsDriftType[],
  totalItems: 0,
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 5,
  goToPage: vi.fn(),
  needsPagination: false,
  setItemsPerPage: vi.fn(),
  filters: {
    search: '',
    setSearch: vi.fn(),
    localClusterFilter: [] as string[],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    availableClusters: [] as Array<{ name: string }>,
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
  },
  sorting: {
    sortBy: 'severity',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

function setupMocks(opts: {
  drifts?: GitOpsDriftType[]
  isLoading?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  error?: string | null
  isDemoFallback?: boolean
  cardDataItems?: GitOpsDriftType[]
} = {}) {
  const drifts = opts.drifts ?? []
  mockUseCachedGitOpsDrifts.mockReturnValue({
    drifts,
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    error: opts.error ?? null,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: opts.isDemoFallback ?? false,
    lastRefresh: null,
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedSeverities: ['critical', 'high', 'medium', 'low', 'info'],
    isAllSeveritiesSelected: true,
    customFilter: '',
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    isRefreshing: false,
  })
  const cardItems = opts.cardDataItems ?? drifts
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: cardItems,
    totalItems: cardItems.length,
    totalPages: Math.max(1, Math.ceil(cardItems.length / 5)),
    needsPagination: cardItems.length > 5,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitOpsDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders spinner when showSkeleton is true', async () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      // Spinner uses Loader2 + animate-spin
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', async () => {
      setupMocks({ showEmptyState: true })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      expect(screen.getByText('noDrift')).toBeInTheDocument()
      expect(screen.getByText('inSync')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('renders error message when error exists and no drifts', async () => {
      setupMocks({ drifts: [], error: 'Network error' })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  describe('live data rendering', () => {
    it('renders drift resource names and cluster badges', async () => {
      const drifts = [
        makeDrift({ resource: 'Deployment/frontend', cluster: 'prod' }),
        makeDrift({ resource: 'ConfigMap/config', cluster: 'staging', severity: 'high' }),
      ]
      setupMocks({ drifts, cardDataItems: drifts })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      expect(screen.getByText('Deployment/frontend')).toBeInTheDocument()
      expect(screen.getByText('ConfigMap/config')).toBeInTheDocument()
    })

    it('shows high severity count badge', async () => {
      const drifts = [
        makeDrift({ severity: 'high', resource: 'Deploy/a' }),
        makeDrift({ severity: 'medium', resource: 'CM/b' }),
      ]
      setupMocks({ drifts, cardDataItems: drifts })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      // StatusBadge should contain the high count
      const badges = screen.getAllByTestId('status-badge')
      expect(badges.some(b => b.textContent?.includes('1'))).toBe(true)
    })

    it('opens drift detail modal when a drift row is clicked', async () => {
      const drift = makeDrift({ resource: 'Deployment/app' })
      setupMocks({ drifts: [drift], cardDataItems: [drift] })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      await userEvent.click(screen.getByText('Deployment/app'))
      expect(screen.getByTestId('drift-modal')).toBeInTheDocument()
    })

    it('closes drift detail modal when close button is clicked', async () => {
      const drift = makeDrift({ resource: 'Deployment/app' })
      setupMocks({ drifts: [drift], cardDataItems: [drift] })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      await userEvent.click(screen.getByText('Deployment/app'))
      await userEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('drift-modal')).not.toBeInTheDocument()
    })
  })

  describe('CardData integration', () => {
    it('passes correct sort config to useCardData', async () => {
      setupMocks({ drifts: [makeDrift()] })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      render(<GitOpsDrift />)
      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('severity')
      expect(config.sort.comparators).toHaveProperty('severity')
      expect(config.sort.comparators).toHaveProperty('cluster')
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for live data state', async () => {
      const drifts = [makeDrift({ resource: 'Deployment/app', severity: 'high' })]
      setupMocks({ drifts, cardDataItems: drifts })
      const { GitOpsDrift } = await import('./GitOpsDrift')
      const { container } = render(<GitOpsDrift />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
