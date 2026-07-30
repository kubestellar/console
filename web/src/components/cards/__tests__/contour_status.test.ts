import { describe, it, expect } from 'vitest'
import { CONTOUR_DEMO_DATA, type ContourStatusData } from '../contour_status/demoData'

describe('CONTOUR_DEMO_DATA', () => {
  it('is defined', () => {
    expect(CONTOUR_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: ContourStatusData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(CONTOUR_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(CONTOUR_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('proxies', () => {
    it('is an array', () => {
      expect(Array.isArray(CONTOUR_DEMO_DATA.proxies)).toBe(true)
    })

    it('each proxy has required fields', () => {
      for (const proxy of CONTOUR_DEMO_DATA.proxies) {
        expect(typeof proxy.name).toBe('string')
        expect(proxy.name.length).toBeGreaterThan(0)
        expect(typeof proxy.namespace).toBe('string')
        expect(typeof proxy.cluster).toBe('string')
        expect(typeof proxy.fqdn).toBe('string')
        expect(['Valid', 'Invalid']).toContain(proxy.status)
        expect(Array.isArray(proxy.conditions)).toBe(true)
      }
    })

    it('covers Valid and Invalid statuses', () => {
      const statuses = new Set(CONTOUR_DEMO_DATA.proxies.map(p => p.status))
      expect(statuses.has('Valid')).toBe(true)
      expect(statuses.has('Invalid')).toBe(true)
    })
  })

  describe('envoyFleet', () => {
    it('has non-negative counts', () => {
      const { envoyFleet } = CONTOUR_DEMO_DATA
      expect(envoyFleet.total).toBeGreaterThanOrEqual(0)
      expect(envoyFleet.ready).toBeGreaterThanOrEqual(0)
      expect(envoyFleet.notReady).toBeGreaterThanOrEqual(0)
    })

    it('ready + notReady equals total', () => {
      const { envoyFleet } = CONTOUR_DEMO_DATA
      expect(envoyFleet.ready + envoyFleet.notReady).toBe(envoyFleet.total)
    })
  })

  describe('summary', () => {
    it('matches proxy array counts', () => {
      const total = CONTOUR_DEMO_DATA.proxies.length
      const valid = CONTOUR_DEMO_DATA.proxies.filter(p => p.status === 'Valid').length
      const invalid = CONTOUR_DEMO_DATA.proxies.filter(p => p.status === 'Invalid').length
      expect(CONTOUR_DEMO_DATA.summary.totalProxies).toBe(total)
      expect(CONTOUR_DEMO_DATA.summary.validProxies).toBe(valid)
      expect(CONTOUR_DEMO_DATA.summary.invalidProxies).toBe(invalid)
    })

    it('validProxies + invalidProxies equals totalProxies', () => {
      const { summary } = CONTOUR_DEMO_DATA
      expect(summary.validProxies + summary.invalidProxies).toBe(summary.totalProxies)
    })
  })
})
