import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '../../ui/Input'
import { HardwareHealthCardHeader } from '../HardwareHealthCardHeader'
import type { SortField, ViewMode } from '../HardwareHealthCard.types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) =>
      typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key,
  }),
}))

vi.mock('../../../hooks/useSnoozedAlerts', () => ({
  SNOOZE_DURATIONS: { '1h': 60, '1d': 1440 },
  formatSnoozeRemaining: (m: number) => `${m}m`,
}))

vi.mock('../../../hooks/useKeyboardNav', () => ({
  useKeyboardNav: () => ({
    containerRef: { current: null },
    handleKeyDown: vi.fn(),
    focusMatchingItem: vi.fn(),
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <Input aria-label="search" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

function baseProps(overrides: Partial<React.ComponentProps<typeof HardwareHealthCardHeader>> = {}) {
  const props: React.ComponentProps<typeof HardwareHealthCardHeader> = {
    criticalCount: 0,
    warningCount: 0,
    deduplicatedNodeCount: 0,
    viewMode: 'inventory',
    onViewModeChange: vi.fn(),
    tabListProps: { role: 'tablist', 'aria-orientation': 'horizontal', onKeyDown: vi.fn() },
    getTabProps: (tab: ViewMode) => ({
      id: `${tab}-tab`,
      role: 'tab',
      tabIndex: 0,
      'data-tab-id': tab,
      'aria-selected': false,
      onClick: vi.fn(),
    }),
    deduplicatedInventoryCount: 0,
    activeAlertCount: 0,
    snoozedAlertCount: 0,
    showSnoozed: false,
    onToggleShowSnoozed: vi.fn(),
    visibleAlertIds: [],
    snoozeAllMenuOpen: false,
    onToggleSnoozeAllMenu: vi.fn(),
    onSnoozeAll: vi.fn(),
    onClearAllSnoozed: vi.fn(),
    snoozeAllMenuRef: { current: null },
    availableClustersForFilter: [],
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
    itemsPerPage: 10,
    setItemsPerPage: vi.fn(),
    sortField: 'severity' as SortField,
    currentSortOptions: [{ value: 'severity' as SortField, label: 'Severity' }],
    setSortField: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    fetchError: null,
    retryError: null,
    handleRetry: vi.fn(),
    isRetrying: false,
    isRefreshing: false,
    isDemoData: false,
    ...overrides,
  }
  return props
}

describe('HardwareHealthCardHeader', () => {
  it('renders zero counts with search input and tablist', () => {
    render(<HardwareHealthCardHeader {...baseProps({ criticalCount: 0, warningCount: 0, deduplicatedNodeCount: 5 })} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search devices...')).toBeInTheDocument()
    // deduplicatedNodeCount rendered in nodes-tracked button
    expect(screen.getByLabelText('cards:hardwareHealth.viewNodesInventoryAria')).toHaveTextContent('5')
  })

  it('shows critical and warning counts', () => {
    render(<HardwareHealthCardHeader {...baseProps({ criticalCount: 3, warningCount: 7 })} />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('renders fetch-error banner with Retry button that fires handleRetry', () => {
    const handleRetry = vi.fn()
    render(<HardwareHealthCardHeader {...baseProps({ fetchError: 'boom', handleRetry })} />)
    expect(screen.getByText('boom')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(handleRetry).toHaveBeenCalledTimes(1)
  })

  it('prefers retryError over fetchError when both are set', () => {
    render(<HardwareHealthCardHeader {...baseProps({ fetchError: 'stale', retryError: 'fresh' })} />)
    expect(screen.getByText('fresh')).toBeInTheDocument()
    expect(screen.queryByText('stale')).not.toBeInTheDocument()
  })

  it('shows a Demo badge only when isDemoData is true', () => {
    const { rerender } = render(<HardwareHealthCardHeader {...baseProps({ isDemoData: false })} />)
    expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    rerender(<HardwareHealthCardHeader {...baseProps({ isDemoData: true })} />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
  })

  it('switches to inventory mode when nodes-tracked button is clicked', () => {
    const onViewModeChange = vi.fn()
    render(<HardwareHealthCardHeader {...baseProps({ onViewModeChange })} />)
    fireEvent.click(screen.getByLabelText('cards:hardwareHealth.viewNodesInventoryAria'))
    expect(onViewModeChange).toHaveBeenCalledWith('inventory')
  })

  it('renders snooze-all menu with duration options when open in alerts mode with visible alerts', () => {
    render(
      <HardwareHealthCardHeader
        {...baseProps({
          viewMode: 'alerts',
          activeAlertCount: 2,
          visibleAlertIds: ['a1', 'a2'],
          snoozeAllMenuOpen: true,
          snoozedAlertCount: 1,
        })}
      />,
    )
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    // Each SNOOZE_DURATIONS key renders a menuitem
    expect(screen.getByText('1h')).toBeInTheDocument()
    expect(screen.getByText('1d')).toBeInTheDocument()
    // clear-all row appears when snoozedAlertCount > 0
    expect(screen.getByLabelText('cards:hardwareHealth.clearAllSnoozesAria')).toBeInTheDocument()
  })

  it('typing in search input calls setSearch', () => {
    const setSearch = vi.fn()
    render(<HardwareHealthCardHeader {...baseProps({ setSearch })} />)
    fireEvent.change(screen.getByPlaceholderText('Search devices...'), { target: { value: 'gpu' } })
    expect(setSearch).toHaveBeenCalledWith('gpu')
  })
})
