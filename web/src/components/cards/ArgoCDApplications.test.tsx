/**
 * Unit tests for ArgoCDApplications card component.
 *
 * Tests cover: loading skeleton, empty state, demo data fallback,
 * live data rendering, sync button behavior, drill-down navigation,
 * and CardData integration (filter/sort/pagination).
 *
 * Closes #3450
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArgoCDApplications } from './ArgoCDApplications'
import type { ArgoApplication, TriggerSyncResult } from '../../hooks/useArgoCD'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// i18n — return the key itself so assertions are translation-agnostic
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count} apps`
      if (opts && 'name' in opts) return `Click to view ${opts.name} details`
      // Return last segment of the key for readable assertions
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

// useArgoCD hooks
const mockUseArgoCDApplications = vi.fn()
const mockTriggerSync = vi.fn()
const mockSyncState: { isSyncing: boolean; lastResult: TriggerSyncResult | null } = {
  isSyncing: false,
  lastResult: null,
}
vi.mock('../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => mockUseArgoCDApplications(),
  useArgoCDTriggerSync: () => ({
    triggerSync: mockTriggerSync,
    isSyncing: mockSyncState.isSyncing,
    lastResult: mockSyncState.lastResult,
  }),
}))

// useDrillDown
const mockDrillToArgoApp = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToArgoApp: mockDrillToArgoApp }),
}))

// Toasts
const mockShowToast = vi.fn()
vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// CardDataContext — useCardLoadingState
const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

// cardHooks — useCardData
const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: () => (a: Record<string, string>, b: Record<string, string>) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
  },
}))

// DynamicCardErrorBoundary — pass-through
vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Skeleton component — render a simple placeholder
vi.mock('../ui/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" data-variant={props.variant} />
  ),
}))

// StatusBadge — simple wrapper
vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

// ClusterBadge
vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

// CardComponents — minimal placeholders
vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <input
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardControlsRow: ({ cardControls }: { cardControls?: Record<string, unknown> }) => (
    <div data-testid="card-controls" data-sort-by={cardControls?.sortBy} data-sort-dir={cardControls?.sortDirection} />
  ),
  CardPaginationFooter: ({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (p: number) => void }) => (
    <div data-testid="pagination" data-page={currentPage} data-total={totalPages}>
      {totalPages > 1 && (
        <button data-testid="next-page" onClick={() => onPageChange(currentPage + 1)}>
          Next
        </button>
      )}
    </div>
  ),
  CardEmptyState: ({ title, message }: { title: string; message: string }) => (
    <div data-testid="card-empty-state">
      <p>{title}</p>
      <p>{message}</p>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockApp(overrides: Partial<ArgoApplication> = {}): ArgoApplication {
  return {
    name: 'my-app',
    namespace: 'production',
    cluster: 'prod-cluster',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    source: {
      repoURL: 'https://github.com/example-org/my-app',
      path: 'k8s',
      targetRevision: 'main',
    },
    lastSynced: '2 minutes ago',
    ...overrides,
  }
}

const defaultCardData = {
  items: [] as ArgoApplication[],
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
    sortBy: 'syncStatus',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

function setupMocks(opts: {
  applications?: ArgoApplication[]
  isLoading?: boolean
  isDemoData?: boolean
  showSkeleton?: boolean
  showEmptyState?: boolean
  cardDataItems?: ArgoApplication[]
  isFailed?: boolean
  consecutiveFailures?: number
} = {}) {
  const apps = opts.applications ?? []

  mockUseArgoCDApplications.mockReturnValue({
    applications: apps,
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    isFailed: opts.isFailed ?? false,
    consecutiveFailures: opts.consecutiveFailures ?? 0,
    isDemoData: opts.isDemoData ?? false,
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
    hasData: apps.length > 0,
    isRefreshing: false,
  })

  const cardItems = opts.cardDataItems ?? apps
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

describe('ArgoCDApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSyncState.isSyncing = false
    mockSyncState.lastResult = null
  })

  // ---- Loading state ----

  describe('loading state', () => {
    it('renders skeleton placeholders when showSkeleton is true', () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      render(<ArgoCDApplications />)

      const skeletons = screen.getAllByTestId('skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(4) // text + 3 rounded
    })

    it('passes correct options to useCardLoadingState', () => {
      setupMocks({ isLoading: true, applications: [] })
      render(<ArgoCDApplications />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        }),
      )
    })

    it('reports hasAnyData true when applications exist during loading', () => {
      const apps = [makeMockApp()]
      setupMocks({ isLoading: true, applications: apps })
      render(<ArgoCDApplications />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          // isLoading should be false because hasData is true: isLoading && !hasData
          isLoading: false,
          hasAnyData: true,
        }),
      )
    })
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', () => {
      setupMocks({ showEmptyState: true })
      render(<ArgoCDApplications />)

      expect(screen.getByText('noApplications')).toBeInTheDocument()
      expect(screen.getByText('deployWithArgoCD')).toBeInTheDocument()
    })
  })

  // ---- Demo data ----

  describe('demo data fallback', () => {
    it('renders mock applications when isDemoData is true', () => {
      const demoApps = [
        makeMockApp({ name: 'frontend-app', syncStatus: 'Synced', healthStatus: 'Healthy' }),
        makeMockApp({ name: 'api-gateway', syncStatus: 'OutOfSync', healthStatus: 'Healthy' }),
        makeMockApp({ name: 'monitoring-stack', syncStatus: 'OutOfSync', healthStatus: 'Degraded' }),
      ]
      setupMocks({ isDemoData: true, applications: demoApps, cardDataItems: demoApps })
      render(<ArgoCDApplications />)

      expect(screen.getByText('frontend-app')).toBeInTheDocument()
      expect(screen.getByText('api-gateway')).toBeInTheDocument()
      expect(screen.getByText('monitoring-stack')).toBeInTheDocument()
    })

    it('displays correct stats pills for demo data', () => {
      const demoApps = [
        makeMockApp({ syncStatus: 'Synced', healthStatus: 'Healthy' }),
        makeMockApp({ name: 'app2', syncStatus: 'OutOfSync', healthStatus: 'Degraded' }),
        makeMockApp({ name: 'app3', syncStatus: 'Synced', healthStatus: 'Healthy' }),
      ]
      setupMocks({ isDemoData: true, applications: demoApps, cardDataItems: demoApps })
      render(<ArgoCDApplications />)

      // Stats are based on preFiltered (all 3 apps)
      // synced: 2, outOfSync: 1, healthy: 2, unhealthy: 1
      const statValues = screen.getAllByRole('button')
      // The stat pills have role="button" from the component
      expect(statValues.length).toBeGreaterThanOrEqual(4)
    })

    it('shows integration notice when rendering demo data', () => {
      const demoApps = [makeMockApp()]
      setupMocks({ isDemoData: true, applications: demoApps, cardDataItems: demoApps })
      render(<ArgoCDApplications />)

      expect(screen.getByText('argocdIntegration')).toBeInTheDocument()
      expect(screen.getByText('installArgoCD')).toBeInTheDocument()
    })

    it('passes isDemoData through to useCardLoadingState', () => {
      setupMocks({ isDemoData: true, applications: [makeMockApp()] })
      render(<ArgoCDApplications />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })
  })

  // ---- Live data ----

  describe('live data rendering', () => {
    const liveApps: ArgoApplication[] = [
      makeMockApp({
        name: 'payments-svc',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        cluster: 'us-east-1',
      }),
      makeMockApp({
        name: 'checkout-svc',
        syncStatus: 'OutOfSync',
        healthStatus: 'Degraded',
        cluster: 'eu-west-1',
      }),
    ]

    it('renders application names, sync badges, and health icons', () => {
      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      render(<ArgoCDApplications />)

      expect(screen.getByText('payments-svc')).toBeInTheDocument()
      expect(screen.getByText('checkout-svc')).toBeInTheDocument()

      // Sync status text badges
      expect(screen.getByText('Synced')).toBeInTheDocument()
      expect(screen.getByText('OutOfSync')).toBeInTheDocument()

      // Health icons have aria-label
      expect(screen.getByLabelText('Healthy')).toBeInTheDocument()
      expect(screen.getByLabelText('Degraded')).toBeInTheDocument()
    })

    it('renders cluster badges for each application', () => {
      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      render(<ArgoCDApplications />)

      const badges = screen.getAllByTestId('cluster-badge')
      const clusterNames = badges.map((b) => b.textContent)
      expect(clusterNames).toContain('us-east-1')
      expect(clusterNames).toContain('eu-west-1')
    })

    it('shows Sync Now button only for OutOfSync apps', () => {
      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      render(<ArgoCDApplications />)

      // Only one Sync Now button — for checkout-svc
      const syncButtons = screen.getAllByTitle('syncNow')
      expect(syncButtons).toHaveLength(1)
    })

    it('triggers sync and shows spinner when Sync Now is clicked', async () => {
      mockTriggerSync.mockImplementation(() => {
        mockSyncState.isSyncing = true
        return new Promise<TriggerSyncResult>(() => {})
      })

      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      render(<ArgoCDApplications />)

      const syncButton = screen.getByTitle('syncNow')
      await userEvent.click(syncButton)

      expect(mockTriggerSync).toHaveBeenCalledWith('checkout-svc', 'production')
      expect(syncButton).toBeDisabled()
    })

    it('shows a success toast after sync completes', async () => {
      mockTriggerSync.mockImplementation(() => {
        mockSyncState.isSyncing = true
        return Promise.resolve({ success: true })
      })

      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      const { rerender } = render(<ArgoCDApplications />)

      await userEvent.click(screen.getByTitle('syncNow'))

      mockSyncState.isSyncing = false
      mockSyncState.lastResult = { success: true }
      rerender(<ArgoCDApplications />)

      expect(mockShowToast).toHaveBeenCalledWith(
        'syncSuccessMessage',
        'success',
      )
    })

    it('shows an error toast after sync fails', async () => {
      mockTriggerSync.mockImplementation(() => {
        mockSyncState.isSyncing = true
        return Promise.resolve({ success: false, error: 'boom' })
      })

      setupMocks({ isDemoData: false, applications: liveApps, cardDataItems: liveApps })
      const { rerender } = render(<ArgoCDApplications />)

      await userEvent.click(screen.getByTitle('syncNow'))

      mockSyncState.isSyncing = false
      mockSyncState.lastResult = { success: false, error: 'boom' }
      rerender(<ArgoCDApplications />)

      expect(mockShowToast).toHaveBeenCalledWith(
        'syncFailedMessage',
        'error',
      )
    })
  })

  // ---- Drill-down ----

  describe('drill-down navigation', () => {
    it('calls drillToArgoApp with correct arguments when clicking an app', async () => {
      const app = makeMockApp({
        name: 'my-app',
        cluster: 'prod',
        namespace: 'default',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        lastSynced: '5m ago',
      })
      setupMocks({ applications: [app], cardDataItems: [app] })
      render(<ArgoCDApplications />)

      const appRow = screen.getByText('my-app').closest('[class*="cursor-pointer"]')!
      await userEvent.click(appRow)

      expect(mockDrillToArgoApp).toHaveBeenCalledWith('prod', 'default', 'my-app', {
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        source: app.source,
        lastSynced: '5m ago',
      })
    })

    it('does not trigger drill-down when clicking Sync Now (stopPropagation)', async () => {
      const app = makeMockApp({ syncStatus: 'OutOfSync' })
      mockTriggerSync.mockResolvedValue({ success: true })
      setupMocks({ applications: [app], cardDataItems: [app] })
      render(<ArgoCDApplications />)

      const syncButton = screen.getByTitle('syncNow')
      await userEvent.click(syncButton)

      // Sync was triggered but drill-down was NOT
      expect(mockTriggerSync).toHaveBeenCalled()
      expect(mockDrillToArgoApp).not.toHaveBeenCalled()
    })
  })

  // ---- Syncing state ----

  describe('syncing state', () => {
    it('disables all sync buttons while a sync is in progress', async () => {
      const apps = [
        makeMockApp({ name: 'app-a', syncStatus: 'OutOfSync', cluster: 'c1' }),
        makeMockApp({ name: 'app-b', syncStatus: 'OutOfSync', cluster: 'c2' }),
      ]

      mockTriggerSync.mockImplementation(() => {
        mockSyncState.isSyncing = true
        return new Promise<TriggerSyncResult>(() => {})
      })

      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      const syncButtons = screen.getAllByTitle('syncNow')
      expect(syncButtons).toHaveLength(2)

      await userEvent.click(syncButtons[0])

      expect(syncButtons[0]).toBeDisabled()
      expect(syncButtons[1]).toBeDisabled()
    })
  })

  // ---- CardData integration (filter/sort/pagination) ----

  describe('CardData integration', () => {
    it('passes preFiltered data to useCardData', () => {
      const apps = [
        makeMockApp({ name: 'a', cluster: 'c1' }),
        makeMockApp({ name: 'b', cluster: 'c2' }),
      ]
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      // useCardData was called with the apps array as the first argument
      expect(mockUseCardData).toHaveBeenCalled()
      const firstCallArgs = mockUseCardData.mock.calls[0]
      // First arg is the preFiltered array
      expect(firstCallArgs[0]).toHaveLength(2)
    })

    it('filters by config.cluster when provided', () => {
      const apps = [
        makeMockApp({ name: 'a', cluster: 'c1' }),
        makeMockApp({ name: 'b', cluster: 'c2' }),
      ]
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications config={{ cluster: 'c1' }} />)

      // useCardData should receive only apps matching config.cluster
      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0] as ArgoApplication[]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].cluster).toBe('c1')
    })

    it('renders pagination footer with correct props', () => {
      const apps = Array.from({ length: 8 }, (_, i) =>
        makeMockApp({ name: `app-${i}`, cluster: `c${i}` }),
      )
      setupMocks({ applications: apps, cardDataItems: apps.slice(0, 5) })

      // Override useCardData to report pagination needed
      mockUseCardData.mockReturnValue({
        ...defaultCardData,
        items: apps.slice(0, 5),
        totalItems: 8,
        totalPages: 2,
        needsPagination: true,
      })

      render(<ArgoCDApplications />)

      const pagination = screen.getByTestId('pagination')
      expect(pagination).toHaveAttribute('data-total', '2')
      expect(screen.getByTestId('next-page')).toBeInTheDocument()
    })

    it('provides the correct sort comparators config to useCardData', () => {
      setupMocks({ applications: [makeMockApp()] })
      render(<ArgoCDApplications />)

      const config = mockUseCardData.mock.calls[0][1]
      expect(config.sort.defaultField).toBe('syncStatus')
      expect(config.sort.defaultDirection).toBe('asc')
      expect(config.sort.comparators).toHaveProperty('syncStatus')
      expect(config.sort.comparators).toHaveProperty('healthStatus')
      expect(config.sort.comparators).toHaveProperty('name')
      expect(config.sort.comparators).toHaveProperty('namespace')
    })

    it('provides search fields configuration to useCardData', () => {
      setupMocks({ applications: [makeMockApp()] })
      render(<ArgoCDApplications />)

      const config = mockUseCardData.mock.calls[0][1]
      expect(config.filter.searchFields).toEqual(['name', 'namespace', 'cluster'])
      expect(config.filter.clusterField).toBe('cluster')
    })
  })

  // ---- Status filter pills ----

  describe('status filter pills', () => {
    const apps = [
      makeMockApp({ name: 'a', syncStatus: 'Synced', healthStatus: 'Healthy' }),
      makeMockApp({ name: 'b', syncStatus: 'OutOfSync', healthStatus: 'Degraded' }),
      makeMockApp({ name: 'c', syncStatus: 'Synced', healthStatus: 'Healthy' }),
    ]

    it('shows correct stat counts', () => {
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      // Stats: synced=2, outOfSync=1, healthy=2, unhealthy=1
      // Find by the stat pill aria-labels
      expect(screen.getByLabelText(/2 synced/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/1 out of sync/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/2 healthy/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/1 unhealthy/i)).toBeInTheDocument()
    })

    it('filters to outOfSync apps when OutOfSync pill is clicked', async () => {
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      const outOfSyncPill = screen.getByLabelText(/1 out of sync/i)
      await userEvent.click(outOfSyncPill)

      // useCardData should now receive only the OutOfSync app
      const lastCallArgs = mockUseCardData.mock.calls[mockUseCardData.mock.calls.length - 1]
      const preFiltered = lastCallArgs[0] as ArgoApplication[]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].syncStatus).toBe('OutOfSync')
    })

    it('filters to unhealthy apps when Unhealthy pill is clicked', async () => {
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      const unhealthyPill = screen.getByLabelText(/1 unhealthy/i)
      await userEvent.click(unhealthyPill)

      const lastCallArgs = mockUseCardData.mock.calls[mockUseCardData.mock.calls.length - 1]
      const preFiltered = lastCallArgs[0] as ArgoApplication[]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].healthStatus).toBe('Degraded')
    })

    it('shows filter indicator and clears on click', async () => {
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      // Click outOfSync
      await userEvent.click(screen.getByLabelText(/1 out of sync/i))

      // Filter indicator should appear — find the one inside the filter indicator row
      // (there are two "outOfSync" texts: one in the stats grid and one in the filter indicator button)
      const filterIndicatorButtons = screen.getAllByText('outOfSync')
        .map(el => el.closest('button'))
        .filter((btn): btn is HTMLButtonElement => btn !== null)
      expect(filterIndicatorButtons.length).toBeGreaterThanOrEqual(1)

      // Click the filter pill button to clear
      await userEvent.click(filterIndicatorButtons[0])

      // After clearing, useCardData should get all apps back
      const lastCallArgs = mockUseCardData.mock.calls[mockUseCardData.mock.calls.length - 1]
      const preFiltered = lastCallArgs[0] as ArgoApplication[]
      expect(preFiltered).toHaveLength(3)
    })
  })

  // ---- Apps count badge ----

  describe('header badge', () => {
    it('shows total item count from useCardData', () => {
      const apps = [makeMockApp(), makeMockApp({ name: 'b' })]
      setupMocks({ applications: apps, cardDataItems: apps })
      render(<ArgoCDApplications />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('2 apps')
    })
  })
})
