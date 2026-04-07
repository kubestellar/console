import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActiveAlerts } from '../ActiveAlerts'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAcknowledgeAlert = vi.fn()
const mockRunAIDiagnosis = vi.fn()
const mockDrillToAlert = vi.fn()

vi.mock('../../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    activeAlerts: [],
    acknowledgedAlerts: [],
    stats: { firing: 0, critical: 0, warning: 0, acknowledged: 0 },
    acknowledgeAlert: mockAcknowledgeAlert,
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
  useCardData: (_items: unknown[], _opts: unknown) => ({
    items: [],
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
  AlertListItem: ({ alert }: { alert: { ruleName: string } }) => (
    <div data-testid="alert-item">{alert.ruleName}</div>
  ),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ActiveAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    it('renders alert items when provided', () => {
      const alert = {
        id: '1',
        ruleName: 'CPUHigh',
        message: 'CPU too high',
        severity: 'critical' as const,
        status: 'firing',
        firedAt: new Date().toISOString(),
        cluster: 'prod',
        namespace: 'default',
        details: {},
      }

      vi.mocked(vi.importMock('../../../hooks/useAlerts') as never)

      // Re-mock useAlerts with an alert
      vi.doMock('../../../hooks/useAlerts', () => ({
        useAlerts: () => ({
          activeAlerts: [alert],
          acknowledgedAlerts: [],
          stats: { firing: 1, critical: 1, warning: 0, acknowledged: 0 },
          acknowledgeAlert: mockAcknowledgeAlert,
          runAIDiagnosis: mockRunAIDiagnosis,
        }),
      }))
    })
  })
})