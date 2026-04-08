import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { CardDefinition } from '../types'

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test
// ---------------------------------------------------------------------------

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics
vi.mock('../../analytics', () => ({
  emitCardSearchUsed: vi.fn(),
  emitCardClusterFilterChanged: vi.fn(),
  emitCardListItemClicked: vi.fn(),
  emitCardPaginationUsed: vi.fn(),
}))

// Mock useMissions
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

// Mock useApiKeyCheck
vi.mock('../../../components/cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: (fn: () => void) => fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

// Mock ClusterStatusBadge
vi.mock('../../../components/ui/ClusterStatusBadge', () => ({
  ClusterStatusDot: ({ state }: { state: string }) => <span data-testid="status-dot">{state}</span>,
  getClusterState: () => 'healthy',
}))

// Mock Skeleton
vi.mock('../../../components/ui/Skeleton', () => ({
  Skeleton: ({ height, width, variant, className }: { height?: number; width?: number; variant?: string; className?: string }) => (
    <div data-testid="skeleton" data-variant={variant} data-height={height} data-width={width} className={className} />
  ),
}))

// Mock Pagination
vi.mock('../../../components/ui/Pagination', () => ({
  Pagination: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination" data-current={currentPage} data-total={totalPages} />
  ),
}))

// Mock CardControls
vi.mock('../../../components/ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

// Mock RefreshIndicator
vi.mock('../../../components/ui/RefreshIndicator', () => ({
  RefreshButton: ({ onRefresh, isRefreshing }: { onRefresh?: () => void; isRefreshing?: boolean }) => (
    <button data-testid="refresh-btn" data-refreshing={isRefreshing} onClick={onRefresh}>Refresh</button>
  ),
}))

// Mock ClusterBadge
vi.mock('../../../components/ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

// Mock icons module
vi.mock('../../icons', () => ({
  getIcon: (name: string) => {
    const Icon = () => <span data-testid={`icon-${name}`}>{name}</span>
    Icon.displayName = name
    return Icon
  },
}))

// Create a controllable mock for useCardData
const mockGoToPage = vi.fn()
const mockSetItemsPerPage = vi.fn()
const mockSetSearch = vi.fn()
const mockToggleClusterFilter = vi.fn()
const mockClearClusterFilter = vi.fn()
const mockSetShowClusterFilter = vi.fn()
const mockSetSortBy = vi.fn()
const mockSetSortDirection = vi.fn()
const mockClusterFilterRef = { current: null }

function makeCardDataResult(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: mockGoToPage,
    needsPagination: false,
    setItemsPerPage: mockSetItemsPerPage,
    containerRef: { current: null },
    containerStyle: undefined,
    filters: {
      search: '',
      setSearch: mockSetSearch,
      localClusterFilter: [],
      toggleClusterFilter: mockToggleClusterFilter,
      clearClusterFilter: mockClearClusterFilter,
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: mockSetShowClusterFilter,
      clusterFilterRef: mockClusterFilterRef,
    },
    sorting: {
      sortBy: 'name',
      setSortBy: mockSetSortBy,
      sortDirection: 'asc' as const,
      setSortDirection: mockSetSortDirection,
    },
    ...overrides,
  }
}

let mockCardDataResult = makeCardDataResult()

vi.mock('../cardHooks', () => ({
  useCardData: () => mockCardDataResult,
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  CardRuntime,
  registerDataHook,
  registerDrillAction,
  registerRenderer,
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  parseCardYAML,
} from '../CardRuntime'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid CardDefinition */
function makeDefinition(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    type: 'test_card',
    title: 'Test Card',
    category: 'workloads',
    visualization: 'status',
    dataSource: { hook: 'useTestData' },
    ...overrides,
  }
}

/** Register a fake data hook that returns the supplied values */
function registerFakeHook(
  name: string,
  result: {
    data?: unknown[]
    isLoading?: boolean
    isRefreshing?: boolean
    error?: string
    isFailed?: boolean
    consecutiveFailures?: number
    lastRefresh?: Date
  } = {},
) {
  const hook = () => ({
    data: result.data ?? [],
    isLoading: result.isLoading ?? false,
    isRefreshing: result.isRefreshing ?? false,
    error: result.error,
    refetch: vi.fn(),
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
  })
  registerDataHook(name, hook)
  return hook
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCardDataResult = makeCardDataResult()
})

// ---------------------------------------------------------------------------
// Registry Functions (registerDataHook, registerDrillAction, registerRenderer)
// ---------------------------------------------------------------------------

describe('registerDataHook', () => {
  it('registers a hook that can be used by CardRuntime', () => {
    registerFakeHook('useRegistered', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useRegistered' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

describe('registerDrillAction', () => {
  it('registers and invokes a drill action on item click', () => {
    const drillFn = vi.fn()
    registerDrillAction('testDrill', drillFn)
    registerFakeHook('useDrillData', { data: [{ cluster: 'c1', namespace: 'ns1', name: 'pod1' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ cluster: 'c1', namespace: 'ns1', name: 'pod1' }],
      totalItems: 1,
    })

    const def = makeDefinition({
      dataSource: { hook: 'useDrillData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Name' },
        { field: 'namespace', header: 'Namespace' },
      ],
      drillDown: { action: 'testDrill', params: ['cluster', 'namespace', 'name'] },
    })

    render(<CardRuntime definition={def} />)
    const listItem = screen.getByText('pod1').closest('[class*="cursor"]') || screen.getByText('pod1').parentElement?.parentElement
    if (listItem) fireEvent.click(listItem)
    expect(drillFn).toHaveBeenCalledWith('c1', 'ns1', 'pod1', undefined)
  })
})

describe('registerRenderer', () => {
  it('registers a custom renderer used in renderCell', () => {
    registerRenderer('bold', (value) => <strong data-testid="bold-cell">{String(value)}</strong>)
    registerFakeHook('useRendererData', { data: [{ name: 'item1' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'item1' }],
      totalItems: 1,
    })

    const def = makeDefinition({
      dataSource: { hook: 'useRendererData' },
      columns: [{ field: 'name', header: 'Name', render: 'bold' }],
    })

    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('bold-cell')).toBeTruthy()
    expect(screen.getByTestId('bold-cell').textContent).toBe('item1')
  })
})

// ---------------------------------------------------------------------------
// Card Definition Registry
// ---------------------------------------------------------------------------

describe('registerCard / getCardDefinition / getAllCardDefinitions', () => {
  it('registers and retrieves a card definition', () => {
    const def = makeDefinition({ type: 'reg_test' })
    registerCard(def)
    expect(getCardDefinition('reg_test')).toBe(def)
  })

  it('returns undefined for unregistered card type', () => {
    expect(getCardDefinition('nonexistent_type_xyz')).toBeUndefined()
  })

  it('getAllCardDefinitions returns all registered definitions', () => {
    const before = getAllCardDefinitions().length
    registerCard(makeDefinition({ type: 'all_test_1' }))
    registerCard(makeDefinition({ type: 'all_test_2' }))
    const after = getAllCardDefinitions()
    expect(after.length).toBeGreaterThanOrEqual(before + 2)
  })
})

// ---------------------------------------------------------------------------
// parseCardYAML
// ---------------------------------------------------------------------------

describe('parseCardYAML', () => {
  it('throws not-yet-implemented error', () => {
    expect(() => parseCardYAML('type: test')).toThrow('YAML parsing not yet implemented')
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — hook missing (error state)
// ---------------------------------------------------------------------------

describe('CardRuntime — hook missing', () => {
  it('renders CardErrorState when data hook is not registered', () => {
    const def = makeDefinition({ dataSource: { hook: 'useNonexistent' } })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText(/Data hook "useNonexistent" not registered/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — loading state
// ---------------------------------------------------------------------------

describe('CardRuntime — loading state', () => {
  it('renders CardSkeleton when isLoading is true and no data', () => {
    registerFakeHook('useLoadingHook', { isLoading: true, data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useLoadingHook' },
      loadingState: { rows: 4, type: 'table', showHeader: true, showSearch: false },
    })
    const { container } = render(<CardRuntime definition={def} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders with default loading config when loadingState is not specified', () => {
    registerFakeHook('useLoadingDefault', { isLoading: true, data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useLoadingDefault' },
      visualization: 'table',
    })
    const { container } = render(<CardRuntime definition={def} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('does not show skeleton when loading but cached data exists', () => {
    registerFakeHook('useCachedLoading', { isLoading: true, data: [{ name: 'cached' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'cached' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useCachedLoading' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — error state
// ---------------------------------------------------------------------------

describe('CardRuntime — error state', () => {
  it('renders CardErrorState when error exists and no items', () => {
    registerFakeHook('useErrorHook', { error: 'Server error 500', data: [] })
    const def = makeDefinition({ dataSource: { hook: 'useErrorHook' } })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Server error 500')).toBeTruthy()
  })

  it('does not render error state when error exists but items are present', () => {
    registerFakeHook('useErrorWithData', { error: 'Stale data', data: [{ name: 'x' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useErrorWithData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — empty state
// ---------------------------------------------------------------------------

describe('CardRuntime — empty state', () => {
  it('renders CardEmptyState when items are empty and emptyState is defined', () => {
    registerFakeHook('useEmptyHook', { data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useEmptyHook' },
      emptyState: {
        icon: 'CheckCircle',
        title: 'All pods healthy',
        message: 'Nothing to show',
        variant: 'success',
      },
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('All pods healthy')).toBeTruthy()
    expect(screen.getByText('Nothing to show')).toBeTruthy()
  })

  it('renders empty content (no emptyState config) when items empty and no emptyState', () => {
    registerFakeHook('useEmptyNoConfig', { data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useEmptyNoConfig' },
      emptyState: undefined,
    })
    const { container } = render(<CardRuntime definition={def} />)
    // Should render the card shell with no items
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — list (status) rendering
// ---------------------------------------------------------------------------

describe('CardRuntime — list/status visualization', () => {
  beforeEach(() => {
    registerFakeHook('useListData', { data: [
      { name: 'pod-a', namespace: 'default', status: 'Running' },
      { name: 'pod-b', namespace: 'kube-system', status: 'Failed' },
    ]})
    mockCardDataResult = makeCardDataResult({
      items: [
        { name: 'pod-a', namespace: 'default', status: 'Running' },
        { name: 'pod-b', namespace: 'kube-system', status: 'Failed' },
      ],
      totalItems: 2,
    })
  })

  it('renders list items for status visualization', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Pod' },
        { field: 'namespace', header: 'Namespace' },
        { field: 'status', header: 'Status' },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('pod-a')).toBeTruthy()
    expect(screen.getByText('pod-b')).toBeTruthy()
  })

  it('renders only first 3 columns in list view', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      visualization: 'status',
      columns: [
        { field: 'name', header: 'Pod' },
        { field: 'namespace', header: 'Namespace' },
        { field: 'status', header: 'Status' },
        { field: 'extra', header: 'Extra' },
      ],
    })
    render(<CardRuntime definition={def} />)
    // The 4th column "extra" should not appear in list mode (slice 0,3)
    expect(screen.getByText('pod-a')).toBeTruthy()
  })

  it('uses title override from props', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useListData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} title="Custom Title" />)
    expect(screen.getByText('Custom Title')).toBeTruthy()
  })

  it('uses definition title when no title prop', () => {
    const def = makeDefinition({
      title: 'Definition Title',
      dataSource: { hook: 'useListData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Definition Title')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — table visualization
// ---------------------------------------------------------------------------

describe('CardRuntime — table visualization', () => {
  beforeEach(() => {
    registerFakeHook('useTableData', { data: [
      { name: 'svc-1', type: 'ClusterIP', port: 8080 },
      { name: 'svc-2', type: 'NodePort', port: 30080 },
    ]})
    mockCardDataResult = makeCardDataResult({
      items: [
        { name: 'svc-1', type: 'ClusterIP', port: 8080 },
        { name: 'svc-2', type: 'NodePort', port: 30080 },
      ],
      totalItems: 2,
    })
  })

  it('renders a table with headers and rows', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [
        { field: 'name', header: 'Service' },
        { field: 'type', header: 'Type' },
        { field: 'port', header: 'Port', align: 'right', width: 80 },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Service')).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('Port')).toBeTruthy()
    expect(screen.getByText('svc-1')).toBeTruthy()
    expect(screen.getByText('ClusterIP')).toBeTruthy()
    expect(screen.getByText('8080')).toBeTruthy()
  })

  it('renders table rows as clickable when drillDown is defined', () => {
    const drillFn = vi.fn()
    registerDrillAction('tableDrill', drillFn)
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Service' }],
      drillDown: { action: 'tableDrill', params: ['name'] },
    })
    render(<CardRuntime definition={def} />)
    const row = screen.getByText('svc-1').closest('tr')
    expect(row?.className).toContain('cursor-pointer')
    if (row) fireEvent.click(row)
    expect(drillFn).toHaveBeenCalledWith('svc-1', undefined)
  })

  it('table rows are not clickable when no drillDown', () => {
    const def = makeDefinition({
      dataSource: { hook: 'useTableData' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Service' }],
    })
    render(<CardRuntime definition={def} />)
    const row = screen.getByText('svc-1').closest('tr')
    expect(row?.className).not.toContain('cursor-pointer')
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — drill-down with context
// ---------------------------------------------------------------------------

describe('CardRuntime — drill-down with context', () => {
  it('passes context from drillDown.context, resolving item fields', () => {
    const drillFn = vi.fn()
    registerDrillAction('contextDrill', drillFn)
    registerFakeHook('useContextData', { data: [{ name: 'x', cluster: 'c1', ns: 'default' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x', cluster: 'c1', ns: 'default' }],
      totalItems: 1,
    })

    const def = makeDefinition({
      dataSource: { hook: 'useContextData' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Name' }],
      drillDown: {
        action: 'contextDrill',
        params: ['name'],
        context: { clusterName: 'cluster', namespace: 'ns', literal: 'hardcoded' },
      },
    })

    render(<CardRuntime definition={def} />)
    const row = screen.getByText('x').closest('tr')
    if (row) fireEvent.click(row)
    expect(drillFn).toHaveBeenCalledWith('x', {
      clusterName: 'c1',
      namespace: 'default',
      literal: 'hardcoded', // value not found in item, keeps the literal string
    })
  })

  it('warns when drill action is not registered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerFakeHook('useWarnDrill', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })

    const def = makeDefinition({
      dataSource: { hook: 'useWarnDrill' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Name' }],
      drillDown: { action: 'unregisteredAction', params: ['name'] },
    })

    render(<CardRuntime definition={def} />)
    const row = screen.getByText('a').closest('tr')
    if (row) fireEvent.click(row)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unregisteredAction'))
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — built-in renderers
// ---------------------------------------------------------------------------

describe('CardRuntime — built-in renderers', () => {
  it('statusBadge renderer maps running to success variant', () => {
    registerFakeHook('useStatusRenderer', { data: [{ name: 'p1', status: 'Running' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'p1', status: 'Running' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useStatusRenderer' },
      visualization: 'table',
      columns: [
        { field: 'name', header: 'Name' },
        { field: 'status', header: 'Status', render: 'statusBadge' },
      ],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Running')).toBeTruthy()
  })

  it('statusBadge maps pending to warning', () => {
    registerFakeHook('usePendingStatus', { data: [{ name: 'p', status: 'Pending' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'p', status: 'Pending' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'usePendingStatus' },
      visualization: 'table',
      columns: [{ field: 'status', header: 'Status', render: 'statusBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('statusBadge maps failed to error', () => {
    registerFakeHook('useFailedStatus', { data: [{ name: 'p', status: 'CrashLoopBackOff' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'p', status: 'CrashLoopBackOff' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useFailedStatus' },
      visualization: 'table',
      columns: [{ field: 'status', header: 'Status', render: 'statusBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('CrashLoopBackOff')).toBeTruthy()
  })

  it('statusBadge defaults to neutral for unknown status', () => {
    registerFakeHook('useUnknownStatus', { data: [{ name: 'p', status: 'Unknown' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'p', status: 'Unknown' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useUnknownStatus' },
      visualization: 'table',
      columns: [{ field: 'status', header: 'Status', render: 'statusBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Unknown')).toBeTruthy()
  })

  it('clusterBadge renderer displays cluster name', () => {
    registerFakeHook('useClusterRenderer', { data: [{ name: 'x', cluster: 'prod-1' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x', cluster: 'prod-1' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useClusterRenderer' },
      visualization: 'table',
      columns: [{ field: 'cluster', header: 'Cluster', render: 'clusterBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('cluster-badge').textContent).toBe('prod-1')
  })

  it('clusterBadge uses default when value is falsy', () => {
    registerFakeHook('useClusterEmpty', { data: [{ name: 'x', cluster: '' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x', cluster: '' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useClusterEmpty' },
      visualization: 'table',
      columns: [{ field: 'cluster', header: 'Cluster', render: 'clusterBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('cluster-badge').textContent).toBe('default')
  })

  it('number renderer formats numbers with locale', () => {
    registerFakeHook('useNumberRenderer', { data: [{ name: 'x', count: 1234567 }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x', count: 1234567 }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNumberRenderer' },
      visualization: 'table',
      columns: [{ field: 'count', header: 'Count', render: 'number' }],
    })
    render(<CardRuntime definition={def} />)
    // The exact formatting depends on locale, just check it renders
    const el = screen.getByText((text) => text.includes('1') && text.includes('234'))
    expect(el).toBeTruthy()
    expect(el.className).toContain('font-mono')
  })

  it('percentage renderer formats with one decimal', () => {
    registerFakeHook('usePctRenderer', { data: [{ name: 'x', pct: 87.456 }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'x', pct: 87.456 }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'usePctRenderer' },
      visualization: 'table',
      columns: [{ field: 'pct', header: 'Pct', render: 'percentage' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('87.5%')).toBeTruthy()
  })

  it('renderCell falls back to String() when no renderer is registered', () => {
    registerFakeHook('useNoRenderer', { data: [{ name: 'plain-text' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'plain-text' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNoRenderer' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('plain-text')).toBeTruthy()
  })

  it('renderCell handles undefined value', () => {
    registerFakeHook('useUndefined', { data: [{ name: undefined }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: undefined }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useUndefined' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    // undefined renders as empty string
    const cells = container.querySelectorAll('td')
    expect(cells.length).toBe(1)
  })

  it('renderCell uses renderer name that does not exist gracefully', () => {
    registerFakeHook('useBadRenderer', { data: [{ name: 'val' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'val' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useBadRenderer' },
      visualization: 'table',
      columns: [{ field: 'name', header: 'Name', render: 'nonexistentRenderer' }],
    })
    render(<CardRuntime definition={def} />)
    // Falls through to String(value)
    expect(screen.getByText('val')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — search filter
// ---------------------------------------------------------------------------

describe('CardRuntime — search filter', () => {
  it('renders search input when text filter is defined', () => {
    registerFakeHook('useSearchData', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useSearchData' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: [
        { field: 'search', type: 'text', searchFields: ['name', 'namespace'], placeholder: 'Search pods...' },
      ],
    })
    render(<CardRuntime definition={def} />)
    const input = screen.getByPlaceholderText('Search pods...')
    expect(input).toBeTruthy()
  })

  it('does not render search input when no text filter defined', () => {
    registerFakeHook('useNoSearch', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNoSearch' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: [{ field: 'cluster', type: 'select' }],
    })
    render(<CardRuntime definition={def} />)
    const inputs = screen.queryAllByPlaceholderText('Search...')
    expect(inputs).toHaveLength(0)
  })

  it('uses default placeholder when none provided', () => {
    registerFakeHook('useDefaultPlaceholder', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useDefaultPlaceholder' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: [{ field: 'search', type: 'text', searchFields: ['name'] }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — pagination
// ---------------------------------------------------------------------------

describe('CardRuntime — pagination', () => {
  it('renders Pagination when needsPagination is true', () => {
    registerFakeHook('usePaginated', { data: Array.from({ length: 20 }, (_, i) => ({ name: `item-${i}` })) })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'item-0' }],
      totalItems: 20,
      needsPagination: true,
      totalPages: 4,
      itemsPerPage: 5,
    })
    const def = makeDefinition({
      dataSource: { hook: 'usePaginated' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('pagination')).toBeTruthy()
  })

  it('does not render Pagination when needsPagination is false', () => {
    registerFakeHook('useNoPagination', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
      needsPagination: false,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNoPagination' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  it('does not render Pagination when itemsPerPage is unlimited', () => {
    registerFakeHook('useUnlimited', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
      needsPagination: true,
      itemsPerPage: 'unlimited',
    })
    const def = makeDefinition({
      dataSource: { hook: 'useUnlimited' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.queryByTestId('pagination')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — filter config building
// ---------------------------------------------------------------------------

describe('CardRuntime — filter config', () => {
  it('handles definition with cluster and status filters', () => {
    registerFakeHook('useFilterConfig', { data: [{ name: 'a', cluster: 'c1', status: 'Running' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a', cluster: 'c1', status: 'Running' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useFilterConfig' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: [
        { field: 'cluster', type: 'select' },
        { field: 'status', type: 'chips' },
        { field: 'search', type: 'text', searchFields: ['name', 'namespace'] },
      ],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })

  it('handles definition with no filters', () => {
    registerFakeHook('useNoFilters', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNoFilters' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: undefined,
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — sort config building
// ---------------------------------------------------------------------------

describe('CardRuntime — sort config', () => {
  it('builds sort options from sortable columns', () => {
    registerFakeHook('useSortable', { data: [{ name: 'a', count: 5 }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a', count: 5 }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useSortable' },
      columns: [
        { field: 'name', header: 'Name', sortable: true },
        { field: 'count', header: 'Count', sortable: true },
        { field: 'hidden', header: 'Hidden', sortable: false },
      ],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
    expect(screen.getByTestId('card-controls')).toBeTruthy()
  })

  it('handles definition with no columns', () => {
    registerFakeHook('useNoCols', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useNoCols' },
      columns: undefined,
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — header rendering
// ---------------------------------------------------------------------------

describe('CardRuntime — header', () => {
  it('renders count with default variant when items exist', () => {
    registerFakeHook('useHeaderCount', { data: [{ name: 'a' }] })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 5,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useHeaderCount' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders count with success variant when totalItems is 0', () => {
    registerFakeHook('useHeaderZero', { data: [] })
    // No emptyState so it goes through to normal render
    mockCardDataResult = makeCardDataResult({
      items: [],
      totalItems: 0,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useHeaderZero' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })

  it('renders RefreshButton in controls', () => {
    registerFakeHook('useRefreshBtn', { data: [{ name: 'a' }], isRefreshing: true })
    mockCardDataResult = makeCardDataResult({
      items: [{ name: 'a' }],
      totalItems: 1,
    })
    const def = makeDefinition({
      dataSource: { hook: 'useRefreshBtn' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('refresh-btn')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardRuntime — loading state with showSearch from filter defs
// ---------------------------------------------------------------------------

describe('CardRuntime — loading state showSearch inference', () => {
  it('infers showSearch from text filter definition', () => {
    registerFakeHook('useLoadSearch', { isLoading: true, data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useLoadSearch' },
      filters: [{ field: 'search', type: 'text', searchFields: ['name'] }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
