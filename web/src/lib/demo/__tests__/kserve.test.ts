import { describe, it, expect } from 'vitest'
import { KSERVE_DEMO_DATA } from '../kserve'

describe('kserve demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(KSERVE_DEMO_DATA.health)
  })

  it('has controller pods info', () => {
    expect(typeof KSERVE_DEMO_DATA.controllerPods.ready).toBe('number')
    expect(typeof KSERVE_DEMO_DATA.controllerPods.total).toBe('number')
    expect(KSERVE_DEMO_DATA.controllerPods.ready)
      .toBeLessThanOrEqual(KSERVE_DEMO_DATA.controllerPods.total)
  })

  it('has inference services with required fields', () => {
    expect(KSERVE_DEMO_DATA.services.length).toBeGreaterThan(0)
    for (const s of KSERVE_DEMO_DATA.services) {
      expect(s.name).toBeTruthy()
      expect(s.id).toBeTruthy()
      expect(s.status).toBeTruthy()
    }
  })

  it('has consistent summary', () => {
    const { summary, services } = KSERVE_DEMO_DATA
    expect(summary.totalServices).toBe(services.length)
    expect(summary.readyServices + summary.notReadyServices).toBe(summary.totalServices)
  })

  it('has a lastCheckTime', () => {
    expect(KSERVE_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
