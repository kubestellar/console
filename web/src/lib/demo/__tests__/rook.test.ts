import { describe, it, expect } from 'vitest'
import { ROOK_DEMO_DATA } from '../rook'

describe('rook demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(ROOK_DEMO_DATA.health)
  })

  it('has clusters with required fields', () => {
    expect(ROOK_DEMO_DATA.clusters.length).toBeGreaterThan(0)
    for (const c of ROOK_DEMO_DATA.clusters) {
      expect(c.name).toBeTruthy()
      expect(c.cephHealth).toBeTruthy()
      expect(typeof c.osdUp).toBe('number')
      expect(typeof c.osdTotal).toBe('number')
    }
  })

  it('has consistent summary', () => {
    const { summary, clusters } = ROOK_DEMO_DATA
    expect(summary.totalClusters).toBe(clusters.length)
    expect(summary.totalCapacityBytes).toBeGreaterThan(0)
  })

  it('has a lastCheckTime', () => {
    expect(ROOK_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
