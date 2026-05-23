import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertRulesCard } from './AlertRules'
import type { AlertRule } from '../../types/alerts'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count} active`
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseAlertRules = vi.fn()
vi.mock('../../hooks/useAlerts', () => ({
  useAlertRules: () => mockUseAlertRules(),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
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
    string: () => (a: Record<string, string>, b: Record<string, string>) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
  },
}))

const mockAlertRuleEditor = vi.fn()
vi.mock('../alerts/AlertRuleEditor', () => ({
  AlertRuleEditor: (props: { rule?: AlertRule; onSave: (r: unknown) => void; onCancel: () => void }) => {
    mockAlertRuleEditor(props)
    return (
      <div data-testid="alert-rule-editor">
        <button onClick={() => props.onCancel()}>Cancel</button>
        <button
          onClick={() =>
            props.onSave({
              name: 'saved-rule',
              severity: 'info',
              enabled: true,
              condition: { type: 'custom', expression: 'true' },
              channels: [],
              aiDiagnose: false,
            })
          }
        >
          Save
        </button>
      </div>
    )
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardPaginationFooter: ({
    currentPage,
    totalPages,
    needsPagination,
    onPageChange,
  }: {
    currentPage: number
    totalPages: number
    needsPagination: boolean
    onPageChange: (p: number) => void
  }) =>
    needsPagination ? (
      <div data-testid="pagination" data-page={currentPage} data-total={totalPages}>
        <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    ) : null,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2)}`,
    name: 'cpu-high',
    severity: 'warning',
    enabled: true,
    condition: { type: 'custom', expression: 'cpu > 90' },
    channels: [{ type: 'email', enabled: true }],
    aiDiagnose: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const mockCreateRule = vi.fn()
const mockUpdateRule = vi.fn()
const mockToggleRule = vi.fn()
const mockDeleteRule = vi.fn()

const defaultCardData = {
  items: [] as AlertRule[],
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
    sortBy: 'name',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

function setupMocks(opts: {
  rules?: AlertRule[]
  isDemoMode?: boolean
  displayedRules?: AlertRule[]
  needsPagination?: boolean
  totalPages?: number
  currentPage?: number
} = {}) {
  const rules = opts.rules ?? []

  mockUseAlertRules.mockReturnValue({
    rules,
    createRule: mockCreateRule,
    updateRule: mockUpdateRule,
    toggleRule: mockToggleRule,
    deleteRule: mockDeleteRule,
  })

  mockIsDemoMode.mockReturnValue(opts.isDemoMode ?? false)

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: false,
    showEmptyState: false,
  })

  const displayed = opts.displayedRules ?? rules
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

