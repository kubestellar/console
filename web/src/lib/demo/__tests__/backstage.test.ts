import { describe, it, expect } from 'vitest'
import {
  BACKSTAGE_DEMO_DATA,
  BACKSTAGE_ENTITY_KINDS,
  BACKSTAGE_MS_PER_HOUR,
} from '../backstage'

describe('BACKSTAGE_DEMO_DATA', () => {
  const data = BACKSTAGE_DEMO_DATA

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(data.health)
  })

  it('has version and replica info', () => {
    expect(data.version).toBeTruthy()
    expect(data.replicas).toBeGreaterThan(0)
    expect(data.desiredReplicas).toBeGreaterThanOrEqual(data.replicas)
  })

  it('has catalog counts for all entity kinds', () => {
    for (const kind of BACKSTAGE_ENTITY_KINDS) {
      expect(typeof data.catalog[kind]).toBe('number')
      expect(data.catalog[kind]).toBeGreaterThanOrEqual(0)
    }
  })

  it('has plugins with valid statuses', () => {
    expect(data.plugins.length).toBeGreaterThan(0)
    for (const p of data.plugins) {
      expect(p.name).toBeTruthy()
      expect(['enabled', 'disabled', 'error']).toContain(p.status)
    }
  })

  it('has scaffolder templates', () => {
    expect(data.templates.length).toBeGreaterThan(0)
    for (const t of data.templates) {
      expect(t.name).toBeTruthy()
      expect(t.type).toBeTruthy()
    }
  })

  it('has consistent summary', () => {
    const s = data.summary
    const totalFromCatalog = Object.values(data.catalog).reduce((a, b) => a + b, 0)
    expect(s.totalEntities).toBe(totalFromCatalog)
    expect(s.scaffolderTemplates).toBe(data.templates.length)
  })

  it('has valid ISO timestamps', () => {
    expect(new Date(data.lastCatalogSync).getTime()).toBeGreaterThan(0)
    expect(new Date(data.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})

describe('BACKSTAGE_ENTITY_KINDS', () => {
  it('contains all expected kinds', () => {
    expect(BACKSTAGE_ENTITY_KINDS).toContain('Component')
    expect(BACKSTAGE_ENTITY_KINDS).toContain('API')
    expect(BACKSTAGE_ENTITY_KINDS).toContain('User')
    expect(BACKSTAGE_ENTITY_KINDS).toContain('Group')
  })
})

describe('BACKSTAGE_MS_PER_HOUR', () => {
  it('equals 3600000 ms', () => {
    expect(BACKSTAGE_MS_PER_HOUR).toBe(3_600_000)
  })
})
