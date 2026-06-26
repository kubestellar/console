/**
 * Deep branch-coverage tests for dashboardUtils.ts
 *
 * Tests isLocalOnlyCard, mapVisualizationToCardType, getDefaultCardSize,
 * getDemoCards covering all branches and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the cardRegistry so it doesn't pull in the full component tree
vi.mock('../../cards/cardRegistry', () => ({
  CARD_COMPONENTS: {
    cluster_health: true,
    pod_issues: true,
    resource_usage: true,
  },
}))

import {
  isLocalOnlyCard,
  mapVisualizationToCardType,
  getDefaultCardSize,
  getDemoCards,
} from '../dashboardUtils'
import type { Card } from '../dashboardUtils'

describe('isLocalOnlyCard', () => {
  /** All known local-only prefixes that should return true */
  const LOCAL_PREFIXES = ['new-', 'template-', 'restored-', 'ai-', 'rec-', 'default-', 'demo-']

  it.each(LOCAL_PREFIXES)('returns true for "%s" prefix', (prefix) => {
    expect(isLocalOnlyCard(`${prefix}12345`)).toBe(true)
  })

  it('returns false for server-persisted card IDs', () => {
    expect(isLocalOnlyCard('abc-123')).toBe(false)
    expect(isLocalOnlyCard('card-456')).toBe(false)
    expect(isLocalOnlyCard('uuid-v4-style')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isLocalOnlyCard('')).toBe(false)
  })

  it('returns false for prefix that is a substring but not at start', () => {
    expect(isLocalOnlyCard('x-new-123')).toBe(false)
    expect(isLocalOnlyCard('my-demo-card')).toBe(false)
  })
})

describe('mapVisualizationToCardType', () => {
  it('returns the type directly if it exists in CARD_COMPONENTS', () => {
    // pod_issues exists in our mock CARD_COMPONENTS
    expect(mapVisualizationToCardType('table', 'pod_issues')).toBe('pod_issues')
  })

  it('maps known visualizations when type is not in CARD_COMPONENTS', () => {
    expect(mapVisualizationToCardType('gauge', 'unknown_type')).toBe('resource_usage')
    expect(mapVisualizationToCardType('timeseries', 'unknown_type')).toBe('cluster_metrics')
    expect(mapVisualizationToCardType('events', 'unknown_type')).toBe('event_stream')
    expect(mapVisualizationToCardType('donut', 'unknown_type')).toBe('app_status')
    expect(mapVisualizationToCardType('bar', 'unknown_type')).toBe('cluster_metrics')
    expect(mapVisualizationToCardType('status', 'unknown_type')).toBe('cluster_health')
    expect(mapVisualizationToCardType('table', 'unknown_type')).toBe('pod_issues')
    expect(mapVisualizationToCardType('sparkline', 'unknown_type')).toBe('cluster_metrics')
  })

  it('returns the type as-is for unmapped visualizations', () => {
    expect(mapVisualizationToCardType('unknown_viz', 'my_custom_type')).toBe('my_custom_type')
  })

  it('returns empty string type when both are unknown', () => {
    expect(mapVisualizationToCardType('unknown_viz', '')).toBe('')
  })
})

describe('getDefaultCardSize', () => {
  it('returns specific sizes for known card types', () => {
    expect(getDefaultCardSize('cluster_resource_tree')).toEqual({ w: 12, h: 6 })
    expect(getDefaultCardSize('pvc_status')).toEqual({ w: 8, h: 3 })
    expect(getDefaultCardSize('cluster_metrics')).toEqual({ w: 6, h: 3 })
    expect(getDefaultCardSize('cluster_health')).toEqual({ w: 4, h: 3 })
  })

  it('returns default size { w: 4, h: 3 } for unknown card types', () => {
    expect(getDefaultCardSize('nonexistent_card')).toEqual({ w: 4, h: 3 })
    expect(getDefaultCardSize('')).toEqual({ w: 4, h: 3 })
  })
})

describe('getDemoCards', () => {
  let cards: Card[]

  beforeEach(() => {
    cards = getDemoCards()
  })

  it('returns an array of cards', () => {
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThan(0)
  })

  it('every card has required fields', () => {
    for (const card of cards) {
      expect(card.id).toBeTruthy()
      expect(card.card_type).toBeTruthy()
      expect(card.config).toBeDefined()
      expect(card.position).toBeDefined()
      expect(typeof card.position.x).toBe('number')
      expect(typeof card.position.y).toBe('number')
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
    }
  })

  it('all demo card IDs start with demo- prefix', () => {
    for (const card of cards) {
      expect(card.id.startsWith('demo-')).toBe(true)
    }
  })

  it('all demo cards are local-only', () => {
    for (const card of cards) {
      expect(isLocalOnlyCard(card.id)).toBe(true)
    }
  })

  it('returns unique IDs', () => {
    const ids = cards.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
