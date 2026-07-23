import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SortableGpuCard } from '../SortableGpuCard'
import type { SortableGpuCardProps } from '../SortableGpuCard'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

vi.mock('../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {
    gpu_overview: () => <div data-testid="gpu-overview-component" />,
  },
  getDefaultCardWidth: () => 6,
}))

vi.mock('../../cards/CardWrapper', () => ({
  CardWrapper: ({
    children,
    title,
    dragHandle,
  }: {
    children: React.ReactNode
    title: string
    dragHandle: React.ReactNode
  }) => (
    <div data-testid="card-wrapper">
      <span data-testid="card-title">{title}</span>
      {dragHandle}
      {children}
    </div>
  ),
  CARD_TITLES: { gpu_overview: 'GPU Overview' },
}))

function renderCard(overrides: Partial<SortableGpuCardProps> = {}) {
  const defaults: SortableGpuCardProps = {
    id: 'card-1',
    card: { type: 'gpu_overview', width: 6 },
    index: 0,
    onRemove: vi.fn(),
    onWidthChange: vi.fn(),
  }
  return render(<SortableGpuCard {...defaults} {...overrides} />)
}

describe('SortableGpuCard', () => {
  it('renders without crashing', () => {
    const { container } = renderCard()
    expect(container.firstChild).toBeTruthy()
  })

  it('renders the CardWrapper with the correct title', () => {
    renderCard()
    expect(screen.getByTestId('card-title').textContent).toBe('GPU Overview')
  })

  it('renders the registered component for a known card type', () => {
    renderCard()
    expect(screen.getByTestId('gpu-overview-component')).toBeTruthy()
  })

  it('renders the unknown-type fallback for an unregistered card type', () => {
    renderCard({ card: { type: 'unknown_card_xyz', width: 6 } })
    expect(screen.getByText('Unknown card type: unknown_card_xyz')).toBeTruthy()
  })

  it('renders the drag handle button', () => {
    renderCard()
    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeTruthy()
  })

  it('falls back to a formatted title when CARD_TITLES has no entry for the type', () => {
    renderCard({ card: { type: 'gpu_namespace_allocations', width: 6 } })
    // type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    expect(screen.getByTestId('card-title').textContent).toBe('Gpu Namespace Allocations')
  })
})
