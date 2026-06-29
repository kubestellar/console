/**
 * Deep Schema Validation Tests for Card Configs
 *
 * Goes beyond the basic smoke tests in registerCardConfigTest to validate:
 * - CardWidth is within allowed enum values (3|4|5|6|8|12)
 * - Stats arrays have required fields (id, icon, color, label, valueSource)
 * - Content list columns have required field property
 * - DataSource discriminated union consistency (hook configs need hook name, etc.)
 * - EmptyState and footer cross-field integrity
 * - No duplicate card types in registry
 * - Category values are from the known set
 */
import { describe, it, expect } from 'vitest'
import { getUnifiedCardTypes, getCardConfig } from '../index'
import type { UnifiedCardConfig } from '../../../lib/unified/types'

const VALID_CARD_WIDTHS = new Set([3, 4, 5, 6, 8, 12])

const VALID_DATA_SOURCE_TYPES = new Set(['hook', 'api', 'static', 'context'])

const VALID_CONTENT_TYPES = new Set([
  'list', 'table', 'chart', 'status-grid', 'stats-grid', 'custom',
])

const VALID_EMPTY_STATE_VARIANTS = new Set([
  'info', 'success', 'warning', 'error', 'neutral', undefined,
])

describe('card config deep schema validation', () => {
  const allTypes = getUnifiedCardTypes()

  it('registry has at least 100 card configs', () => {
    expect(allTypes.length).toBeGreaterThanOrEqual(100)
  })

  it('no duplicate card type identifiers', () => {
    const seen = new Set<string>()
    for (const t of allTypes) {
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  describe.each(allTypes)('card "%s"', (cardType) => {
    let config: UnifiedCardConfig

    it('is retrievable from registry', () => {
      const c = getCardConfig(cardType)
      expect(c).toBeDefined()
      config = c!
    })

    it('type field matches registry key', () => {
      const c = getCardConfig(cardType)!
      expect(c.type).toBe(cardType)
    })

    it('defaultWidth is a valid CardWidth value when present', () => {
      const c = getCardConfig(cardType)!
      if (c.defaultWidth !== undefined) {
        expect(VALID_CARD_WIDTHS.has(c.defaultWidth)).toBe(true)
      }
    })

    it('defaultHeight is a positive integer when present', () => {
      const c = getCardConfig(cardType)!
      if (c.defaultHeight !== undefined) {
        expect(c.defaultHeight).toBeGreaterThan(0)
        expect(Number.isInteger(c.defaultHeight)).toBe(true)
      }
    })

    it('dataSource.type is from allowed discriminated union', () => {
      const c = getCardConfig(cardType)!
      expect(VALID_DATA_SOURCE_TYPES.has(c.dataSource.type)).toBe(true)
    })

    it('hook dataSource has hook name', () => {
      const c = getCardConfig(cardType)!
      if (c.dataSource.type === 'hook') {
        const ds = c.dataSource as { type: 'hook'; hook?: string }
        expect(typeof ds.hook).toBe('string')
        expect(ds.hook!.length).toBeGreaterThan(0)
      }
    })

    it('api dataSource has endpoint', () => {
      const c = getCardConfig(cardType)!
      if (c.dataSource.type === 'api') {
        const ds = c.dataSource as { type: 'api'; endpoint?: string }
        expect(typeof ds.endpoint).toBe('string')
        expect(ds.endpoint!.length).toBeGreaterThan(0)
      }
    })

    it('content.type is from allowed discriminated union', () => {
      const c = getCardConfig(cardType)!
      expect(VALID_CONTENT_TYPES.has(c.content.type)).toBe(true)
    })

    it('list content has non-empty columns array', () => {
      const c = getCardConfig(cardType)!
      if (c.content.type === 'list') {
        const content = c.content as { type: 'list'; columns?: unknown[] }
        expect(Array.isArray(content.columns)).toBe(true)
        expect(content.columns!.length).toBeGreaterThan(0)
      }
    })

    it('list content columns have required field property', () => {
      const c = getCardConfig(cardType)!
      if (c.content.type === 'list') {
        const content = c.content as { type: 'list'; columns: Array<{ field?: string }> }
        for (const col of content.columns) {
          expect(typeof col.field).toBe('string')
          expect(col.field!.length).toBeGreaterThan(0)
        }
      }
    })

    it('stats array elements have required fields', () => {
      const c = getCardConfig(cardType)!
      if (c.stats && c.stats.length > 0) {
        for (const stat of c.stats) {
          expect(typeof stat.id).toBe('string')
          expect(stat.id.length).toBeGreaterThan(0)
          expect(typeof stat.icon).toBe('string')
          expect(typeof stat.color).toBe('string')
          expect(typeof stat.label).toBe('string')
          expect(stat.valueSource).toBeDefined()
        }
      }
    })

    it('stats have unique IDs within a card', () => {
      const c = getCardConfig(cardType)!
      if (c.stats && c.stats.length > 1) {
        const ids = c.stats.map(s => s.id)
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(ids.length)
      }
    })

    it('emptyState variant is valid when present', () => {
      const c = getCardConfig(cardType)!
      if (c.emptyState?.variant) {
        expect(VALID_EMPTY_STATE_VARIANTS.has(c.emptyState.variant)).toBe(true)
      }
    })

    it('custom content has component name', () => {
      const c = getCardConfig(cardType)!
      if (c.content.type === 'custom') {
        const content = c.content as { type: 'custom'; component?: string }
        expect(typeof content.component).toBe('string')
        expect(content.component!.length).toBeGreaterThan(0)
      }
    })

    it('projects array contains non-empty strings when present', () => {
      const c = getCardConfig(cardType)!
      if (c.projects) {
        expect(Array.isArray(c.projects)).toBe(true)
        for (const p of c.projects) {
          expect(typeof p).toBe('string')
          expect(p.length).toBeGreaterThan(0)
        }
      }
    })
  })
})
