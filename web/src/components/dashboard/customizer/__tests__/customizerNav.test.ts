/**
 * customizerNav — structural tests for CUSTOMIZER_NAV data and types.
 *
 * Verifies the nav items export, DEFAULT_SECTION constant, and that
 * every NavItem has the expected shape.
 */
import { describe, it, expect } from 'vitest'
import { CUSTOMIZER_NAV, DEFAULT_SECTION } from '../customizerNav'
import type { CustomizerSection, NavItem } from '../customizerNav'

const EXPECTED_IDS: CustomizerSection[] = [
  'cards',
  'collections',
  'dashboards',
  'widgets',
  'create-dashboard',
  'card-factory',
  'stat-factory',
]

describe('customizerNav', () => {
  it('exports 7 nav items', () => {
    expect(CUSTOMIZER_NAV).toHaveLength(7)
  })

  it('contains all expected section ids in order', () => {
    expect(CUSTOMIZER_NAV.map((n) => n.id)).toEqual(EXPECTED_IDS)
  })

  it('every item has id, label, and icon', () => {
    for (const item of CUSTOMIZER_NAV) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.label).toBe('string')
      expect(typeof item.icon).toBe('function')
    }
  })

  it('only create-dashboard has dividerBefore=true', () => {
    const dividers = CUSTOMIZER_NAV.filter((n: NavItem) => n.dividerBefore)
    expect(dividers).toHaveLength(1)
    expect(dividers[0].id).toBe('create-dashboard')
  })

  it('DEFAULT_SECTION is "cards"', () => {
    expect(DEFAULT_SECTION).toBe('cards')
  })

  it('DEFAULT_SECTION exists in CUSTOMIZER_NAV', () => {
    expect(CUSTOMIZER_NAV.some((n) => n.id === DEFAULT_SECTION)).toBe(true)
  })
})
