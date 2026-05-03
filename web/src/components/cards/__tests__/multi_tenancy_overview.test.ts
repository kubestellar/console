import { describe, it, expect } from 'vitest'
import {
  DEMO_MULTI_TENANCY_OVERVIEW,
} from '../multi-tenancy/multi-tenancy-overview/demoData'

describe('DEMO_MULTI_TENANCY_OVERVIEW', () => {
  it('is defined', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW).toBeDefined()
  })

  it('tenantCount is positive', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW.tenantCount).toBeGreaterThan(0)
  })

  it('overallScore does not exceed totalLevels', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW.overallScore).toBeLessThanOrEqual(
      DEMO_MULTI_TENANCY_OVERVIEW.totalLevels,
    )
  })

  it('overallScore equals totalLevels in healthy demo state', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW.overallScore).toBe(
      DEMO_MULTI_TENANCY_OVERVIEW.totalLevels,
    )
  })

  it('isDemoData is true', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW.isDemoData).toBe(true)
  })

  it('isFailed is false in demo', () => {
    expect(DEMO_MULTI_TENANCY_OVERVIEW.isFailed).toBe(false)
  })

  describe('components', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(DEMO_MULTI_TENANCY_OVERVIEW.components)).toBe(true)
      expect(DEMO_MULTI_TENANCY_OVERVIEW.components.length).toBeGreaterThan(0)
    })

    it('each component has required fields', () => {
      const validHealth = ['healthy', 'degraded', 'not-installed', 'unknown']
      for (const comp of DEMO_MULTI_TENANCY_OVERVIEW.components) {
        expect(typeof comp.name).toBe('string')
        expect(comp.name.length).toBeGreaterThan(0)
        expect(typeof comp.detected).toBe('boolean')
        expect(validHealth).toContain(comp.health)
        expect(typeof comp.icon).toBe('string')
      }
    })

    it('all 4 expected components are present', () => {
      const names = DEMO_MULTI_TENANCY_OVERVIEW.components.map(c => c.name)
      expect(names).toContain('OVN-K8s')
      expect(names).toContain('KubeFlex')
      expect(names).toContain('K3s')
      expect(names).toContain('KubeVirt')
    })
  })

  describe('isolationLevels', () => {
    it('is a non-empty array matching totalLevels', () => {
      expect(Array.isArray(DEMO_MULTI_TENANCY_OVERVIEW.isolationLevels)).toBe(true)
      expect(DEMO_MULTI_TENANCY_OVERVIEW.isolationLevels.length).toBe(
        DEMO_MULTI_TENANCY_OVERVIEW.totalLevels,
      )
    })

    it('each level has type, status, and provider fields', () => {
      const validStatuses = ['ready', 'missing', 'degraded']
      for (const level of DEMO_MULTI_TENANCY_OVERVIEW.isolationLevels) {
        expect(typeof level.type).toBe('string')
        expect(validStatuses).toContain(level.status)
        expect(typeof level.provider).toBe('string')
      }
    })
  })
})
