import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))
vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    initReactI18next: { type: '3rdParty', init: () => {} },
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  }
})

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockUseAlertRules = vi.fn()
vi.mock('../../../hooks/useAlerts', () => ({
  useAlerts: vi.fn(() => ({ activeAlerts: [], acknowledgedAlerts: [], stats: {}, acknowledgeAlert: vi.fn(), runAIDiagnosis: vi.fn() })),
  useAlertRules: () => mockUseAlertRules(),
  formatCondition: (c: unknown) => String(c ?? ''),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (_items: unknown[], _opts: unknown) => ({
    items: _items,
    totalItems: (_items as unknown[]).length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '', setSearch: vi.fn(),
      localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(),
      availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null }, clusterFilterBtnRef: { current: null }, dropdownStyle: null,
    },
    sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc' as const, setSortDirection: vi.fn(), toggleSortDirection: vi.fn() },
    containerRef: { current: null }, containerStyle: undefined,
  }),
  commonComparators: { string: () => () => 0, number: () => () => 0, statusOrder: () => () => 0, date: () => () => 0, boolean: () => () => 0 },
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../alerts/AlertRuleEditor', () => ({
  AlertRuleEditor: () => <div data-testid="alert-rule-editor" />,
}))

import { AlertRulesCard } from '../AlertRules'

const makeRule = (overrides = {}) => ({
  id: 'rule-1',
  name: 'High CPU',
  severity: 'warning' as const,
  enabled: true,
  condition: { metric: 'cpu', op: '>', threshold: 80 },
  channels: [],
  aiDiagnose: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('AlertRulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockUseAlertRules.mockReturnValue({
      rules: [],
      createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn(),
    })
  })

  it('renders without crashing', () => {
    const { container } = render(<AlertRulesCard />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<AlertRulesCard />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('shows empty state when no rules exist', () => {
    mockUseAlertRules.mockReturnValue({ rules: [], createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn() })
    render(<AlertRulesCard />)
    expect(screen.getByText('alertRules.noRulesConfigured')).toBeTruthy()
  })

  it('renders a rule row when rules exist', () => {
    mockUseAlertRules.mockReturnValue({
      rules: [makeRule({ name: 'High CPU Alert' })],
      createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn(),
    })
    render(<AlertRulesCard />)
    expect(screen.getByText('High CPU Alert')).toBeTruthy()
  })

  it('renders multiple rules', () => {
    mockUseAlertRules.mockReturnValue({
      rules: [
        makeRule({ id: 'r1', name: 'CPU Rule' }),
        makeRule({ id: 'r2', name: 'Memory Rule', severity: 'critical' as const }),
      ],
      createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn(),
    })
    render(<AlertRulesCard />)
    expect(screen.getByText('CPU Rule')).toBeTruthy()
    expect(screen.getByText('Memory Rule')).toBeTruthy()
  })

  it('shows enabled count badge', () => {
    mockUseAlertRules.mockReturnValue({
      rules: [makeRule({ enabled: true }), makeRule({ id: 'r2', name: 'Off Rule', enabled: false })],
      createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn(),
    })
    render(<AlertRulesCard />)
    // badge shows active count
    expect(screen.getByText('alertRules.activeCount')).toBeTruthy()
  })

  it('renders AI badge when aiDiagnose is true', () => {
    mockUseAlertRules.mockReturnValue({
      rules: [makeRule({ aiDiagnose: true })],
      createRule: vi.fn(), updateRule: vi.fn(), toggleRule: vi.fn(), deleteRule: vi.fn(),
    })
    render(<AlertRulesCard />)
    expect(screen.getByText('AI')).toBeTruthy()
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<AlertRulesCard />)
    expect(container).toBeTruthy()
  })
})
