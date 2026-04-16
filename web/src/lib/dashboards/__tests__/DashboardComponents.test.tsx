/**
 * Tests for DashboardComponents.tsx — the simpler exported components
 * (DragPreviewCard, DashboardHeader, DashboardCardsSection,
 * DashboardEmptyCards, DashboardCardsGrid). SortableDashboardCard is
 * skipped because it requires a full dnd-kit context.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock deps used by the components
vi.mock('../../../components/cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: new Set(),
}))
vi.mock('../../../components/cards/CardWrapper', () => ({
  CardWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../icons', () => ({
  getIcon: () => {
    const FakeIcon = ({ className }: { className?: string }) => <span className={className}>icon</span>
    FakeIcon.displayName = 'FakeIcon'
    return FakeIcon
  },
}))
vi.mock('../../formatCardTitle', () => ({
  formatCardTitle: (type: string) => type.replace(/_/g, ' '),
}))
vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => false,
}))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  CSS: { Transform: { toString: () => '' } },
}))

import {
  DragPreviewCard,
  DashboardHeader,
  DashboardCardsSection,
  DashboardEmptyCards,
  DashboardCardsGrid,
} from '../DashboardComponents'

import type { DashboardCard } from '../types'

const FAKE_CARD: DashboardCard = {
  id: 'card-1',
  card_type: 'pod_issues',
  title: 'Pod Issues',
  position: { w: 6, h: 2, x: 0, y: 0 },
}

describe('DragPreviewCard', () => {
  it('renders the card title', () => {
    render(<DragPreviewCard card={FAKE_CARD} />)
    expect(screen.getByText('Pod Issues')).toBeDefined()
  })

  it('uses formatted card_type when title is absent', () => {
    render(<DragPreviewCard card={{ ...FAKE_CARD, title: '' }} />)
    expect(screen.getByText('pod issues')).toBeDefined()
  })

  it('respects card width from position.w', () => {
    const { container } = render(<DragPreviewCard card={FAKE_CARD} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('50%') // 6/12 * 100
  })
})

describe('DashboardHeader', () => {
  it('renders title and description', () => {
    render(<DashboardHeader title="My Dashboard" description="A dashboard" icon="Server" />)
    expect(screen.getByText('My Dashboard')).toBeDefined()
    expect(screen.getByText('A dashboard')).toBeDefined()
  })

  it('renders without description', () => {
    render(<DashboardHeader title="Minimal" icon="Box" />)
    expect(screen.getByText('Minimal')).toBeDefined()
  })

  it('renders refreshing indicator when isRefreshing', () => {
    const { container } = render(<DashboardHeader title="T" icon="Server" isRefreshing />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders extra controls when provided', () => {
    render(<DashboardHeader title="T" icon="Server" extra={<button>Custom</button>} />)
    expect(screen.getByText('Custom')).toBeDefined()
  })
})

describe('DashboardCardsSection', () => {
  it('renders title with card count', () => {
    render(
      <DashboardCardsSection title="Main" cardCount={5} isExpanded onToggle={vi.fn()}>
        <div>cards</div>
      </DashboardCardsSection>,
    )
    expect(screen.getByText('Main (5)')).toBeDefined()
  })

  it('renders children when expanded', () => {
    render(
      <DashboardCardsSection title="Main" cardCount={1} isExpanded onToggle={vi.fn()}>
        <div>visible</div>
      </DashboardCardsSection>,
    )
    expect(screen.getByText('visible')).toBeDefined()
  })

  it('hides children when collapsed', () => {
    const { container } = render(
      <DashboardCardsSection title="Main" cardCount={1} isExpanded={false} onToggle={vi.fn()}>
        <div>hidden</div>
      </DashboardCardsSection>,
    )
    expect(container.textContent).not.toContain('hidden')
  })

  it('calls onToggle when header clicked', () => {
    const onToggle = vi.fn()
    render(
      <DashboardCardsSection title="Main" cardCount={0} isExpanded onToggle={onToggle}>
        <div />
      </DashboardCardsSection>,
    )
    fireEvent.click(screen.getByText('Main (0)'))
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('DashboardEmptyCards', () => {
  it('renders title + description + add button', () => {
    const onAdd = vi.fn()
    render(
      <DashboardEmptyCards
        icon="Box"
        title="No cards"
        description="Add some cards"
        onAddCards={onAdd}
      />,
    )
    expect(screen.getByText('No cards')).toBeDefined()
    expect(screen.getByText('Add some cards')).toBeDefined()
    fireEvent.click(screen.getByText('Add Cards'))
    expect(onAdd).toHaveBeenCalled()
  })
})

describe('DashboardCardsGrid', () => {
  it('renders children in a grid with default 12 columns', () => {
    const { container } = render(
      <DashboardCardsGrid>
        <div>A</div>
        <div>B</div>
      </DashboardCardsGrid>,
    )
    const grid = container.firstElementChild as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('repeat(12')
    expect(screen.getByText('A')).toBeDefined()
    expect(screen.getByText('B')).toBeDefined()
  })

  it('accepts custom column count', () => {
    const { container } = render(
      <DashboardCardsGrid columns={6}><div>C</div></DashboardCardsGrid>,
    )
    const grid = container.firstElementChild as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('repeat(6')
  })
})
