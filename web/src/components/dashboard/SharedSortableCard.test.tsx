import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('../cards/CardWrapper', () => ({
  CardWrapper: ({ children }: { children: ReactNode }) => <div data-testid="card-wrapper">{children}</div>,
}))

vi.mock('../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {
    test_card: ({ config }: { config: { label?: string } }) => <div>{config.label ?? 'Test card content'}</div>,
  },
  DEMO_DATA_CARDS: new Set<string>(),
  LIVE_DATA_CARDS: new Set<string>(),
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardCollapse: () => ({ isCollapsed: false }),
}))

import { SortableCard, DragPreviewCard } from './SharedSortableCard'

const baseCard = {
  id: 'card-1',
  card_type: 'test_card',
  config: { label: 'Card content' },
  position: { w: 4, h: 2 },
  title: 'Test Card',
} as const

function renderSortableCard(card = baseCard) {
  return render(
    <SortableCard
      card={card}
      onConfigure={vi.fn()}
      onRemove={vi.fn()}
      onWidthChange={vi.fn()}
      onHeightChange={vi.fn()}
      onRefresh={vi.fn()}
    />
  )
}

describe('SharedSortableCard (SortableCard) Component', () => {
  it('exports SortableCard component', () => {
    expect(SortableCard).toBeDefined()
    expect(typeof SortableCard).toBe('object') // It's a memo'd component
  })

  it('exports DragPreviewCard component', () => {
    expect(DragPreviewCard).toBeDefined()
    expect(typeof DragPreviewCard).toBe('function')
  })

  it('wraps each gridcell in a row for ARIA grid semantics', () => {
    renderSortableCard()

    const row = screen.getByRole('row')
    const cell = screen.getByRole('gridcell', { name: 'Test Card' })

    expect(row).toContainElement(cell)
  })

  it('keeps the fallback card branch inside the row/gridcell hierarchy', () => {
    renderSortableCard({
      ...baseCard,
      card_type: 'unknown_card',
    })

    const row = screen.getByRole('row')
    const cell = screen.getByRole('gridcell', { name: 'Unknown Card' })

    expect(row).toContainElement(cell)
    expect(cell).toHaveTextContent('Unknown card type: unknown_card')
  })
})

describe('shallowEqualConfig (memo comparator logic)', () => {
  // The comparator is internal to the memo, but we can verify the contract
  // by testing the same shallow-equal logic it implements (#4665).

  function shallowEqualConfig(
    a: Record<string, unknown> | undefined,
    b: Record<string, unknown> | undefined,
  ): boolean {
    if (a === b) return true
    if (!a || !b) return false
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (a[key] !== b[key]) return false
    }
    return true
  }

  it('returns true for identical references', () => {
    const config = { foo: 'bar' }
    expect(shallowEqualConfig(config, config)).toBe(true)
  })

  it('returns true for equivalent flat objects', () => {
    expect(shallowEqualConfig({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
  })

  it('returns true for equivalent objects with different key order', () => {
    // This is the key advantage over JSON.stringify — key order doesn't matter
    const a = { first: 1, second: 2 }
    const b = { second: 2, first: 1 }
    expect(shallowEqualConfig(a, b)).toBe(true)
  })

  it('returns false when values differ', () => {
    expect(shallowEqualConfig({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false when key counts differ', () => {
    expect(shallowEqualConfig({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('handles undefined inputs', () => {
    expect(shallowEqualConfig(undefined, undefined)).toBe(true)
    expect(shallowEqualConfig(undefined, { a: 1 })).toBe(false)
    expect(shallowEqualConfig({ a: 1 }, undefined)).toBe(false)
  })

  it('handles empty objects', () => {
    expect(shallowEqualConfig({}, {})).toBe(true)
  })
})
