import { describe, it, expect } from 'vitest'
import { SLO_COMPLIANCE_DEMO_DATA, type SLOComplianceData } from '../slo_compliance/demoData'

describe('SLO_COMPLIANCE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(SLO_COMPLIANCE_DEMO_DATA).toBeDefined()
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(SLO_COMPLIANCE_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  it('overallBudgetRemaining is between 0 and 100', () => {
    expect(SLO_COMPLIANCE_DEMO_DATA.overallBudgetRemaining).toBeGreaterThanOrEqual(0)
    expect(SLO_COMPLIANCE_DEMO_DATA.overallBudgetRemaining).toBeLessThanOrEqual(100)
  })

  describe('targets', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(SLO_COMPLIANCE_DEMO_DATA.targets)).toBe(true)
      expect(SLO_COMPLIANCE_DEMO_DATA.targets.length).toBeGreaterThan(0)
    })

    it('each target has required string fields', () => {
      for (const target of SLO_COMPLIANCE_DEMO_DATA.targets) {
        expect(typeof target.name).toBe('string')
        expect(target.name.length).toBeGreaterThan(0)
        expect(typeof target.metric).toBe('string')
        expect(typeof target.unit).toBe('string')
        expect(typeof target.window).toBe('string')
      }
    })

    it('each target has positive threshold', () => {
      for (const target of SLO_COMPLIANCE_DEMO_DATA.targets) {
        expect(target.threshold).toBeGreaterThan(0)
      }
    })

    it('compliance is between 0 and 100', () => {
      for (const target of SLO_COMPLIANCE_DEMO_DATA.targets) {
        expect(target.currentCompliance).toBeGreaterThanOrEqual(0)
        expect(target.currentCompliance).toBeLessThanOrEqual(100)
      }
    })

    it('all target names are unique', () => {
      const names = SLO_COMPLIANCE_DEMO_DATA.targets.map(t => t.name)
      expect(new Set(names).size).toBe(names.length)
    })
  })
})
