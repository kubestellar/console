import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CardSkeleton,
  CardEmptyState,
  CardErrorState,
  CardStatusBadge,
  CardHeader,
  CardClusterIndicator,
  MetricTile,
  CardFilterChips,
} from '../CardComponents'
import type {
  FilterChip,
} from '../CardComponents'
import { CheckCircle, AlertTriangle, Info, Server } from 'lucide-react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics to avoid side effects
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
  Pagination: () => <div data-testid="pagination" />,
}))

// Mock CardControls
vi.mock('../../../components/ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// CardSkeleton
// ---------------------------------------------------------------------------

describe('CardSkeleton', () => {
  it('renders with default props', () => {
    const { container } = render(<CardSkeleton />)
    // Default: 3 rows, list type, showHeader true
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders the specified number of rows for list type', () => {
    const { container } = render(<CardSkeleton rows={5} type="list" showHeader={false} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons).toHaveLength(5)
  })

  it('renders header when showHeader is true', () => {
    const { container } = render(<CardSkeleton showHeader={true} />)
    // Header adds extra skeleton elements
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    const headerSkeletons = skeletons.length

    const { container: noHeaderContainer } = render(<CardSkeleton showHeader={false} rows={3} />)
    const noHeaderSkeletons = noHeaderContainer.querySelectorAll('[data-testid="skeleton"]')

    expect(headerSkeletons).toBeGreaterThan(noHeaderSkeletons.length)
  })

  it('renders search skeleton when showSearch is true', () => {
    const { container: withSearch } = render(<CardSkeleton showSearch={true} showHeader={false} rows={1} />)
    const { container: withoutSearch } = render(<CardSkeleton showSearch={false} showHeader={false} rows={1} />)

    const withSearchCount = withSearch.querySelectorAll('[data-testid="skeleton"]').length
    const withoutSearchCount = withoutSearch.querySelectorAll('[data-testid="skeleton"]').length

    expect(withSearchCount).toBeGreaterThan(withoutSearchCount)
  })

  it('renders metric layout with grid for metric type', () => {
    const { container } = render(<CardSkeleton type="metric" rows={4} showHeader={false} />)
    // Metric type renders a grid with circular skeletons
    const grid = container.querySelector('.grid')
    expect(grid).toBeTruthy()
  })

  it('renders chart layout with single tall skeleton', () => {
    const { container } = render(<CardSkeleton type="chart" showHeader={false} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    // Chart type renders a single skeleton
    expect(skeletons).toHaveLength(1)
    expect(skeletons[0].getAttribute('data-height')).toBe('200')
  })

  it('uses custom rowHeight when provided', () => {
    const customHeight = 120
    const { container } = render(<CardSkeleton type="list" rows={2} showHeader={false} rowHeight={customHeight} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    for (const skeleton of skeletons) {
      expect(skeleton.getAttribute('data-height')).toBe(String(customHeight))
    }
  })

  it('uses type-based default height for table type', () => {
    const { container } = render(<CardSkeleton type="table" rows={1} showHeader={false} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton"]')
    expect(skeletons[0].getAttribute('data-height')).toBe('48')
  })
})

// ---------------------------------------------------------------------------
// CardEmptyState
// ---------------------------------------------------------------------------

describe('CardEmptyState', () => {
  it('renders with title', () => {
    render(<CardEmptyState title="No data found" />)
    expect(screen.getByText('No data found')).toBeTruthy()
  })

  it('renders with message', () => {
    render(<CardEmptyState title="Empty" message="Try adjusting filters" />)
    expect(screen.getByText('Try adjusting filters')).toBeTruthy()
  })

  it('does not render message when not provided', () => {
    const { container } = render(<CardEmptyState title="Empty" />)
    const paragraphs = container.querySelectorAll('p')
    // Should have title paragraph but not a secondary message
    expect(paragraphs).toHaveLength(1)
  })

  it('renders success variant', () => {
    const { container } = render(<CardEmptyState title="All good" variant="success" />)
    // Success variant should use green classes
    const iconBg = container.querySelector('.bg-green-500\\/10')
    expect(iconBg).toBeTruthy()
  })

  it('renders info variant', () => {
    const { container } = render(<CardEmptyState title="Info" variant="info" />)
    const iconBg = container.querySelector('.bg-blue-500\\/10')
    expect(iconBg).toBeTruthy()
  })

  it('renders warning variant', () => {
    const { container } = render(<CardEmptyState title="Warning" variant="warning" />)
    const iconBg = container.querySelector('.bg-yellow-500\\/10')
    expect(iconBg).toBeTruthy()
  })

  it('renders neutral variant by default', () => {
    const { container } = render(<CardEmptyState title="Neutral" />)
    const iconBg = container.querySelector('.bg-secondary')
    expect(iconBg).toBeTruthy()
  })

  it('renders custom icon when provided', () => {
    render(<CardEmptyState title="Custom" icon={Server} />)
    // The custom icon replaces the variant default
    expect(screen.getByTitle('Custom')).toBeTruthy()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(<CardEmptyState title="Empty" action={{ label: 'Retry', onClick }} />)

    const button = screen.getByText('Retry')
    expect(button).toBeTruthy()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not render action button when not provided', () => {
    const { container } = render(<CardEmptyState title="No Action" />)
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// CardErrorState
// ---------------------------------------------------------------------------

describe('CardErrorState', () => {
  it('renders error message', () => {
    render(<CardErrorState error="Connection failed" />)
    expect(screen.getByText('Connection failed')).toBeTruthy()
    expect(screen.getByText('Error loading data')).toBeTruthy()
  })

  it('renders retry button when onRetry is provided', () => {
    const onRetry = vi.fn()
    render(<CardErrorState error="Failed" onRetry={onRetry} />)

    const button = screen.getByText('Try again')
    expect(button).toBeTruthy()

    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not render retry button when onRetry is not provided', () => {
    const { container } = render(<CardErrorState error="Failed" />)
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(0)
  })

  it('shows "Retrying..." text when isRetrying is true', () => {
    render(<CardErrorState error="Failed" onRetry={vi.fn()} isRetrying={true} />)
    expect(screen.getByText('Retrying...')).toBeTruthy()
  })

  it('disables retry button when isRetrying is true', () => {
    render(<CardErrorState error="Failed" onRetry={vi.fn()} isRetrying={true} />)
    const button = screen.getByText('Retrying...')
    expect(button).toBeDisabled()
  })

  it('shows "Try again" text when not retrying', () => {
    render(<CardErrorState error="Failed" onRetry={vi.fn()} isRetrying={false} />)
    expect(screen.getByText('Try again')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardStatusBadge
// ---------------------------------------------------------------------------

describe('CardStatusBadge', () => {
  it('renders status text', () => {
    render(<CardStatusBadge status="Running" />)
    expect(screen.getByText('Running')).toBeTruthy()
  })

  it('renders with neutral variant by default', () => {
    const { container } = render(<CardStatusBadge status="Pending" />)
    const badge = container.querySelector('.bg-secondary')
    expect(badge).toBeTruthy()
  })

  it('renders success variant', () => {
    const { container } = render(<CardStatusBadge status="Healthy" variant="success" />)
    const badge = container.querySelector('.bg-green-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders warning variant', () => {
    const { container } = render(<CardStatusBadge status="Degraded" variant="warning" />)
    const badge = container.querySelector('.bg-yellow-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders error variant', () => {
    const { container } = render(<CardStatusBadge status="Failed" variant="error" />)
    const badge = container.querySelector('.bg-red-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders info variant', () => {
    const { container } = render(<CardStatusBadge status="Info" variant="info" />)
    const badge = container.querySelector('.bg-blue-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders with sm size by default', () => {
    const { container } = render(<CardStatusBadge status="Test" />)
    const badge = container.querySelector('.text-xs')
    expect(badge).toBeTruthy()
  })

  it('renders with md size', () => {
    const { container } = render(<CardStatusBadge status="Test" size="md" />)
    const badge = container.querySelector('.text-sm')
    expect(badge).toBeTruthy()
  })

  it('has accessible title attribute', () => {
    render(<CardStatusBadge status="Active" />)
    const badge = screen.getByTitle('Status: Active')
    expect(badge).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardHeader
// ---------------------------------------------------------------------------

describe('CardHeader', () => {
  it('renders title', () => {
    render(<CardHeader title="Pods" />)
    expect(screen.getByText('Pods')).toBeTruthy()
  })

  it('renders count badge when count is provided', () => {
    render(<CardHeader title="Pods" count={42} />)
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('does not render count badge when count is undefined', () => {
    const { container } = render(<CardHeader title="Pods" />)
    const badges = container.querySelectorAll('[title*="items"]')
    expect(badges).toHaveLength(0)
  })

  it('renders count with zero value', () => {
    render(<CardHeader title="Pods" count={0} />)
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('renders count with default variant', () => {
    const { container } = render(<CardHeader title="Pods" count={5} />)
    const badge = container.querySelector('.bg-secondary')
    expect(badge).toBeTruthy()
  })

  it('renders count with success variant', () => {
    const { container } = render(<CardHeader title="Pods" count={5} countVariant="success" />)
    const badge = container.querySelector('.bg-green-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders count with warning variant', () => {
    const { container } = render(<CardHeader title="Pods" count={5} countVariant="warning" />)
    const badge = container.querySelector('.bg-yellow-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders count with error variant', () => {
    const { container } = render(<CardHeader title="Pods" count={5} countVariant="error" />)
    const badge = container.querySelector('.bg-red-500\\/20')
    expect(badge).toBeTruthy()
  })

  it('renders extra content', () => {
    render(<CardHeader title="Test" extra={<span data-testid="extra">Extra</span>} />)
    expect(screen.getByTestId('extra')).toBeTruthy()
  })

  it('renders controls content', () => {
    render(<CardHeader title="Test" controls={<button data-testid="ctrl">Ctrl</button>} />)
    expect(screen.getByTestId('ctrl')).toBeTruthy()
  })

  it('has accessible title for count badge', () => {
    render(<CardHeader title="Pods" count={10} />)
    const badge = screen.getByTitle('10 items')
    expect(badge).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardClusterIndicator
// ---------------------------------------------------------------------------

describe('CardClusterIndicator', () => {
  it('returns null when selectedCount is 0', () => {
    const { container } = render(<CardClusterIndicator selectedCount={0} totalCount={5} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders selected/total count', () => {
    render(<CardClusterIndicator selectedCount={3} totalCount={10} />)
    expect(screen.getByText('3/10')).toBeTruthy()
  })

  it('renders when selectedCount equals totalCount', () => {
    render(<CardClusterIndicator selectedCount={5} totalCount={5} />)
    expect(screen.getByText('5/5')).toBeTruthy()
  })

  it('renders with single cluster selected', () => {
    render(<CardClusterIndicator selectedCount={1} totalCount={3} />)
    expect(screen.getByText('1/3')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardFilterChips
// ---------------------------------------------------------------------------

describe('CardFilterChips', () => {
  const chips: FilterChip[] = [
    { id: 'all', label: 'All', count: 10 },
    { id: 'running', label: 'Running', count: 7 },
    { id: 'failed', label: 'Failed', count: 3, icon: AlertTriangle, color: 'text-red-400' },
  ]

  it('renders all chip labels', () => {
    render(<CardFilterChips chips={chips} activeChip="all" onChipClick={vi.fn()} />)
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('renders chip counts', () => {
    render(<CardFilterChips chips={chips} activeChip="all" onChipClick={vi.fn()} />)
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('calls onChipClick with chip id when clicked', () => {
    const onChipClick = vi.fn()
    render(<CardFilterChips chips={chips} activeChip="all" onChipClick={onChipClick} />)

    fireEvent.click(screen.getByText('Running'))
    expect(onChipClick).toHaveBeenCalledWith('running')
  })

  it('highlights the active chip', () => {
    const { container } = render(<CardFilterChips chips={chips} activeChip="running" onChipClick={vi.fn()} />)
    const buttons = container.querySelectorAll('button')
    // The active chip (index 1, "Running") should have the purple active class
    const runningButton = Array.from(buttons).find(b => b.textContent?.includes('Running'))
    expect(runningButton?.className).toContain('bg-purple-500/20')
  })

  it('renders chips without count when count is undefined', () => {
    const noCountChips: FilterChip[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ]
    render(<CardFilterChips chips={noCountChips} activeChip="a" onChipClick={vi.fn()} />)
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// MetricTile
// ---------------------------------------------------------------------------

describe('MetricTile', () => {
  it('renders label and numeric value', () => {
    render(<MetricTile label="Pods" value={42} colorClass="text-green-400" icon={<Server />} />)
    expect(screen.getByText('Pods')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('renders string value', () => {
    render(<MetricTile label="Status" value="Healthy" colorClass="text-green-400" icon={<CheckCircle />} />)
    expect(screen.getByText('Healthy')).toBeTruthy()
  })

  it('applies colorClass to value', () => {
    const { container } = render(
      <MetricTile label="Test" value={99} colorClass="text-purple-500" icon={<Info />} />,
    )
    const valueEl = container.querySelector('.text-purple-500')
    expect(valueEl).toBeTruthy()
    expect(valueEl?.textContent).toBe('99')
  })

  it('renders zero value correctly', () => {
    render(<MetricTile label="Errors" value={0} colorClass="text-green-400" icon={<CheckCircle />} />)
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('renders icon in the tile', () => {
    render(<MetricTile label="Test" value={1} colorClass="" icon={<span data-testid="metric-icon">ICON</span>} />)
    expect(screen.getByTestId('metric-icon')).toBeTruthy()
  })
})
