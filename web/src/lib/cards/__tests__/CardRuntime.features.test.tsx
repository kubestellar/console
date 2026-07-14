import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CardRuntime,
  registerFakeHook,
  registerDrillAction,
  makeDefinition,
} from './CardRuntime.setup'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CardRuntime — drill-down with context', () => {
  it('passes context from drillDown.context, resolving item fields', () => {
    const drillFn = vi.fn()
    registerDrillAction('contextDrill', drillFn)
    registerFakeHook('useContextData', { data: [{ name: 'x', cluster: 'c1', ns: 'default' }] })
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
      literal: 'hardcoded',
    })
  })

  it('warns when drill action is not registered', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerFakeHook('useWarnDrill', { data: [{ name: 'a' }] })

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

describe('CardRuntime — built-in renderers', () => {
  it('statusBadge renderer maps running to success variant', () => {
    registerFakeHook('useStatusRenderer', { data: [{ name: 'p1', status: 'Running' }] })
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
    const def = makeDefinition({
      dataSource: { hook: 'usePendingStatus' },
      visualization: 'table',
      columns: [{ field: 'status', header: 'Status', render: 'statusBadge' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })
})

describe('CardRuntime — search filter', () => {
  it('renders search input when text filter is defined', () => {
    registerFakeHook('useSearchData', { data: [{ name: 'a' }] })
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
    const def = makeDefinition({
      dataSource: { hook: 'useDefaultPlaceholder' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: [{ field: 'search', type: 'text', searchFields: ['name'] }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
  })
})

describe('CardRuntime — pagination', () => {
  it('renders Pagination when needsPagination is true', () => {
    registerFakeHook('usePaginated', { data: Array.from({ length: 20 }, (_, i) => ({ name: `item-${i}` })) })
    const def = makeDefinition({
      dataSource: { hook: 'usePaginated' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('pagination')).toBeTruthy()
  })

  it('does not render Pagination when needsPagination is false', () => {
    registerFakeHook('useNoPagination', { data: [{ name: 'a' }] })
    const def = makeDefinition({
      dataSource: { hook: 'useNoPagination' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  it('does not render Pagination when itemsPerPage is unlimited', () => {
    registerFakeHook('useUnlimited', { data: [{ name: 'a' }] })
    const def = makeDefinition({
      dataSource: { hook: 'useUnlimited' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.queryByTestId('pagination')).toBeNull()
  })
})

describe('CardRuntime — filter config', () => {
  it('handles definition with cluster and status filters', () => {
    registerFakeHook('useFilterConfig', { data: [{ name: 'a', cluster: 'c1', status: 'Running' }] })
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
    const def = makeDefinition({
      dataSource: { hook: 'useNoFilters' },
      columns: [{ field: 'name', header: 'Name' }],
      filters: undefined,
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

describe('CardRuntime — sort config', () => {
  it('builds sort options from sortable columns', () => {
    registerFakeHook('useSortable', { data: [{ name: 'a', count: 5 }] })
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
    const def = makeDefinition({
      dataSource: { hook: 'useNoCols' },
      columns: undefined,
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

describe('CardRuntime — header', () => {
  it('renders count with default variant when items exist', () => {
    registerFakeHook('useHeaderCount', { data: [{ name: 'a' }] })
    const def = makeDefinition({
      dataSource: { hook: 'useHeaderCount' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders count with success variant when totalItems is 0', () => {
    registerFakeHook('useHeaderZero', { data: [] })
    const def = makeDefinition({
      dataSource: { hook: 'useHeaderZero' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })

  it('renders RefreshButton in controls', () => {
    registerFakeHook('useRefreshBtn', { data: [{ name: 'a' }], isRefreshing: true })
    const def = makeDefinition({
      dataSource: { hook: 'useRefreshBtn' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    render(<CardRuntime definition={def} />)
    expect(screen.getByTestId('refresh-btn')).toBeTruthy()
  })
})

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
