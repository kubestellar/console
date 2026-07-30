import { describe, it, expect } from 'vitest'
import { TUF_DEMO_DATA } from '../tuf'

describe('tuf demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(TUF_DEMO_DATA.health)
  })

  it('has a spec version', () => {
    expect(TUF_DEMO_DATA.specVersion).toBeTruthy()
  })

  it('has roles with required fields', () => {
    expect(TUF_DEMO_DATA.roles.length).toBeGreaterThan(0)
    for (const r of TUF_DEMO_DATA.roles) {
      expect(r.name).toBeTruthy()
      expect(typeof r.version).toBe('number')
    }
  })

  it('has consistent summary', () => {
    const { summary, roles } = TUF_DEMO_DATA
    expect(summary.totalRoles).toBe(roles.length)
    expect(summary.signedRoles + summary.expiredRoles)
      .toBeLessThanOrEqual(summary.totalRoles)
  })

  it('has a lastCheckTime', () => {
    expect(TUF_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
