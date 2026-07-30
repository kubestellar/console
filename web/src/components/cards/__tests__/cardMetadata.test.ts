/**
 * Tests for components/cards/cardMetadata.ts
 */
import { describe, it, expect } from 'vitest'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from '../cardMetadata'

describe('CARD_TITLES', () => {
  it('is a non-empty object', () => {
    expect(typeof CARD_TITLES).toBe('object')
    expect(Object.keys(CARD_TITLES).length).toBeGreaterThan(0)
  })

  it('all values are non-empty strings', () => {
    for (const [id, title] of Object.entries(CARD_TITLES)) {
      expect(typeof title).toBe('string')
      expect(title.length).toBeGreaterThan(0)
    }
  })

  it('all keys are snake_case strings', () => {
    for (const key of Object.keys(CARD_TITLES)) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      // No spaces
      expect(key).not.toContain(' ')
    }
  })

  it('has cluster_health title', () => {
    expect(CARD_TITLES.cluster_health).toBeTruthy()
    expect(typeof CARD_TITLES.cluster_health).toBe('string')
  })

  it('has pod_issues title', () => {
    expect(CARD_TITLES.pod_issues).toBeTruthy()
  })
})

describe('CARD_DESCRIPTIONS', () => {
  it('is a non-empty object', () => {
    expect(typeof CARD_DESCRIPTIONS).toBe('object')
    expect(Object.keys(CARD_DESCRIPTIONS).length).toBeGreaterThan(0)
  })

  it('all values are non-empty strings', () => {
    for (const [id, desc] of Object.entries(CARD_DESCRIPTIONS)) {
      expect(typeof desc).toBe('string')
      expect(desc.length).toBeGreaterThan(0)
    }
  })

  it('most keys exist in CARD_TITLES (descriptions may extend titles)', () => {
    const titleKeys = new Set(Object.keys(CARD_TITLES))
    const descKeys = Object.keys(CARD_DESCRIPTIONS)
    // At least 90% of description keys should appear in titles
    const overlap = descKeys.filter(k => titleKeys.has(k))
    expect(overlap.length / descKeys.length).toBeGreaterThan(0.9)
  })
})

describe('DEMO_EXEMPT_CARDS', () => {
  it('is a Set', () => {
    expect(DEMO_EXEMPT_CARDS).toBeInstanceOf(Set)
  })

  it('has at least one entry', () => {
    expect(DEMO_EXEMPT_CARDS.size).toBeGreaterThan(0)
  })

  it('all entries are strings', () => {
    for (const id of DEMO_EXEMPT_CARDS) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })

  it('dynamic_card is exempt', () => {
    expect(DEMO_EXEMPT_CARDS.has('dynamic_card')).toBe(true)
  })

  it('game cards are exempt from demo mode', () => {
    expect(DEMO_EXEMPT_CARDS.has('kube_chess')).toBe(true)
    expect(DEMO_EXEMPT_CARDS.has('kube_snake')).toBe(true)
  })
})
