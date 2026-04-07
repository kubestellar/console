/**
 * Tests for cardCatalog shared data module.
 *
 * Covers:
 * - wrapAbbreviations: wraps known abbreviations (GPU, CPU, RBAC, etc.)
 * - CARD_CATALOG: structure and content validation
 * - CardSuggestion and HoveredCard type shapes
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../shared/TechnicalAcronym', () => ({
  TechnicalAcronym: ({ children }: { children: string }) => children,
}))

import { wrapAbbreviations, CARD_CATALOG } from '../cardCatalog'

describe('wrapAbbreviations', () => {
  it('returns content for plain text with no abbreviations', () => {
    const result = wrapAbbreviations('Hello world this is a test')
    // wrapAbbreviations may return a string or an array with a single string element
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0)
    } else {
      expect(result).toBe('Hello world this is a test')
    }
  })

  it('wraps GPU abbreviation', () => {
    const result = wrapAbbreviations('Check GPU usage')
    // Result should be an array of React nodes, not a plain string
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3) // "Check ", TechnicalAcronym, " usage"
  })

  it('wraps CPU abbreviation', () => {
    const result = wrapAbbreviations('CPU utilization metrics')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps RBAC abbreviation', () => {
    const result = wrapAbbreviations('RBAC configuration')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps multiple abbreviations in one string', () => {
    const result = wrapAbbreviations('Check GPU and CPU usage with RBAC')
    expect(Array.isArray(result)).toBe(true)
    // Should have text and component nodes for each abbreviation
    const length = (result as unknown[]).length
    expect(length).toBeGreaterThanOrEqual(5) // text + 3 acronyms + text segments
  })

  it('wraps CRD abbreviation', () => {
    const result = wrapAbbreviations('CRD health status')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps PVC abbreviation', () => {
    const result = wrapAbbreviations('PVC storage status')
    expect(Array.isArray(result)).toBe(true)
  })

  it('wraps ConfigMap and ConfigMaps', () => {
    const result = wrapAbbreviations('ConfigMaps and ConfigMap data')
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns text as-is for empty string', () => {
    const result = wrapAbbreviations('')
    expect(result).toBe('')
  })
})

describe('CARD_CATALOG', () => {
  it('has more than 10 categories', () => {
    expect(Object.keys(CARD_CATALOG).length).toBeGreaterThan(10)
  })

  it('each category has at least one card', () => {
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      expect((cards as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('each card has required fields', () => {
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      for (const card of cards as Array<{ type: string; title: string; description: string; visualization: string }>) {
        expect(typeof card.type).toBe('string')
        expect(card.type.length).toBeGreaterThan(0)
        expect(typeof card.title).toBe('string')
        expect(card.title.length).toBeGreaterThan(0)
        expect(typeof card.description).toBe('string')
        expect(typeof card.visualization).toBe('string')
      }
    }
  })

  it('has a large number of total cards', () => {
    let totalCards = 0
    for (const [, cards] of Object.entries(CARD_CATALOG)) {
      totalCards += (cards as unknown[]).length
    }
    // Should have a significant number of cards across all categories
    expect(totalCards).toBeGreaterThan(100)
  })

  it('has Cluster Admin category', () => {
    expect(CARD_CATALOG).toHaveProperty('Cluster Admin')
  })

  it('Cluster Admin has control_plane_health card', () => {
    const clusterAdmin = (CARD_CATALOG as Record<string, Array<{ type: string }>>)['Cluster Admin']
    const controlPlane = clusterAdmin.find(c => c.type === 'control_plane_health')
    expect(controlPlane).toBeDefined()
  })
})
