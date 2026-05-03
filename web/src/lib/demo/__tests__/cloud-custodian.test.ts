import { describe, it, expect } from 'vitest'
import { CLOUD_CUSTODIAN_DEMO_DATA } from '../cloud-custodian'

describe('CLOUD_CUSTODIAN_DEMO_DATA', () => {
  const data = CLOUD_CUSTODIAN_DEMO_DATA

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(data.health)
  })

  it('has a version string', () => {
    expect(data.version).toBeTruthy()
    expect(typeof data.version).toBe('string')
  })

  it('has policies array with required fields', () => {
    expect(data.policies.length).toBeGreaterThan(0)
    for (const p of data.policies) {
      expect(p.name).toBeTruthy()
      expect(['pull', 'periodic', 'event']).toContain(p.mode)
      expect(['aws', 'azure', 'gcp', 'k8s']).toContain(p.provider)
      expect(typeof p.successCount).toBe('number')
      expect(typeof p.failCount).toBe('number')
      expect(typeof p.dryRunCount).toBe('number')
    }
  })

  it('has topResources with required fields', () => {
    expect(data.topResources.length).toBeGreaterThan(0)
    for (const r of data.topResources) {
      expect(r.type).toBeTruthy()
      expect(typeof r.actionCount).toBe('number')
    }
  })

  it('has violationsBySeverity with all severity levels', () => {
    const v = data.violationsBySeverity
    expect(typeof v.critical).toBe('number')
    expect(typeof v.high).toBe('number')
    expect(typeof v.medium).toBe('number')
    expect(typeof v.low).toBe('number')
  })

  it('has consistent summary', () => {
    const s = data.summary
    expect(s.totalPolicies).toBe(data.policies.length)
    expect(typeof s.successfulPolicies).toBe('number')
    expect(typeof s.failedPolicies).toBe('number')
    expect(typeof s.dryRunPolicies).toBe('number')
  })

  it('has a valid lastCheckTime ISO string', () => {
    expect(new Date(data.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})
