/**
 * Tests for components/enterprise/enterpriseNav.ts
 */
import { describe, it, expect } from 'vitest'
import { ENTERPRISE_NAV_SECTIONS } from '../enterpriseNav'
import type { EnterpriseNavSection, EnterpriseNavItem } from '../enterpriseNav'

describe('ENTERPRISE_NAV_SECTIONS', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(ENTERPRISE_NAV_SECTIONS)).toBe(true)
    expect(ENTERPRISE_NAV_SECTIONS.length).toBeGreaterThan(0)
  })

  it('each section has required fields', () => {
    for (const s of ENTERPRISE_NAV_SECTIONS) {
      expect(typeof s.id).toBe('string')
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.title).toBe('string')
      expect(s.title.length).toBeGreaterThan(0)
      expect(typeof s.icon).toBe('string')
      expect(Array.isArray(s.items)).toBe(true)
      expect(s.items.length).toBeGreaterThan(0)
    }
  })

  it('all section IDs are unique', () => {
    const ids = ENTERPRISE_NAV_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all item IDs are unique across all sections', () => {
    const ids = ENTERPRISE_NAV_SECTIONS.flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each item has required fields', () => {
    for (const section of ENTERPRISE_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(typeof item.id).toBe('string')
        expect(item.id.length).toBeGreaterThan(0)
        expect(typeof item.label).toBe('string')
        expect(item.label.length).toBeGreaterThan(0)
        expect(typeof item.href).toBe('string')
        expect(item.href.startsWith('/')).toBe(true)
        expect(typeof item.icon).toBe('string')
      }
    }
  })

  it('overview section exists with enterprise home item', () => {
    const overview = ENTERPRISE_NAV_SECTIONS.find(s => s.id === 'overview')
    expect(overview).toBeDefined()
    expect(overview?.items.some(i => i.id === 'enterprise-home')).toBe(true)
  })

  it('all hrefs are absolute paths starting with /enterprise', () => {
    for (const section of ENTERPRISE_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.href).toMatch(/^\/enterprise/)
      }
    }
  })

  it('optional badge field is string when present', () => {
    for (const section of ENTERPRISE_NAV_SECTIONS) {
      for (const item of section.items) {
        if ('badge' in item) {
          expect(typeof item.badge).toBe('string')
        }
      }
    }
  })
})
