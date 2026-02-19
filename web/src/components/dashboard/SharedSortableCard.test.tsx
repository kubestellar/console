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

import * as SharedSortableCardModule from './SharedSortableCard'

describe('SharedSortableCard (SortableCard) Component', () => {
  it('exports SortableCard component', () => {
    expect(SharedSortableCardModule.SortableCard).toBeDefined()
    expect(typeof SharedSortableCardModule.SortableCard).toBe('object') // It's a memo'd component
  })

  it('exports DragPreviewCard component', () => {
    expect(SharedSortableCardModule.DragPreviewCard).toBeDefined()
    expect(typeof SharedSortableCardModule.DragPreviewCard).toBe('function')
  })
})
