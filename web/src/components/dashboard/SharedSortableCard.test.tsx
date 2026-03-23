import { describe, it, expect, vi } from 'vitest'

// Mock the heavy cardRegistry to avoid loading all card bundles
vi.mock('../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {},
  DEMO_DATA_CARDS: [],
  LIVE_DATA_CARDS: [],
  MODULE_MAP: {},
  CARD_SIZES: {},
  registerDynamicCardType: vi.fn(),
}))

import { SortableCard, DragPreviewCard } from './SharedSortableCard'

describe('SharedSortableCard (SortableCard) Component', () => {
  it('exports SortableCard component', () => {
    expect(SortableCard).toBeDefined()
    expect(typeof SortableCard).toBe('object') // It's a memo'd component
  })

  it('exports DragPreviewCard component', () => {
    expect(DragPreviewCard).toBeDefined()
    expect(typeof DragPreviewCard).toBe('function')
  })
})
