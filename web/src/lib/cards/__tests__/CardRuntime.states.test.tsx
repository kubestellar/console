import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  CardRuntime,
  registerFakeHook,
  makeDefinition,
} from './CardRuntime.setup'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CardRuntime — hook missing', () => {
  it('renders CardErrorState when data hook is not registered', () => {
    const def = makeDefinition({ dataSource: { hook: 'useNonexistent' } })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText(/Data hook "useNonexistent" not registered/)).toBeTruthy()
  })
})

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
    const def = makeDefinition({
      dataSource: { hook: 'useCachedLoading' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

describe('CardRuntime — error state', () => {
  it('renders CardErrorState when error exists and no items', () => {
    registerFakeHook('useErrorHook', { error: 'Server error 500', data: [] })
    const def = makeDefinition({ dataSource: { hook: 'useErrorHook' } })
    render(<CardRuntime definition={def} />)
    expect(screen.getByText('Server error 500')).toBeTruthy()
  })

  it('does not render error state when error exists but items are present', () => {
    registerFakeHook('useErrorWithData', { error: 'Stale data', data: [{ name: 'x' }] })
    const def = makeDefinition({
      dataSource: { hook: 'useErrorWithData' },
      columns: [{ field: 'name', header: 'Name' }],
    })
    const { container } = render(<CardRuntime definition={def} />)
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})

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
    expect(container.querySelector('.content-loaded')).toBeTruthy()
  })
})
