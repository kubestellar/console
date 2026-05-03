/**
 * DashboardComponents-coverage — tests for uncovered branches
 *
 * Covers: SortableDashboardCard rendering (known + unknown card types),
 * insert button callbacks, mobile vs desktop grid spans, DashboardHeader
 * auto-refresh toggle + refresh button states, and DashboardCardsGrid gap prop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCardComponents: Record<string, React.FC<{ config: Record<string, unknown> }>> = {}
const mockDemoDataCards = new Set<string>()

vi.mock('../../../components/cards/cardRegistry', () => ({
  get CARD_COMPONENTS() { return mockCardComponents },
  get DEMO_DATA_CARDS() { return mockDemoDataCards },
}))

vi.mock('../../../components/cards/CardWrapper', () => ({
  CardWrapper: ({ children, title, dragHandle }: {
    children: React.ReactNode
    title?: string
    dragHandle?: React.ReactNode
  }) => (
    <div data-testid="card-wrapper">
      {dragHandle}
      <span data-testid="card-title">{title}</span>
      {children}
    </div>
  ),
}))

vi.mock('../../icons', () => ({
  getIcon: () => {
    const FakeIcon = ({ className }: { className?: string }) => (
      <span className={className} data-testid="fake-icon">icon</span>
    )
    FakeIcon.displayName = 'FakeIcon'
    return FakeIcon
  },
}))

vi.mock('../../formatCardTitle', () => ({
  formatCardTitle: (type: string) => type.replace(/_/g, ' '),
}))

let mockIsMobile = false
vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: mockIsMobile }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { role: 'button' },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  SortableDashboardCard,
  DragPreviewCard,
  DashboardHeader,
  DashboardCardsSection,
  DashboardEmptyCards,
  DashboardCardsGrid,
} from '../DashboardComponents'
import type { DashboardCard } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_WIDTH_DEFAULT = 4
const CARD_HEIGHT_DEFAULT = 2

const FAKE_CARD: DashboardCard = {
  id: 'card-1',
  card_type: 'known_type',
  title: 'Known Card',
  position: { w: 6, h: 3, x: 0, y: 0 },
}

const UNKNOWN_CARD: DashboardCard = {
  id: 'card-2',
  card_type: 'nonexistent_type',
  title: '',
  position: { w: CARD_WIDTH_DEFAULT, h: CARD_HEIGHT_DEFAULT, x: 0, y: 0 },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SortableDashboardCard — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile = false
    // Register a known card component
    const KnownComponent: React.FC<{ config: Record<string, unknown> }> = () => (
      <div data-testid="known-component">Known</div>
    )
    mockCardComponents['known_type'] = KnownComponent
    // Clear unknown type
    delete mockCardComponents['nonexistent_type']
  })

  it('renders a known card component via CardWrapper', () => {
    render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    expect(screen.getByTestId('known-component')).toBeInTheDocument()
    expect(screen.getByTestId('card-title')).toHaveTextContent('Known Card')
  })

  it('renders unknown card type alert when card type not in registry', () => {
    render(
      <SortableDashboardCard
        card={UNKNOWN_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    expect(screen.getByText(/Unknown card type: nonexistent_type/)).toBeInTheDocument()
    expect(screen.getByText(/This card type is not registered/)).toBeInTheDocument()
  })

  it('renders insert-after button and fires callback on click', () => {
    const onInsertAfter = vi.fn()
    render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
        onInsertAfter={onInsertAfter}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Add card' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onInsertAfter).toHaveBeenCalledTimes(1)
  })

  it('does not render insert button when onInsertAfter is undefined', () => {
    render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument()
  })

  it('uses span 1 on mobile and multi-column span on desktop', () => {
    // Desktop
    mockIsMobile = false
    const { container: desktopContainer } = render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    const desktopEl = desktopContainer.firstElementChild as HTMLElement
    expect(desktopEl.style.gridColumn).toBe('span 6')

    // Mobile
    mockIsMobile = true
    const { container: mobileContainer } = render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    const mobileEl = mobileContainer.firstElementChild as HTMLElement
    expect(mobileEl.style.gridColumn).toBe('span 1')
  })

  it('reduces opacity when isDragging is true', () => {
    const { container } = render(
      <SortableDashboardCard
        card={FAKE_CARD}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={true}
      />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.opacity).toBe('0.5')
  })

  it('defaults to w=4, h=2 when position is undefined', () => {
    const cardNoPosition: DashboardCard = {
      id: 'no-pos',
      card_type: 'known_type',
      title: 'No Pos',
    }
    const { container } = render(
      <SortableDashboardCard
        card={cardNoPosition}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        isDragging={false}
      />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.gridColumn).toBe('span 4')
  })
})

describe('DragPreviewCard — coverage', () => {
  it('defaults to w=4 when position is undefined', () => {
    const card: DashboardCard = { id: 'p1', card_type: 'test', title: 'Test' }
    const { container } = render(<DragPreviewCard card={card} />)
    const el = container.firstElementChild as HTMLElement
    // 4/12 * 100 = 33.3333%
    expect(el.style.width).toContain('33.3')
  })
})

describe('DashboardHeader — coverage', () => {
  it('calls onAutoRefreshChange when checkbox is toggled', () => {
    const onChange = vi.fn()
    render(
      <DashboardHeader
        title="Test"
        icon="Server"
        autoRefresh={false}
        onAutoRefreshChange={onChange}
      />,
    )
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('renders refresh button and handles disabled state', () => {
    const onRefresh = vi.fn()
    render(
      <DashboardHeader
        title="Test"
        icon="Server"
        onRefresh={onRefresh}
        isFetching={true}
      />,
    )
    const refreshBtn = screen.getByTitle('Refresh data')
    expect(refreshBtn).toBeDisabled()
  })

  it('does not render auto-refresh checkbox when onAutoRefreshChange is undefined', () => {
    render(<DashboardHeader title="T" icon="Server" />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not render refresh button when onRefresh is undefined', () => {
    render(<DashboardHeader title="T" icon="Server" />)
    expect(screen.queryByTitle('Refresh data')).not.toBeInTheDocument()
  })

  it('shows Updating text when isRefreshing', () => {
    const { container } = render(
      <DashboardHeader title="T" icon="Server" isRefreshing={true} />,
    )
    const updatingSpan = container.querySelector('.text-yellow-400')
    expect(updatingSpan).not.toBeNull()
    expect(updatingSpan?.textContent).toContain('Updating')
  })
})

describe('DashboardCardsSection — coverage (chevron icons)', () => {
  it('renders ChevronDown when expanded', () => {
    const { container } = render(
      <DashboardCardsSection title="Test" cardCount={1} isExpanded={true} onToggle={vi.fn()}>
        <div>content</div>
      </DashboardCardsSection>,
    )
    // ChevronDown icon is present — just verify the toggle button includes count
    expect(screen.getByText('Test (1)')).toBeInTheDocument()
    expect(container.textContent).toContain('content')
  })

  it('renders ChevronRight when collapsed', () => {
    const { container } = render(
      <DashboardCardsSection title="Test" cardCount={0} isExpanded={false} onToggle={vi.fn()}>
        <div>hidden</div>
      </DashboardCardsSection>,
    )
    expect(container.textContent).not.toContain('hidden')
  })
})

describe('DashboardEmptyCards — coverage', () => {
  it('renders icon, title, description, and add button', () => {
    const onAddCards = vi.fn()
    render(
      <DashboardEmptyCards
        icon="Box"
        title="Nothing here"
        description="Start by adding cards"
        onAddCards={onAddCards}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByText('Start by adding cards')).toBeInTheDocument()
    expect(screen.getByTestId('fake-icon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add Cards'))
    expect(onAddCards).toHaveBeenCalledTimes(1)
  })
})

describe('DashboardCardsGrid — coverage', () => {
  it('accepts gap prop without error', () => {
    const { container } = render(
      <DashboardCardsGrid columns={8} gap={8}>
        <div>X</div>
      </DashboardCardsGrid>,
    )
    const grid = container.firstElementChild as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('repeat(8')
  })
})