describe('AlertRulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('renders "no rules configured" message when no rules exist', () => {
      setupMocks({ rules: [], displayedRules: [] })
      render(<AlertRulesCard />)
      expect(screen.getByText('noRulesConfigured')).toBeInTheDocument()
    })

    it('shows Create Rule button in empty state', () => {
      setupMocks({ rules: [], displayedRules: [] })
      render(<AlertRulesCard />)
      expect(screen.getByText('createRule')).toBeInTheDocument()
    })

    it('clicking Create Rule button in empty state opens the editor', async () => {
      setupMocks({ rules: [], displayedRules: [] })
      render(<AlertRulesCard />)
      await userEvent.click(screen.getByText('createRule'))
      expect(screen.getByTestId('alert-rule-editor')).toBeInTheDocument()
      expect(mockAlertRuleEditor).toHaveBeenCalledWith(
        expect.objectContaining({ rule: undefined }),
      )
    })
  })

  // ---- Rule list rendering ----

  describe('rule list rendering', () => {
    const rules = [
      makeRule({ name: 'cpu-spike', severity: 'critical', enabled: true }),
      makeRule({ name: 'mem-high', severity: 'warning', enabled: false }),
    ]

    it('renders rule names', () => {
      setupMocks({ rules, displayedRules: rules })
      render(<AlertRulesCard />)
      expect(screen.getByText('cpu-spike')).toBeInTheDocument()
      expect(screen.getByText('mem-high')).toBeInTheDocument()
    })

    it('shows AI badge for rules with aiDiagnose enabled', () => {
      const aiRule = makeRule({ name: 'ai-rule', aiDiagnose: true })
      setupMocks({ rules: [aiRule], displayedRules: [aiRule] })
      render(<AlertRulesCard />)
      expect(screen.getByText('AI')).toBeInTheDocument()
    })

    it('does not show AI badge for rules without aiDiagnose', () => {
      setupMocks({ rules, displayedRules: rules })
      render(<AlertRulesCard />)
      expect(screen.queryByText('AI')).not.toBeInTheDocument()
    })

    it('shows enabled count in header badge', () => {
      const rules2 = [
        makeRule({ enabled: true }),
        makeRule({ enabled: false }),
        makeRule({ enabled: true }),
      ]
      setupMocks({ rules: rules2, displayedRules: rules2 })
      render(<AlertRulesCard />)
      // 2 enabled out of 3
      expect(screen.getByText('2 active')).toBeInTheDocument()
    })

    it('shows channel type badges for each rule', () => {
      const rule = makeRule({
        channels: [
          { type: 'email', enabled: true },
          { type: 'slack', enabled: false },
        ],
      })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('slack')).toBeInTheDocument()
    })
  })

  // ---- Toggle ----

  describe('rule toggle', () => {
    it('calls toggleRule with rule id when toggle button is clicked', async () => {
      const rule = makeRule({ id: 'rule-1', name: 'my-rule', enabled: true })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      const toggleBtn = screen.getByTitle('disableRule')
      await userEvent.click(toggleBtn)
      expect(mockToggleRule).toHaveBeenCalledWith('rule-1')
    })

    it('shows BellOff title when rule is disabled', () => {
      const rule = makeRule({ enabled: false })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)
      expect(screen.getByTitle('enableRule')).toBeInTheDocument()
    })
  })

  // ---- Two-click delete ----

  describe('two-click delete', () => {
    it('first delete click shows confirm state', async () => {
      const rule = makeRule({ id: 'del-rule', name: 'delete-me' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      const deleteBtn = screen.getByTitle('deleteRule')
      await userEvent.click(deleteBtn)

      expect(screen.getByTitle('confirmDelete')).toBeInTheDocument()
      expect(mockDeleteRule).not.toHaveBeenCalled()
    })

    it('second delete click confirms and calls deleteRule', async () => {
      const rule = makeRule({ id: 'del-rule', name: 'delete-me' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      const deleteBtn = screen.getByTitle('deleteRule')
      await userEvent.click(deleteBtn)
      const confirmBtn = screen.getByTitle('confirmDelete')
      await userEvent.click(confirmBtn)

      expect(mockDeleteRule).toHaveBeenCalledWith('del-rule')
    })
  })

  // ---- Edit ----

  describe('rule editing', () => {
    it('clicking edit button opens editor with the rule pre-filled', async () => {
      const rule = makeRule({ name: 'edit-me', id: 'r1' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      await userEvent.click(screen.getByTitle('editRule'))

      expect(screen.getByTestId('alert-rule-editor')).toBeInTheDocument()
      expect(mockAlertRuleEditor).toHaveBeenCalledWith(
        expect.objectContaining({ rule: expect.objectContaining({ name: 'edit-me' }) }),
      )
    })

    it('saving from editor calls updateRule and closes editor', async () => {
      const rule = makeRule({ id: 'r1' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      await userEvent.click(screen.getByTitle('editRule'))
      await userEvent.click(screen.getByText('Save'))

      expect(mockUpdateRule).toHaveBeenCalledWith('r1', expect.any(Object))
      expect(screen.queryByTestId('alert-rule-editor')).not.toBeInTheDocument()
    })

    it('cancelling editor closes it without saving', async () => {
      const rule = makeRule({ id: 'r1' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      await userEvent.click(screen.getByTitle('editRule'))
      await userEvent.click(screen.getByText('Cancel'))

      expect(mockUpdateRule).not.toHaveBeenCalled()
      expect(screen.queryByTestId('alert-rule-editor')).not.toBeInTheDocument()
    })
  })

  // ---- Create new ----

  describe('create new rule', () => {
    it('clicking plus button opens editor with no pre-filled rule', async () => {
      setupMocks({ rules: [makeRule()], displayedRules: [makeRule()] })
      render(<AlertRulesCard />)

      await userEvent.click(screen.getByTitle('createNewRule'))

      expect(screen.getByTestId('alert-rule-editor')).toBeInTheDocument()
      expect(mockAlertRuleEditor).toHaveBeenCalledWith(
        expect.objectContaining({ rule: undefined }),
      )
    })

    it('saving from create editor calls createRule', async () => {
      setupMocks({ rules: [], displayedRules: [] })
      render(<AlertRulesCard />)

      await userEvent.click(screen.getByText('createRule'))
      await userEvent.click(screen.getByText('Save'))

      expect(mockCreateRule).toHaveBeenCalled()
    })
  })

  // ---- Pagination ----

  describe('pagination', () => {
    it('renders pagination footer when needsPagination is true', () => {
      const rules = Array.from({ length: 8 }, (_, i) => makeRule({ name: `rule-${i}` }))
      setupMocks({ rules, displayedRules: rules.slice(0, 5), needsPagination: true, totalPages: 2 })
      render(<AlertRulesCard />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('does not render pagination when needsPagination is false', () => {
      setupMocks({ rules: [makeRule()], displayedRules: [makeRule()] })
      render(<AlertRulesCard />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })

  // ---- Demo mode ----

  describe('demo mode', () => {
    it('passes isDemoData to useCardLoadingState when demo mode is active', () => {
      setupMocks({ isDemoMode: true })
      render(<AlertRulesCard />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })
  })

  // ---- Delete confirm auto-reset ----

  describe('delete confirm auto-reset', () => {
    it('confirm state resets after timeout', async () => {
      vi.useFakeTimers()
      const rule = makeRule({ id: 'del-rule' })
      setupMocks({ rules: [rule], displayedRules: [rule] })
      render(<AlertRulesCard />)

      // Use fireEvent (synchronous) so fake timers don't block the click
      act(() => {
        fireEvent.click(screen.getByTitle('deleteRule'))
      })
      expect(screen.getByTitle('confirmDelete')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3100)
      })

      expect(screen.queryByTitle('confirmDelete')).not.toBeInTheDocument()
      vi.useRealTimers()
    })
  })
})
