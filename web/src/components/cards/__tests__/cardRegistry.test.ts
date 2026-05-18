/**
 * Tests for components/cards/cardRegistry.ts — pure-function and registry exports
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CARD_COMPONENTS,
  CARD_DEFAULT_WIDTHS,
  DEMO_DATA_CARDS,
  LIVE_DATA_CARDS,
  getDefaultCardWidth,
  getCardComponent,
  isCardTypeRegistered,
  registerDynamicCardType,
  getRegisteredCardTypes,
} from '../cardRegistry'

describe('CARD_COMPONENTS', () => {
  it('is a non-empty object', () => {
    expect(typeof CARD_COMPONENTS).toBe('object')
    expect(Object.keys(CARD_COMPONENTS).length).toBeGreaterThan(0)
  })

  it('all values are functions or lazy objects (React components)', () => {
    for (const [key, comp] of Object.entries(CARD_COMPONENTS)) {
      // React.lazy returns an object; direct components are functions
      expect(['function', 'object']).toContain(typeof comp)
      expect(comp).not.toBeNull()
    }
  })

  it('includes cluster_health', () => {
    expect('cluster_health' in CARD_COMPONENTS).toBe(true)
  })

  it('includes dynamic_card', () => {
    expect('dynamic_card' in CARD_COMPONENTS).toBe(true)
  })
})

describe('CARD_DEFAULT_WIDTHS', () => {
  it('is a non-empty object', () => {
    expect(Object.keys(CARD_DEFAULT_WIDTHS).length).toBeGreaterThan(0)
  })

  it('all values are positive integers', () => {
    for (const [key, width] of Object.entries(CARD_DEFAULT_WIDTHS)) {
      expect(typeof width).toBe('number')
      expect(width).toBeGreaterThan(0)
      expect(Number.isInteger(width)).toBe(true)
    }
  })

  it('widths are between 1 and 12 (grid columns)', () => {
    for (const width of Object.values(CARD_DEFAULT_WIDTHS)) {
      expect(width).toBeGreaterThanOrEqual(1)
      expect(width).toBeLessThanOrEqual(12)
    }
  })
})

describe('DEMO_DATA_CARDS', () => {
  it('is a Set', () => {
    expect(DEMO_DATA_CARDS).toBeInstanceOf(Set)
  })

  it('has at least one entry', () => {
    expect(DEMO_DATA_CARDS.size).toBeGreaterThan(0)
  })

  it('all entries are strings', () => {
    for (const id of DEMO_DATA_CARDS) {
      expect(typeof id).toBe('string')
    }
  })
})

describe('LIVE_DATA_CARDS', () => {
  it('is a Set', () => {
    expect(LIVE_DATA_CARDS).toBeInstanceOf(Set)
  })

  it('has entries', () => {
    expect(LIVE_DATA_CARDS.size).toBeGreaterThan(0)
  })

  it('all entries are strings', () => {
    for (const id of LIVE_DATA_CARDS) {
      expect(typeof id).toBe('string')
    }
  })
})

describe('getDefaultCardWidth()', () => {
  it('returns width for known card type', () => {
    const types = Object.keys(CARD_DEFAULT_WIDTHS)
    if (types.length === 0) return
    const type = types[0]
    expect(getDefaultCardWidth(type)).toBe(CARD_DEFAULT_WIDTHS[type])
  })

  it('returns default width (4) for unknown type', () => {
    expect(getDefaultCardWidth('__nonexistent_card__')).toBe(4)
  })

  it('returns number for any input', () => {
    expect(typeof getDefaultCardWidth('cluster_health')).toBe('number')
    expect(typeof getDefaultCardWidth('')).toBe('number')
  })
})

describe('isCardTypeRegistered()', () => {
  it('returns true for a statically registered card', () => {
    const type = Object.keys(CARD_COMPONENTS)[0]
    expect(isCardTypeRegistered(type)).toBe(true)
  })

  it('returns false for unknown card type', () => {
    expect(isCardTypeRegistered('__nonexistent_card_xyz__')).toBe(false)
  })

  it('returns true for dynamic_card', () => {
    expect(isCardTypeRegistered('dynamic_card')).toBe(true)
  })
})

describe('getCardComponent()', () => {
  it('returns a component (function or lazy object) for a known static card', () => {
    const type = Object.keys(CARD_COMPONENTS)[0]
    const comp = getCardComponent(type)
    expect(['function', 'object']).toContain(typeof comp)
    expect(comp).not.toBeNull()
  })

  it('returns undefined for unknown card type', () => {
    const comp = getCardComponent('__nonexistent_card_xyz__')
    expect(comp).toBeUndefined()
  })

  it('returns component (function or lazy) for dynamic_card', () => {
    const comp = getCardComponent('dynamic_card')
    expect(['function', 'object']).toContain(typeof comp)
    expect(comp).not.toBeNull()
  })
})

describe('registerDynamicCardType()', () => {
  it('registers a new card type with default width 6', () => {
    const id = '__test_dynamic_card_register__'
    registerDynamicCardType(id)
    expect(getDefaultCardWidth(id)).toBe(6)
  })

  it('registers a new card type with custom width', () => {
    const id = '__test_dynamic_card_custom__'
    registerDynamicCardType(id, 8)
    expect(getDefaultCardWidth(id)).toBe(8)
  })
})

describe('getRegisteredCardTypes()', () => {
  it('returns an array of strings', () => {
    const types = getRegisteredCardTypes()
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)
    for (const t of types) {
      expect(typeof t).toBe('string')
    }
  })

  it('contains cluster_health', () => {
    expect(getRegisteredCardTypes()).toContain('cluster_health')
  })

  it('matches Object.keys(CARD_COMPONENTS)', () => {
    expect(getRegisteredCardTypes()).toEqual(Object.keys(CARD_COMPONENTS))
  })
})
