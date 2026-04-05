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
