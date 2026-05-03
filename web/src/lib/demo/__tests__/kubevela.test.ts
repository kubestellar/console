import { describe, it, expect } from 'vitest'
import { KUBEVELA_DEMO_DATA } from '../kubevela'

describe('KUBEVELA_DEMO_DATA re-export', () => {
  it('exports a valid object with health status', () => {
    expect(KUBEVELA_DEMO_DATA).toBeDefined()
    expect(['healthy', 'degraded', 'not-installed']).toContain(KUBEVELA_DEMO_DATA.health)
  })

  it('has applications array', () => {
    expect(KUBEVELA_DEMO_DATA.applications.length).toBeGreaterThan(0)
  })

  it('has summary with required fields', () => {
    expect(typeof KUBEVELA_DEMO_DATA.summary.totalApplications).toBe('number')
  })
})
