import { describe, it, expect } from 'vitest'
import {
  KUBEFLEX_DEMO_DATA,
  type KubeFlexStatusDemoData,
} from '../multi-tenancy/kubeflex-status/demoData'

describe('KUBEFLEX_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KUBEFLEX_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(KUBEFLEX_DEMO_DATA.health)
  })

  it('detected is a boolean', () => {
    expect(typeof KUBEFLEX_DEMO_DATA.detected).toBe('boolean')
  })

  it('controllerHealthy is a boolean', () => {
    expect(typeof KUBEFLEX_DEMO_DATA.controllerHealthy).toBe('boolean')
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(KUBEFLEX_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('controlPlanes', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(KUBEFLEX_DEMO_DATA.controlPlanes)).toBe(true)
      expect(KUBEFLEX_DEMO_DATA.controlPlanes.length).toBeGreaterThan(0)
    })

    it('each control plane has name and healthy fields', () => {
      for (const cp of KUBEFLEX_DEMO_DATA.controlPlanes) {
        expect(typeof cp.name).toBe('string')
        expect(cp.name.length).toBeGreaterThan(0)
        expect(typeof cp.healthy).toBe('boolean')
      }
    })

    it('tenantCount matches controlPlanes length', () => {
      expect(KUBEFLEX_DEMO_DATA.tenantCount).toBe(KUBEFLEX_DEMO_DATA.controlPlanes.length)
    })
  })

  it('all control planes are healthy in demo data', () => {
    expect(KUBEFLEX_DEMO_DATA.controlPlanes.every(cp => cp.healthy)).toBe(true)
  })
})
