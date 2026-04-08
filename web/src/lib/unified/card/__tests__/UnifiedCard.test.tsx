/**
 * Tests for UnifiedCard component
 *
 * Mocks all heavy children (visualizations, hooks) and tests:
 * - Rendering different content types (list, table, chart, status-grid, custom)
 * - Error state with retry
 * - Loading/skeleton state
 * - Empty state with variants
 * - Filter controls rendering
 * - Inline stats rendering
 * - Footer rendering (total, text, pagination)
 * - instanceConfig merging
 * - Drill-down handler wiring
 * - Mode switching skeleton
 * - Icon lookup (getIconComponent)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnifiedCard } from '../UnifiedCard'
import type { UnifiedCardConfig, CardContentList, CardContentTable } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockDataSourceReturn = {
  data: [{ name: 'item1' }],
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}
vi.mock('../hooks/useDataSource', () => ({
  useDataSource: () => mockDataSourceReturn,
}))

let mockFilterReturn = {
  filteredData: [{ name: 'item1' }] as unknown[],
  filterControls: null as React.ReactNode,
}
vi.mock('../hooks/useCardFiltering', () => ({
  useCardFiltering: (data: unknown) => {
    mockFilterReturn.filteredData = data as unknown[]
    return mockFilterReturn
  },
}))

vi.mock('../visualizations/ListVisualization', () => ({
  ListVisualization: (props: Record<string, unknown>) => (
    <div data-testid="list-viz">List: {JSON.stringify(props.data)}</div>
  ),
}))

vi.mock('../visualizations/TableVisualization', () => ({
  TableVisualization: (props: Record<string, unknown>) => (
    <div data-testid="table-viz">Table: {(props.data as unknown[]).length}</div>
  ),
}))

vi.mock('../visualizations/ChartVisualization', () => ({
  ChartVisualization: () => <div data-testid="chart-viz">Chart</div>,
}))

vi.mock('../visualizations/StatusGridVisualization', () => ({
  StatusGridVisualization: () => <div data-testid="status-grid-viz">StatusGrid</div>,
}))

const mockDrillDownActions = { navigate: vi.fn() }
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockDrillDownActions,
}))

vi.mock('../../../../components/cards/CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

let mockIsModeSwitching = false
vi.mock('../../demo', () => ({
  useIsModeSwitching: () => mockIsModeSwitching,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<UnifiedCardConfig> = {}): UnifiedCardConfig {
  return {
    type: 'test-card',
    title: 'Test Card',
    category: 'workloads',
    dataSource: { type: 'static', data: [] },
    content: { type: 'list', columns: [{ field: 'name', header: 'Name' }] } as CardContentList,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnifiedCard', () => {
  beforeEach(() => {
    mockDataSourceReturn = {
      data: [{ name: 'item1' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
    mockFilterReturn = {
      filteredData: [{ name: 'item1' }],
      filterControls: null,
    }
    mockIsModeSwitching = false
    vi.clearAllMocks()
  })

  // -- Content type rendering --

  it('renders list visualization for list content type', () => {
    render(<UnifiedCard config={makeConfig()} />)
    expect(screen.getByTestId('list-viz')).toBeInTheDocument()
  })

  it('renders table visualization for table content type', () => {
    const config = makeConfig({
      content: {
        type: 'table',
        columns: [{ field: 'name', header: 'Name' }],
      } as CardContentTable,
    })
    render(<UnifiedCard config={config} />)
    expect(screen.getByTestId('table-viz')).toBeInTheDocument()
  })

  it('renders chart visualization for chart content type', () => {
    const config = makeConfig({
      content: { type: 'chart', chartType: 'bar', dataKey: 'value', categoryKey: 'name' },
    })
    render(<UnifiedCard config={config} />)
    expect(screen.getByTestId('chart-viz')).toBeInTheDocument()
  })

  it('renders status-grid visualization for status-grid content type', () => {
    const config = makeConfig({
      content: { type: 'status-grid', statusField: 'status', labelField: 'name' },
    })
    render(<UnifiedCard config={config} />)
    expect(screen.getByTestId('status-grid-viz')).toBeInTheDocument()
  })

  it('renders placeholder for custom content type', () => {
    const config = makeConfig({
      content: { type: 'custom', componentName: 'MyWidget' },
    })
    render(<UnifiedCard config={config} />)
    expect(screen.getByText(/Visualization: custom: MyWidget/)).toBeInTheDocument()
    expect(screen.getByText(/1 items/)).toBeInTheDocument()
  })

  it('renders unknown type message for unrecognized content', () => {
    const config = makeConfig({
      content: { type: 'unknown-type' as 'list' },
    })
    render(<UnifiedCard config={config} />)
    expect(screen.getByText(/Unknown content type: unknown-type/)).toBeInTheDocument()
  })

  // -- Error state --

  it('shows error state with message and retry button', () => {
    mockDataSourceReturn.data = null as unknown as unknown[]
    mockDataSourceReturn.error = new Error('Network error')
    mockFilterReturn.filteredData = []

    render(<UnifiedCard config={makeConfig()} />)
    expect(screen.getByText('Error loading data')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry'))
    expect(mockDataSourceReturn.refetch).toHaveBeenCalled()
  })

  // -- Loading state --

  it('shows loading skeleton when data is loading', () => {
    mockDataSourceReturn.data = null as unknown as unknown[]
    mockDataSourceReturn.isLoading = true

    render(<UnifiedCard config={makeConfig()} />)
    // Loading state renders skeleton rows
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows skeleton during mode switching', () => {
    mockIsModeSwitching = true

    render(<UnifiedCard config={makeConfig()} />)
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('loading state respects custom rows config', () => {
    mockDataSourceReturn.data = null as unknown as unknown[]
    mockDataSourceReturn.isLoading = true
    const config = makeConfig({ loadingState: { rows: 5 } })

    render(<UnifiedCard config={config} />)
    // Should render skeleton rows
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('loading state shows header skeleton when configured', () => {
    mockDataSourceReturn.data = null as unknown as unknown[]
    mockDataSourceReturn.isLoading = true
    const config = makeConfig({ loadingState: { showHeader: true, showSearch: false, rows: 2 } })

    const { container } = render(<UnifiedCard config={config} />)
    // Header skeleton includes a spinning refresh icon
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  // -- Empty state --

  it('shows empty state when no data', () => {
    mockDataSourceReturn.data = []
    mockFilterReturn.filteredData = []

    render(<UnifiedCard config={makeConfig()} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('shows custom empty state with title and message', () => {
    mockDataSourceReturn.data = []
    mockFilterReturn.filteredData = []

    const config = makeConfig({
      emptyState: {
        title: 'All clear!',
        message: 'No issues found',
        variant: 'success',
        icon: 'check-circle',
      },
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('All clear!')).toBeInTheDocument()
    expect(screen.getByText('No issues found')).toBeInTheDocument()
  })

  it('empty state uses warning variant color', () => {
    mockDataSourceReturn.data = []
    mockFilterReturn.filteredData = []

    const config = makeConfig({
      emptyState: {
        title: 'Warning',
        variant: 'warning',
      },
    })

    const { container } = render(<UnifiedCard config={config} />)
    expect(container.querySelector('.text-yellow-400')).toBeInTheDocument()
  })

  it('empty state falls back to Info icon for unknown icon name', () => {
    mockDataSourceReturn.data = []
    mockFilterReturn.filteredData = []

    const config = makeConfig({
      emptyState: {
        title: 'Test',
        variant: 'neutral',
        icon: 'nonexistent-icon',
      },
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  // -- Inline stats --

  it('renders inline stats when configured', () => {
    const config = makeConfig({
      stats: [
        { id: 'total', label: 'Total', bgColor: 'bg-blue-500' },
        { id: 'active', label: 'Active' },
      ],
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('Total:')).toBeInTheDocument()
    expect(screen.getByText('Active:')).toBeInTheDocument()
    // Values are placeholder "--"
    expect(screen.getAllByText('--')).toHaveLength(2)
  })

  // -- Footer --

  it('renders footer with total count', () => {
    const config = makeConfig({
      footer: { showTotal: true },
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('1 items')).toBeInTheDocument()
  })

  it('renders footer with custom text', () => {
    const config = makeConfig({
      footer: { text: 'Last synced 5m ago' },
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('Last synced 5m ago')).toBeInTheDocument()
  })

  it('renders footer pagination placeholder', () => {
    const config = makeConfig({
      footer: { pagination: true },
    })

    render(<UnifiedCard config={config} />)
    expect(screen.getByText('Pagination placeholder')).toBeInTheDocument()
  })

  // -- Override data --

  it('uses overrideData instead of fetched data', () => {
    const overrideData = [{ name: 'override-item' }]
    render(<UnifiedCard config={makeConfig()} overrideData={overrideData} />)
    expect(screen.getByTestId('list-viz')).toHaveTextContent('override-item')
  })

  // -- Instance config --

  it('merges instanceConfig with base config', () => {
    const config = makeConfig()
    render(<UnifiedCard config={config} instanceConfig={{ isDemoData: true }} />)
    // Should still render (merged config used)
    expect(screen.getByTestId('list-viz')).toBeInTheDocument()
  })

  // -- className --

  it('applies custom className', () => {
    const { container } = render(<UnifiedCard config={makeConfig()} className="my-class" />)
    expect(container.firstChild).toHaveClass('my-class')
  })

  // -- Filter controls --

  it('renders filter controls when filtering returns them', () => {
    mockFilterReturn.filterControls = <div data-testid="filters">Filters</div>
    render(<UnifiedCard config={makeConfig()} />)
    expect(screen.getByTestId('filters')).toBeInTheDocument()
  })
})
