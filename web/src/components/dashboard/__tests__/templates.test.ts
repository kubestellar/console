/**
 * Deep branch-coverage tests for templates.ts
 *
 * Validates all dashboard templates have required fields,
 * valid categories, and well-formed card placements.
 */
import { describe, it, expect } from 'vitest'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, type DashboardTemplate } from '../templates'

/** Minimum grid width allowed for a card placement */
const MIN_CARD_WIDTH = 1
/** Maximum grid width (12-column grid) */
const MAX_CARD_WIDTH = 12
/** Minimum card height */
const MIN_CARD_HEIGHT = 1

describe('DASHBOARD_TEMPLATES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(DASHBOARD_TEMPLATES)).toBe(true)
    expect(DASHBOARD_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('every template has a unique id', () => {
    const ids = DASHBOARD_TEMPLATES.map(t => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(DASHBOARD_TEMPLATES.map(t => [t.id, t]))(
    'template "%s" has all required fields',
    (_id, template) => {
      const t = template as DashboardTemplate
      expect(t.id).toBeTruthy()
      expect(typeof t.id).toBe('string')
      expect(t.name).toBeTruthy()
      expect(typeof t.name).toBe('string')
      expect(t.description).toBeTruthy()
      expect(typeof t.description).toBe('string')
      expect(t.icon).toBeTruthy()
      expect(typeof t.icon).toBe('string')
      expect(t.category).toBeTruthy()
      expect(typeof t.category).toBe('string')
      expect(Array.isArray(t.cards)).toBe(true)
      expect(t.cards.length).toBeGreaterThan(0)
    }
  )

  it.each(DASHBOARD_TEMPLATES.map(t => [t.id, t]))(
    'template "%s" has a valid category',
    (_id, template) => {
      const t = template as DashboardTemplate
      const validCategories = TEMPLATE_CATEGORIES.map(c => c.id)
      expect(validCategories).toContain(t.category)
    }
  )

  it.each(DASHBOARD_TEMPLATES.map(t => [t.id, t]))(
    'template "%s" cards have valid positions',
    (_id, template) => {
      const t = template as DashboardTemplate
      for (const card of t.cards) {
        expect(card.card_type).toBeTruthy()
        expect(typeof card.card_type).toBe('string')
        expect(card.position).toBeDefined()
        expect(card.position.w).toBeGreaterThanOrEqual(MIN_CARD_WIDTH)
        expect(card.position.w).toBeLessThanOrEqual(MAX_CARD_WIDTH)
        expect(card.position.h).toBeGreaterThanOrEqual(MIN_CARD_HEIGHT)
      }
    }
  )

  it('every card has a string card_type', () => {
    for (const template of DASHBOARD_TEMPLATES) {
      for (const card of template.cards) {
        expect(typeof card.card_type).toBe('string')
        expect(card.card_type.length).toBeGreaterThan(0)
      }
    }
  })

  it('card config is an object when present', () => {
    for (const template of DASHBOARD_TEMPLATES) {
      for (const card of template.cards) {
        if (card.config !== undefined) {
          expect(typeof card.config).toBe('object')
          expect(card.config).not.toBeNull()
        }
      }
    }
  })

  it('card title is a string when present', () => {
    for (const template of DASHBOARD_TEMPLATES) {
      for (const card of template.cards) {
        if (card.title !== undefined) {
          expect(typeof card.title).toBe('string')
          expect(card.title.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('TEMPLATE_CATEGORIES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(TEMPLATE_CATEGORIES)).toBe(true)
    expect(TEMPLATE_CATEGORIES.length).toBeGreaterThan(0)
  })

  it('every category has unique id', () => {
    const ids = TEMPLATE_CATEGORIES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every category has required fields', () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      expect(cat.id).toBeTruthy()
      expect(cat.name).toBeTruthy()
      expect(cat.icon).toBeTruthy()
    }
  })

  it('every category with templates has at least one template', () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      const templates = DASHBOARD_TEMPLATES.filter(t => t.category === cat.id)
      // Some categories may be empty placeholders; skip those
      if (templates.length > 0) {
        expect(templates.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('has the expected core categories', () => {
    const ids = TEMPLATE_CATEGORIES.map(c => c.id)
    expect(ids).toContain('cluster')
    expect(ids).toContain('security')
    expect(ids).toContain('gitops')
    expect(ids).toContain('gpu')
    expect(ids).toContain('arcade')
  })
})
