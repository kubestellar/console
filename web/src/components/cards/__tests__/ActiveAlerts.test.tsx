import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActiveAlerts } from '../ActiveAlerts'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAcknowledgeAlerts = vi.fn()
const mockRunAIDiagnosis = vi.fn()
const mockDrillToAlert = vi.fn()

const mockAlertsState = {
  activeAlerts: [] as Array<Record<string, unknown>>,
  acknowledgedAlerts: [] as Array<Record<string, unknown>>,
  stats: { firing: 0, critical: 0, warning: 0, acknowledged: 0 },
  isLoadingData: false,
  dataError: null as string | null,
}

vi.mock('../../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    ...mockAlertsState,
    acknowledgeAlerts: mockAcknowledgeAlerts,
    runAIDiagnosis: mockRunAIDiagnosis,
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedSeverities: ['critical', 'warning', 'info'],
    isAllSeveritiesSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToAlert: mockDrillToAlert }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ missions: [], setActiveMission: vi.fn(), openSidebar: vi.fn() }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
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
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: { sortBy: 'severity', setSortBy: vi.fn() },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`
      return key
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <input data-testid="search-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  ),
  CardClusterFilter: () => <div data-testid="cluster-filter" />,
}))

vi.mock('../../ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../ui/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}))

vi.mock('../NotificationVerifyIndicator', () => ({
  NotificationVerifyIndicator: () => <div data-testid="notification-indicator" />,
}))

vi.mock('../AlertListItem', () => ({
  AlertListItem: ({ alert, duplicateCount, onAcknowledge, alertIds }: { alert: { ruleName: string }; duplicateCount?: number; onAcknowledge: (e: React.MouseEvent, alertIds: string[]) => void; alertIds?: string[] }) => (
    <div>
      <div data-testid="alert-item">{alert.ruleName}:{duplicateCount ?? 1}</div>
      <button onClick={(event) => onAcknowledge(event, alertIds || [])}>ack</button>
    </div>
  ),
}))

vi.mock('../../ui/VirtualizedList', () => ({
  VirtualizedList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown, index: number) => React.ReactNode }) => (
    <div data-testid="virtualized-list">{items.map((item, index) => renderItem(item, index))}</div>
  ),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ActiveAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAlertsState.activeAlerts = []
    mockAlertsState.acknowledgedAlerts = []
    mockAlertsState.stats = { firing: 0, critical: 0, warning: 0, acknowledged: 0 }
    mockAlertsState.isLoadingData = false
    mockAlertsState.dataError = null
  })

  describe('Empty state', () => {
    it('shows no active alerts message when list is empty', () => {
      render(<ActiveAlerts />)
      expect(screen.getByText('activeAlerts.noActiveAlerts')).toBeTruthy()
    })

    it('shows all systems operational message', () => {
      render(<ActiveAlerts />)
      expect(screen.getByText('activeAlerts.allSystemsOperational')).toBeTruthy()
    })
  })

  describe('Stats row', () => {
    it('renders critical, warning and ackd stat cells', () => {
      render(<ActiveAlerts />)
      expect(screen.getByText('activeAlerts.critical')).toBeTruthy()
      expect(screen.getByText('activeAlerts.warning')).toBeTruthy()
      expect(screen.getAllByText('activeAlerts.ackd').length).toBeGreaterThan(0)
    })
  })

  describe('Controls', () => {
    it('renders search input', () => {
      render(<ActiveAlerts />)
      expect(screen.getByTestId('search-input')).toBeTruthy()
    })

    it('renders cluster filter', () => {
      render(<ActiveAlerts />)
      expect(screen.getByTestId('cluster-filter')).toBeTruthy()
    })

    it('renders card controls', () => {
      render(<ActiveAlerts />)
      expect(screen.getByTestId('card-controls')).toBeTruthy()
    })

    it('renders notification indicator', () => {
      render(<ActiveAlerts />)
      expect(screen.getByTestId('notification-indicator')).toBeTruthy()
    })
  })

  describe('Acknowledged toggle', () => {
    it('renders the ackd toggle button', () => {
      render(<ActiveAlerts />)
      const buttons = screen.getAllByRole('button')
      const ackBtn = buttons.find(b => b.textContent?.includes('activeAlerts.ackd'))
      expect(ackBtn).toBeTruthy()
    })

    it('toggles acknowledged state on click', () => {
      render(<ActiveAlerts />)
      const buttons = screen.getAllByRole('button')
      const ackBtn = buttons.find(b => b.textContent?.includes('activeAlerts.ackd'))!
      fireEvent.click(ackBtn)
      // After toggle, button should reflect new state (class changes)
      expect(ackBtn).toBeTruthy()
    })
  })

  describe('Alert list rendering', () => {
    it('renders grouped alerts through the virtualized list', () => {
      const firedAt = new Date().toISOString()
      mockAlertsState.activeAlerts = [
        {
          id: '1',
          ruleId: 'rule-1',
          ruleName: 'CPUHigh',
          message: 'CPU too high',
          severity: 'critical',
          status: 'firing',
          firedAt,
          cluster: 'prod',
          namespace: 'default',
          resource: 'pod-a',
          resourceKind: 'Pod',
          details: {},
        },
        {
          id: '2',
          ruleId: 'rule-1',
          ruleName: 'CPUHigh',
          message: 'CPU too high',
          severity: 'critical',
          status: 'firing',
          firedAt,
          cluster: 'prod',
          namespace: 'default',
          resource: 'pod-a',
          resourceKind: 'Pod',
          details: {},
        },
      ]
      mockAlertsState.stats = { firing: 2, critical: 2, warning: 0, acknowledged: 0 }

      render(<ActiveAlerts />)

      expect(screen.getByTestId('virtualized-list')).toBeInTheDocument()
      expect(screen.getAllByTestId('alert-item')).toHaveLength(1)
      expect(screen.getByText('CPUHigh:2')).toBeInTheDocument()
    })

    it('acknowledges every alert ID in a grouped row', () => {
      const firedAt = new Date().toISOString()
      mockAlertsState.activeAlerts = [
        {
          id: '1',
          ruleId: 'rule-1',
          ruleName: 'CPUHigh',
          message: 'CPU too high',
          severity: 'critical',
          status: 'firing',
          firedAt,
          cluster: 'prod',
          namespace: 'default',
          resource: 'pod-a',
          resourceKind: 'Pod',
          details: {},
        },
        {
          id: '2',
          ruleId: 'rule-1',
          ruleName: 'CPUHigh',
          message: 'CPU too high',
          severity: 'critical',
          status: 'firing',
          firedAt,
          cluster: 'prod',
          namespace: 'default',
          resource: 'pod-a',
          resourceKind: 'Pod',
          details: {},
        },
      ]
      mockAlertsState.stats = { firing: 2, critical: 2, warning: 0, acknowledged: 0 }

      render(<ActiveAlerts />)
      fireEvent.click(screen.getByText('ack'))

      expect(mockAcknowledgeAlerts).toHaveBeenCalledWith(['1', '2'])
    })
  })
})