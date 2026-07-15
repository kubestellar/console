import React from 'react'
/**
 * Unit tests for DrasiPipelines card component.
 * Covers: loading skeleton, error state, demo data notice, happy-path list,
 * stats summary, search input, pagination, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrasiPipelines } from './DrasiPipelines'
import type { DrasiPipelineData } from '../../lib/demo/drasi'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedDrasiPipelines = vi.fn()
vi.mock('../../hooks/useCachedDrasiPipelines', () => ({
  useCachedDrasiPipelines: () => mockUseCachedDrasiPipelines(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => (
    <div data-testid="skeleton" data-height={height} />
  ),
}))

const mockUseCardData = vi.fn()
vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: (field: string) => (a: Record<string, string>, b: Record<string, string>) =>
      (a[field] ?? '').localeCompare(b[field] ?? ''),
    statusOrder: (_field: string, order: Record<string, number>) => (
      a: Record<string, string>,
      b: Record<string, string>,
    ) => (order[a.status] ?? 99) - (order[b.status] ?? 99),
    number: (field: string) => (a: Record<string, number>, b: Record<string, number>) =>
      (a[field] ?? 0) - (b[field] ?? 0),
    date: (field: string) => (a: Record<string, string>, b: Record<string, string>) =>
      new Date(a[field]).getTime() - new Date(b[field]).getTime(),
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder: string
  }) => (
    <input
      data-testid="card-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: ({
    needsPagination,
    currentPage,
    totalPages,
  }: {
    needsPagination: boolean
    currentPage: number
    totalPages: number
  }) =>
    needsPagination ? (
      <div data-testid="pagination" data-page={currentPage} data-total={totalPages} />
    ) : null,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePipeline = (overrides: Partial<DrasiPipelineData> = {}): DrasiPipelineData => ({
  pipelineName: 'pipeline-alpha',
  status: 'running',
  continuousQueriesCount: 3,
  reactionsCount: 2,
  lastEventAt: new Date(Date.now() - 60000).toISOString(),
  ...overrides,
})

function makeCardDataReturn(items: DrasiPipelineData[] = [makePipeline()]) {
  return {
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
}

const defaultReturn = {
  data: [makePipeline()],
  isLoading: false,
  isRefreshing: false,
  isDemoData: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}

function setup(overrides = {}) {
  mockUseCachedDrasiPipelines.mockReturnValue({ ...defaultReturn, ...overrides })
  mockUseCardData.mockReturnValue(makeCardDataReturn((overrides as { data?: DrasiPipelineData[] }).data ?? defaultReturn.data))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrasiPipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading skeleton
  it('renders skeleton when loading with no data', () => {
    setup({ isLoading: true, data: [] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<DrasiPipelines />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // 2. Error state
  it('renders error state when failed with no data', () => {
    setup({ isFailed: true, data: [] })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    render(<DrasiPipelines />)
    expect(screen.getByText(/Failed to load Drasi pipelines/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls refetch when retry clicked', async () => {
    const refetch = vi.fn()
    setup({ isFailed: true, data: [], refetch })
    mockUseCardData.mockReturnValue(makeCardDataReturn([]))
    const user = userEvent.setup()
    render(<DrasiPipelines />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalled()
  })

  // 3. Demo data
  it('shows demo data notice when isDemoData is true', () => {
    setup({ isDemoData: true })
    render(<DrasiPipelines />)
    expect(screen.getByText('Demo Data')).toBeInTheDocument()
  })

  // 4. Happy path
  it('renders pipeline name', () => {
    render(<DrasiPipelines />)
    expect(screen.getByText('pipeline-alpha')).toBeInTheDocument()
  })

  it('renders Running status label', () => {
    render(<DrasiPipelines />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('renders query count', () => {
    render(<DrasiPipelines />)
    expect(screen.getByText('3 queries')).toBeInTheDocument()
  })

  it('renders reaction count', () => {
    render(<DrasiPipelines />)
    expect(screen.getByText('2 reactions')).toBeInTheDocument()
  })

  it('renders stats summary with running/stopped/error counts', () => {
    const data = [
      makePipeline({ pipelineName: 'a', status: 'running' }),
      makePipeline({ pipelineName: 'b', status: 'stopped' }),
      makePipeline({ pipelineName: 'c', status: 'error' }),
    ]
    setup({ data })
    mockUseCardData.mockReturnValue(makeCardDataReturn(data))
    render(<DrasiPipelines />)
    // Stats grid shows count 1 for each
    const cells = screen.getAllByText('1')
    expect(cells.length).toBeGreaterThanOrEqual(3)
  })

  it('renders total pipeline count in header', () => {
    render(<DrasiPipelines />)
    expect(screen.getByText('1 pipeline')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<DrasiPipelines />)
    expect(screen.getByTestId('card-search')).toBeInTheDocument()
  })

  it('renders pagination when needsPagination is true', () => {
    const data = [makePipeline()]
    mockUseCachedDrasiPipelines.mockReturnValue({ ...defaultReturn, data })
    mockUseCardData.mockReturnValue({
      ...makeCardDataReturn(data),
      needsPagination: true,
      totalPages: 2,
      itemsPerPage: 5,
    })
    render(<DrasiPipelines />)
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  it('renders plural pipeline count label', () => {
    const data = [makePipeline({ pipelineName: 'a' }), makePipeline({ pipelineName: 'b' })]
    setup({ data })
    mockUseCardData.mockReturnValue({ ...makeCardDataReturn(data), totalItems: 2 })
    render(<DrasiPipelines />)
    expect(screen.getByText('2 pipelines')).toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<DrasiPipelines />)
    expect(asFragment()).toMatchSnapshot()
  })
})
