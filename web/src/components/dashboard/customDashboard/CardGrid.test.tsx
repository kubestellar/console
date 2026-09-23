import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardGrid } from './CardGrid'
import type { Card } from './types'

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children?: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  rectSortingStrategy: vi.fn(),
}))

vi.mock('./SortableCard', () => ({
  SortableCard: ({ card, isDragging }: { card: Card; isDragging: boolean }) => (
    <div data-testid={`sortable-card-${card.id}`} data-dragging={isDragging}>{card.title}</div>
  ),
}))

vi.mock('./DragPreviewCard', () => ({
  DragPreviewCard: ({ card }: { card: Card }) => (
    <div data-testid="drag-preview">{card.title}</div>
  ),
}))

const cards: Card[] = [
  { id: 'card-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 }, title: 'Card One' },
  { id: 'card-2', card_type: 'pod_issues', config: {}, position: { x: 4, y: 0, w: 4, h: 2 }, title: 'Card Two' },
]

const baseProps = {
  cards,
  activeId: null,
  sensors: [],
  collisionDetection: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  isRefreshing: false,
  lastUpdated: null,
  onRefresh: vi.fn(),
  onConfigure: vi.fn(),
  onRemove: vi.fn(),
  onWidthChange: vi.fn(),
  onHeightChange: vi.fn(),
  onInsertBefore: vi.fn(),
  onInsertAfter: vi.fn(),
}

describe('CardGrid Component', () => {
  it('renders a sortable card for each card', () => {
    render(<CardGrid {...baseProps} />)

    expect(screen.getByTestId('sortable-card-card-1')).toBeVisible()
    expect(screen.getByTestId('sortable-card-card-2')).toBeVisible()
  })

  it('marks the active card as dragging', () => {
    render(<CardGrid {...baseProps} activeId="card-2" />)

    expect(screen.getByTestId('sortable-card-card-1')).toHaveAttribute('data-dragging', 'false')
    expect(screen.getByTestId('sortable-card-card-2')).toHaveAttribute('data-dragging', 'true')
  })

  it('does not render a drag preview when no card is active', () => {
    render(<CardGrid {...baseProps} />)

    expect(screen.queryByTestId('drag-preview')).not.toBeInTheDocument()
  })

  it('renders a drag preview for the active card', () => {
    render(<CardGrid {...baseProps} activeId="card-1" />)

    expect(screen.getByTestId('drag-preview')).toHaveTextContent('Card One')
  })
})
