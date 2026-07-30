import { describe, it, expect } from 'vitest'
import {
  BACKSTAGE_DEMO_DATA,
  BACKSTAGE_ENTITY_KINDS,
  type BackstageHealth,
  type BackstagePluginStatus,
  type BackstageEntityKind,
} from '../../../lib/demo/backstage'

describe('BACKSTAGE_DEMO_DATA (card-level)', () => {
  it('is defined with valid health', () => {
    const valid: BackstageHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(BACKSTAGE_DEMO_DATA.health)
  })

  it('has a version string', () => {
    expect(typeof BACKSTAGE_DEMO_DATA.version).toBe('string')
    expect(BACKSTAGE_DEMO_DATA.version.length).toBeGreaterThan(0)
  })

  it('replicas does not exceed desiredReplicas', () => {
    expect(BACKSTAGE_DEMO_DATA.replicas).toBeLessThanOrEqual(
      BACKSTAGE_DEMO_DATA.desiredReplicas,
    )
    expect(BACKSTAGE_DEMO_DATA.desiredReplicas).toBeGreaterThan(0)
  })

  describe('catalog', () => {
    it('has counts for every entity kind', () => {
      for (const kind of BACKSTAGE_ENTITY_KINDS) {
        expect(typeof BACKSTAGE_DEMO_DATA.catalog[kind]).toBe('number')
        expect(BACKSTAGE_DEMO_DATA.catalog[kind]).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('plugins', () => {
    it('is an array with entries', () => {
      expect(Array.isArray(BACKSTAGE_DEMO_DATA.plugins)).toBe(true)
      expect(BACKSTAGE_DEMO_DATA.plugins.length).toBeGreaterThan(0)
    })

    it('each plugin has name, version, and valid status', () => {
      const validStatuses: BackstagePluginStatus[] = ['enabled', 'disabled', 'error']
      for (const p of BACKSTAGE_DEMO_DATA.plugins) {
        expect(typeof p.name).toBe('string')
        expect(p.name.length).toBeGreaterThan(0)
        expect(typeof p.version).toBe('string')
        expect(validStatuses).toContain(p.status)
      }
    })
  })

  describe('templates', () => {
    it('is an array with entries', () => {
      expect(Array.isArray(BACKSTAGE_DEMO_DATA.templates)).toBe(true)
      expect(BACKSTAGE_DEMO_DATA.templates.length).toBeGreaterThan(0)
    })

    it('each template has name, owner, and type', () => {
      for (const t of BACKSTAGE_DEMO_DATA.templates) {
        expect(typeof t.name).toBe('string')
        expect(typeof t.owner).toBe('string')
        expect(typeof t.type).toBe('string')
      }
    })
  })

  describe('summary', () => {
    it('totalEntities matches catalog sum', () => {
      const catalogSum = (BACKSTAGE_ENTITY_KINDS as readonly BackstageEntityKind[]).reduce(
        (sum, kind) => sum + (BACKSTAGE_DEMO_DATA.catalog[kind] ?? 0),
        0,
      )
      expect(BACKSTAGE_DEMO_DATA.summary.totalEntities).toBe(catalogSum)
    })

    it('enabledPlugins matches plugins array', () => {
      const enabled = BACKSTAGE_DEMO_DATA.plugins.filter(p => p.status === 'enabled').length
      expect(BACKSTAGE_DEMO_DATA.summary.enabledPlugins).toBe(enabled)
    })

    it('pluginErrors matches plugins array', () => {
      const errors = BACKSTAGE_DEMO_DATA.plugins.filter(p => p.status === 'error').length
      expect(BACKSTAGE_DEMO_DATA.summary.pluginErrors).toBe(errors)
    })

    it('scaffolderTemplates matches templates array', () => {
      expect(BACKSTAGE_DEMO_DATA.summary.scaffolderTemplates).toBe(
        BACKSTAGE_DEMO_DATA.templates.length,
      )
    })
  })

  it('has valid lastCatalogSync ISO string', () => {
    expect(new Date(BACKSTAGE_DEMO_DATA.lastCatalogSync).getTime()).not.toBeNaN()
  })

  it('has valid lastCheckTime ISO string', () => {
    expect(new Date(BACKSTAGE_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })

  it('BACKSTAGE_ENTITY_KINDS covers all 7 kinds', () => {
    const expected: BackstageEntityKind[] = [
      'Component', 'API', 'System', 'Domain', 'Resource', 'User', 'Group',
    ]
    for (const kind of expected) {
      expect(BACKSTAGE_ENTITY_KINDS).toContain(kind)
    }
    expect(BACKSTAGE_ENTITY_KINDS.length).toBe(expected.length)
  })
})
