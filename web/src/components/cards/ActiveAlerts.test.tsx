import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveAlerts } from './ActiveAlerts'
import type { Alert } from '../../types/alerts'
import type { GroupedAlert } from '../../lib/alerts/groupAlertsForDisplay'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count}`
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseAlerts = vi.fn()
vi.mock('../../hooks/useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockUseDemoMode() }),
}))

const mockDrillToAlert = vi.fn()
vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToAlert: mockDrillToAlert }),
}))

const mockSetActiveMission = vi.fn()
const mockOpenSidebar = vi.fn()
vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({
    missions: [],
    setActiveMission: mockSetActiveMission,
    openSidebar: mockOpenSidebar,
  }),
}))

const mockDnd = {
  isActive: false,
  remaining: 0,
  clearDND: vi.fn(),
  setTimedDND: vi.fn(),
  setManualDND: vi.fn(),
}
vi.mock('../../hooks/useDoNotDisturb', () => ({
  useDoNotDisturb: () => mockDnd,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: () => () => 0,
  },
}))

vi.mock('../../lib/alerts/groupAlertsForDisplay', () => ({
  groupAlertsForDisplay: (alerts: Alert[]) =>
    (alerts as GroupedAlert[]).map((a) => ({ ...a, alertIds: [a.id], duplicateCount: 1 })),
}))

vi.mock('./AlertListItem', () => ({
  AlertListItem: ({ alert }: { alert: Alert }) => (
    <div data-testid={`alert-item-${alert.id}`} data-severity={alert.severity}>
      <span>{alert.ruleName}</span>
    </div>
  ),
}))

vi.mock('../ui/VirtualizedList', () => ({
  VirtualizedList: ({
    items,
    renderItem,
  }: {
    items: GroupedAlert[]
    renderItem: (item: GroupedAlert) => React.ReactNode
  }) => (
    <div data-testid="virtualized-list">
      {(items || []).map((item) => (
        <div key={item.id}>{renderItem(item)}</div>
      ))}
    </div>
  ),
}))

vi.mock('./NotificationVerifyIndicator', () => ({
  NotificationVerifyIndicator: () => <div data-testid="notification-verify" />,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

vi.mock('../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../ui/Pagination', () => ({
  Pagination: ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number
    totalPages: number
    onPageChange: (p: number) => void
  }) => (
    <div data-testid="pagination" data-page={currentPage} data-total={totalPages}>
      <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: 'rule-1',
    ruleName: 'cpu-high',
    severity: 'warning',
    status: 'firing',
    message: 'CPU usage is high',
    details: {},
    cluster: 'prod-cluster',
    namespace: 'default',
    firedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeGrouped(alert: Alert): GroupedAlert {
  return { ...alert, alertIds: [alert.id], duplicateCount: 1 }
}

const defaultStats = { firing: 0, critical: 0, warning: 0, acknowledged: 0, total: 0 }

const defaultCardData = {
  items: [] as GroupedAlert[],
  totalItems: 0,
  currentPage: 1,
  totalPages: 1,
  itemsPerPage: 10,
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
  activeAlerts?: Alert[]
  acknowledgedAlerts?: Alert[]
  stats?: typeof defaultStats
  isLoadingData?: boolean
  dataError?: string | null
  isDemoMode?: boolean
  isAllSeveritiesSelected?: boolean
  selectedSeverities?: string[]
  customFilter?: string
  displayedAlerts?: GroupedAlert[]
  needsPagination?: boolean
  totalPages?: number
  currentPage?: number
} = {}) {
  const activeAlerts = opts.activeAlerts ?? []
  const acknowledgedAlerts = opts.acknowledgedAlerts ?? []

  mockUseAlerts.mockReturnValue({
    activeAlerts,
    acknowledgedAlerts,
    stats: opts.stats ?? defaultStats,
    acknowledgeAlerts: vi.fn(),
    runAIDiagnosis: vi.fn(),
    isLoadingData: opts.isLoadingData ?? false,
    dataError: opts.dataError ?? null,
  })

  mockUseGlobalFilters.mockReturnValue({
    selectedSeverities: opts.selectedSeverities ?? ['critical', 'warning', 'info'],
    isAllSeveritiesSelected: opts.isAllSeveritiesSelected ?? true,
    customFilter: opts.customFilter ?? '',
  })

  mockUseDemoMode.mockReturnValue(opts.isDemoMode ?? false)

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: false,
    showEmptyState: false,
  })

  const displayed = opts.displayedAlerts ?? activeAlerts.map(makeGrouped)
  mockUseCardData.mockReturnValue({
    ...defaultCardData,
    items: displayed,
    totalItems: displayed.length,
    totalPages: opts.totalPages ?? 1,
    currentPage: opts.currentPage ?? 1,
    needsPagination: opts.needsPagination ?? false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActiveAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDnd.isActive = false
    mockDnd.remaining = 0
  })

  // ---- useCardLoadingState wiring ----

  describe('useCardLoadingState wiring', () => {
    it('passes isLoading=false when there is no data and not loading', () => {
      setupMocks({ activeAlerts: [], isLoadingData: false })
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: false }),
      )
    })

    it('passes isLoading=true when loading with no data yet', () => {
      setupMocks({ activeAlerts: [], isLoadingData: true })
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true }),
      )
    })

    it('passes isRefreshing=true when loading but data already exists', () => {
      const alerts = [makeAlert()]
      setupMocks({ activeAlerts: alerts, isLoadingData: true })
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true, isLoading: false }),
      )
    })

    it('passes isDemoData from demo mode', () => {
      setupMocks({ isDemoMode: true })
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isFailed=true when dataError is set', () => {
      setupMocks({ dataError: 'connection refused' })
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })

    it('passes isFailed=false when no error', () => {
      setupMocks()
      render(<ActiveAlerts />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: false }),
      )
    })
  })

  // ---- Stats row ----

  describe('stats row', () => {
    it('renders critical, warning, and acknowledged counts', () => {
      setupMocks({
        stats: { firing: 3, critical: 2, warning: 1, acknowledged: 4, total: 7 },
      })
      render(<ActiveAlerts />)
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('shows "no active alerts" message when no alerts are displayed', () => {
      setupMocks({ displayedAlerts: [] })
      render(<ActiveAlerts />)
      expect(screen.getByText('noActiveAlerts')).toBeInTheDocument()
      expect(screen.getByText('allSystemsOperational')).toBeInTheDocument()
    })

    it('does not show "no active alerts" when alerts exist', () => {
      const alert = makeAlert()
      setupMocks({ activeAlerts: [alert], displayedAlerts: [makeGrouped(alert)] })
      render(<ActiveAlerts />)
      expect(screen.queryByText('noActiveAlerts')).not.toBeInTheDocument()
    })
  })

  // ---- Alert list rendering ----

  describe('alert list rendering', () => {
    it('renders alert items via VirtualizedList', () => {
      const a1 = makeAlert({ id: 'a1', ruleName: 'cpu-high' })
      const a2 = makeAlert({ id: 'a2', ruleName: 'mem-low' })
      setupMocks({ activeAlerts: [a1, a2], displayedAlerts: [makeGrouped(a1), makeGrouped(a2)] })
      render(<ActiveAlerts />)
      expect(screen.getByTestId('virtualized-list')).toBeInTheDocument()
      expect(screen.getByTestId('alert-item-a1')).toBeInTheDocument()
      expect(screen.getByTestId('alert-item-a2')).toBeInTheDocument()
    })

    it('renders rule names for each alert', () => {
      const a1 = makeAlert({ id: 'a1', ruleName: 'disk-full' })
      setupMocks({ activeAlerts: [a1], displayedAlerts: [makeGrouped(a1)] })
      render(<ActiveAlerts />)
      expect(screen.getByText('disk-full')).toBeInTheDocument()
    })
  })

  // ---- Firing count badge ----

  describe('firing count badge', () => {
    it('shows firing count badge when firing > 0', () => {
      setupMocks({ stats: { firing: 5, critical: 2, warning: 3, acknowledged: 0, total: 5 } })
      render(<ActiveAlerts />)
      const badges = screen.getAllByTestId('status-badge')
      const firingBadge = badges.find((b) => b.textContent === '5')
      expect(firingBadge).toBeDefined()
    })

    it('does not show firing badge when firing is 0', () => {
      setupMocks({ stats: { firing: 0, critical: 0, warning: 0, acknowledged: 0, total: 0 } })
      render(<ActiveAlerts />)
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    })
  })

  // ---- Show acknowledged toggle ----

  describe('acknowledged toggle', () => {
    it('toggles the acknowledged alert visibility when button is clicked', async () => {
      const ackAlert = makeAlert({ id: 'ack-1', ruleName: 'ack-rule' })
      const activeAlert = makeAlert({ id: 'active-1', ruleName: 'active-rule' })

      setupMocks({
        activeAlerts: [activeAlert],
        acknowledgedAlerts: [ackAlert],
        displayedAlerts: [makeGrouped(activeAlert)],
      })

      render(<ActiveAlerts />)

      // Before toggle: acknowledged alert is not shown
      expect(screen.queryByTestId('alert-item-ack-1')).not.toBeInTheDocument()

      // Click the acknowledged toggle button
      const ackToggle = screen.getByTitle('showAcknowledged')
      setupMocks({
        activeAlerts: [activeAlert],
        acknowledgedAlerts: [ackAlert],
        displayedAlerts: [makeGrouped(activeAlert), makeGrouped(ackAlert)],
      })
      await userEvent.click(ackToggle)

      // After toggle: useCardData should have received both alerts
      const lastCallArgs = mockUseCardData.mock.calls[mockUseCardData.mock.calls.length - 1]
      const preFiltered = lastCallArgs[0]
      expect(preFiltered).toHaveLength(2)
    })

    it('shows acknowledged count badge on the toggle button', () => {
      setupMocks({ acknowledgedAlerts: [makeAlert(), makeAlert()] })
      render(<ActiveAlerts />)
      const badges = screen.getAllByTestId('status-badge')
      const countBadge = badges.find((b) => b.textContent === '2')
      expect(countBadge).toBeDefined()
    })
  })

  // ---- DND (Do Not Disturb) ----

  describe('do not disturb', () => {
    it('renders DND button', () => {
      setupMocks()
      render(<ActiveAlerts />)
      expect(
        screen.getByTitle(/Pause notifications/i),
      ).toBeInTheDocument()
    })

    it('shows DND menu when button is clicked and DND is inactive', async () => {
      setupMocks()
      render(<ActiveAlerts />)
      await userEvent.click(screen.getByTitle(/Pause notifications/i))
      expect(screen.getByText('For 1 hour')).toBeInTheDocument()
      expect(screen.getByText('For 4 hours')).toBeInTheDocument()
      expect(screen.getByText('Until tomorrow 8am')).toBeInTheDocument()
    })

    it('calls setTimedDND with "1h" when "For 1 hour" is clicked', async () => {
      setupMocks()
      render(<ActiveAlerts />)
      await userEvent.click(screen.getByTitle(/Pause notifications/i))
      await userEvent.click(screen.getByText('For 1 hour'))
      expect(mockDnd.setTimedDND).toHaveBeenCalledWith('1h')
    })

    it('calls clearDND when DND is active and button is clicked', async () => {
      mockDnd.isActive = true
      mockDnd.remaining = 60 * 60 * 1000
      setupMocks()
      render(<ActiveAlerts />)
      const dndBtn = screen.getByTitle(/click to resume/i)
      await userEvent.click(dndBtn)
      expect(mockDnd.clearDND).toHaveBeenCalled()
    })

    it('shows remaining time when DND is active', () => {
      mockDnd.isActive = true
      mockDnd.remaining = 90 * 60 * 1000 // 90 minutes = 1h 30m
      setupMocks()
      render(<ActiveAlerts />)
      expect(screen.getByText('1h 30m')).toBeInTheDocument()
    })

    it('calls setManualDND when "Until I turn it off" is clicked', async () => {
      setupMocks()
      render(<ActiveAlerts />)
      await userEvent.click(screen.getByTitle(/Pause notifications/i))
      await userEvent.click(screen.getByText('Until I turn it off'))
      expect(mockDnd.setManualDND).toHaveBeenCalledWith(true)
    })
  })

  // ---- Pagination ----

  describe('pagination', () => {
    it('renders pagination when needsPagination is true', () => {
      const alerts = Array.from({ length: 15 }, (_, i) =>
        makeGrouped(makeAlert({ id: `a${i}` })),
      )
      setupMocks({ displayedAlerts: alerts, needsPagination: true, totalPages: 2 })
      render(<ActiveAlerts />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('does not render pagination when needsPagination is false', () => {
      setupMocks({ displayedAlerts: [] })
      render(<ActiveAlerts />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })

  // ---- Severity filtering ----

  describe('severity filtering (pre-filter)', () => {
    it('passes only severity-matching alerts to useCardData when filter is active', () => {
      const critAlert = makeAlert({ id: 'c1', severity: 'critical' })
      const warnAlert = makeAlert({ id: 'w1', severity: 'warning' })

      setupMocks({
        activeAlerts: [critAlert, warnAlert],
        isAllSeveritiesSelected: false,
        selectedSeverities: ['critical'],
      })
      render(<ActiveAlerts />)

      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0]
      expect(preFiltered.every((a: GroupedAlert) => a.severity === 'critical')).toBe(true)
    })

    it('passes all alerts to useCardData when all severities are selected', () => {
      const alerts = [
        makeAlert({ id: 'c1', severity: 'critical' }),
        makeAlert({ id: 'w1', severity: 'warning' }),
        makeAlert({ id: 'i1', severity: 'info' }),
      ]

      setupMocks({
        activeAlerts: alerts,
        isAllSeveritiesSelected: true,
      })
      render(<ActiveAlerts />)

      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0]
      expect(preFiltered).toHaveLength(3)
    })
  })

  // ---- Custom filter ----

  describe('custom text filter', () => {
    it('filters alerts by ruleName when customFilter is set', () => {
      const a1 = makeAlert({ id: 'a1', ruleName: 'cpu-spike', message: 'CPU is high' })
      const a2 = makeAlert({ id: 'a2', ruleName: 'disk-full', message: 'Disk is full' })

      setupMocks({
        activeAlerts: [a1, a2],
        isAllSeveritiesSelected: true,
        customFilter: 'cpu',
      })
      render(<ActiveAlerts />)

      const firstCallArgs = mockUseCardData.mock.calls[0]
      const preFiltered = firstCallArgs[0]
      expect(preFiltered).toHaveLength(1)
      expect(preFiltered[0].id).toBe('a1')
    })
  })
})
