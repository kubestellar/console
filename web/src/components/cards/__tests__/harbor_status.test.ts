import { describe, it, expect } from 'vitest'
import {
  HARBOR_DEMO_DATA,
  type HarborProjectStatus,
} from '../harbor_status/demoData'

describe('HARBOR_DEMO_DATA', () => {
  it('is defined', () => {
    expect(HARBOR_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth = ['healthy', 'degraded', 'not-installed']
    expect(validHealth).toContain(HARBOR_DEMO_DATA.health)
  })

  it('has instanceName string', () => {
    expect(typeof HARBOR_DEMO_DATA.instanceName).toBe('string')
    expect(HARBOR_DEMO_DATA.instanceName.length).toBeGreaterThan(0)
  })

  it('has version string', () => {
    expect(typeof HARBOR_DEMO_DATA.version).toBe('string')
    expect(HARBOR_DEMO_DATA.version.length).toBeGreaterThan(0)
  })

  it('has projects array with entries', () => {
    expect(Array.isArray(HARBOR_DEMO_DATA.projects)).toBe(true)
    expect(HARBOR_DEMO_DATA.projects.length).toBeGreaterThan(0)
  })

  it('each project has required fields', () => {
    for (const proj of HARBOR_DEMO_DATA.projects) {
      expect(typeof proj.name).toBe('string')
      expect(typeof proj.repoCount).toBe('number')
      expect(typeof proj.isPublic).toBe('boolean')
      expect(typeof proj.pullCount).toBe('number')
    }
  })

  it('has repositories array', () => {
    expect(Array.isArray(HARBOR_DEMO_DATA.repositories)).toBe(true)
  })

  it('each repository has required fields', () => {
    for (const repo of HARBOR_DEMO_DATA.repositories) {
      expect(typeof repo.name).toBe('string')
      expect(typeof repo.artifactCount).toBe('number')
      expect(typeof repo.pullCount).toBe('number')
    }
  })
})
