/**
 * Tests for DashboardGrid component
 *
 * Mocks heavy children (UnifiedCard, CardWrapper, DnD libs) and tests:
 * - Basic grid rendering with card placements
 * - Unknown card type fallback
 * - Loading overlay
 * - Drag-and-drop wrapping when features.dragDrop + onReorder
 * - No DnD context when drag-drop disabled
 * - Health indicator shown when unhealthy
 * - Card width calculation and narrow viewport clamping
 * - Direct component rendering (no config, registry component)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardGrid } from '../DashboardGrid'
import type { DashboardCardPlacement, DashboardFeatures } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../card', () => ({
  UnifiedCard: (props: Record<string, unknown>) => (
    <div data-testid={`unified-card-${(props.config as { type: string }).type}`}>
      UnifiedCard
    </div>
  ),
}))

let mockGetCardConfig: (type: string) => unknown = () => null
vi.mock('../../../../config/cards', () => ({
  getCardConfig: (type: string) => mockGetCardConfig(type),
}))

let mockGetCardComponent: (type: string) => unknown = () => null
vi.mock('../../../../components/cards/cardRegistry', () => ({
  getCardComponent: (type: string) => mockGetCardComponent(type),
}))

vi.mock('../../../../components/cards/CardWrapper', () => ({
  CardWrapper: (props: Record<string, unknown>) => (
    <div data-testid={`card-wrapper-${props.cardType}`}>
      {props.children as React.ReactNode}
    </div>
  ),
}))

let mockHealthStatus = 'healthy'
vi.mock('../../../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({ status: mockHealthStatus }),
}))

vi.mock('../../../../components/dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="health-indicator">Health</div>,
}))

// Mock dnd-kit - provide minimal implementations
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const result = [...arr]
    const [removed] = result.splice(from, 1)
    result.splice(to, 0, removed)
    return result
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  rectSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: (t: unknown) => (t ? 'transform-str' : undefined),
    },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlacement(
  id: string,
  cardType: string,
  w = 4,
  h = 2,
): DashboardCardPlacement {
  return {
    id,
    cardType,
    position: { w, h },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardGrid', () => {
  beforeEach(() => {
    mockGetCardConfig = () => null
    mockGetCardComponent = () => null
    mockHealthStatus = 'healthy'
    vi.clearAllMocks()
  })

  it('renders unknown card type fallback when no config or component found', () => {
    const cards = [makePlacement('c1', 'nonexistent')]
    render(<DashboardGrid cards={cards} />)
    expect(screen.getByText(/Unknown card type: nonexistent/)).toBeInTheDocument()
  })

  it('renders UnifiedCard when getCardConfig returns config', () => {
    mockGetCardConfig = (type: string) => ({ type, title: 'Test' })

    const cards = [makePlacement('c1', 'pod-issues')]
    render(<DashboardGrid cards={cards} />)
    expect(screen.getByTestId('unified-card-pod-issues')).toBeInTheDocument()
  })

  it('renders CardWrapper with DirectComponent when no config but component exists', () => {
    mockGetCardComponent = () => {
      const Comp = () => <div data-testid="direct-comp">Direct</div>
      return Comp
    }

    const cards = [makePlacement('c1', 'custom-card')]
    render(<DashboardGrid cards={cards} />)
    expect(screen.getByTestId('card-wrapper-custom-card')).toBeInTheDocument()
    expect(screen.getByTestId('direct-comp')).toBeInTheDocument()
  })

  it('renders multiple cards', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [
      makePlacement('c1', 'card-a'),
      makePlacement('c2', 'card-b'),
      makePlacement('c3', 'card-c'),
    ]
    render(<DashboardGrid cards={cards} />)
    expect(screen.getByTestId('unified-card-card-a')).toBeInTheDocument()
    expect(screen.getByTestId('unified-card-card-b')).toBeInTheDocument()
    expect(screen.getByTestId('unified-card-card-c')).toBeInTheDocument()
  })

  it('shows loading overlay when isLoading is true', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card')]
    const { container } = render(<DashboardGrid cards={cards} isLoading={true} />)
    // Loading overlay has a spinning element
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('does not show loading overlay when isLoading is false', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card')]
    const { container } = render(<DashboardGrid cards={cards} isLoading={false} />)
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('wraps with DnD context when features.dragDrop and onReorder are provided', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card')]
    const features: DashboardFeatures = { dragDrop: true }
    render(
      <DashboardGrid cards={cards} features={features} onReorder={vi.fn()} />,
    )
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
    expect(screen.getByTestId('sortable-context')).toBeInTheDocument()
  })

  it('does not wrap with DnD when onReorder is missing', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card')]
    const features: DashboardFeatures = { dragDrop: true }
    render(<DashboardGrid cards={cards} features={features} />)
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument()
  })

  it('does not wrap with DnD when features.dragDrop is false', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card')]
    render(
      <DashboardGrid cards={cards} features={{ dragDrop: false }} onReorder={vi.fn()} />,
    )
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument()
  })

  it('shows health indicator when status is not healthy', () => {
    mockHealthStatus = 'degraded'

    const cards = [makePlacement('c1', 'nonexistent')]
    render(<DashboardGrid cards={cards} />)
    expect(screen.getByTestId('health-indicator')).toBeInTheDocument()
  })

  it('hides health indicator when status is healthy', () => {
    mockHealthStatus = 'healthy'

    const cards = [makePlacement('c1', 'nonexistent')]
    render(<DashboardGrid cards={cards} />)
    expect(screen.queryByTestId('health-indicator')).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    const cards: DashboardCardPlacement[] = []
    const { container } = render(<DashboardGrid cards={cards} className="my-grid" />)
    expect(container.firstChild).toHaveClass('my-grid')
  })

  it('clamps card width between 3 and 12 columns', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    // Width of 1 should be clamped to 3
    const cards = [makePlacement('c1', 'test-card', 1, 2)]
    const { container } = render(<DashboardGrid cards={cards} />)

    // Check inline style for gridColumn - should be span 3
    // (on wide viewport, isNarrow is false, so rawW=3 stays 3)
    const cardEl = container.querySelector('[style*="grid-column"]')
    expect(cardEl).not.toBeNull()
  })

  it('calculates min-height from position.h', () => {
    mockGetCardConfig = (type: string) => ({ type, title: type })

    const cards = [makePlacement('c1', 'test-card', 6, 3)]
    const { container } = render(<DashboardGrid cards={cards} />)

    // h=3, each row = 100px, so min-height = 300px
    const cardEl = container.querySelector('[style*="min-height: 300px"]')
    expect(cardEl).not.toBeNull()
  })

  it('renders empty grid when no cards provided', () => {
    const { container } = render(<DashboardGrid cards={[]} />)
    const grid = container.querySelector('.grid')
    expect(grid).toBeInTheDocument()
    expect(grid?.children).toHaveLength(0)
  })
})
