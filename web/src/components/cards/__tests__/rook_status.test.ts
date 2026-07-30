import { describe, it, expect } from 'vitest'
import {
  ROOK_DEMO_DATA,
  type RookInstallHealth,
  type RookCephHealth,
} from '../../../lib/demo/rook'

describe('ROOK_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: RookInstallHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(ROOK_DEMO_DATA.health)
  })

  describe('clusters', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(ROOK_DEMO_DATA.clusters)).toBe(true)
      expect(ROOK_DEMO_DATA.clusters.length).toBeGreaterThan(0)
    })

    it('each cluster has required fields', () => {
      const validCephHealth: RookCephHealth[] = ['HEALTH_OK', 'HEALTH_WARN', 'HEALTH_ERR']
      for (const c of ROOK_DEMO_DATA.clusters) {
        expect(typeof c.namespace).toBe('string')
        expect(typeof c.name).toBe('string')
        expect(c.name.length).toBeGreaterThan(0)
        expect(typeof c.cephVersion).toBe('string')
        expect(validCephHealth).toContain(c.cephHealth)
        expect(typeof c.cluster).toBe('string')
      }
    })

    it('OSD counts are consistent per cluster', () => {
      for (const c of ROOK_DEMO_DATA.clusters) {
        expect(c.osdUp).toBeLessThanOrEqual(c.osdTotal)
        expect(c.osdIn).toBeLessThanOrEqual(c.osdTotal)
        expect(c.osdTotal).toBeGreaterThan(0)
      }
    })

    it('monitor quorum does not exceed expected', () => {
      for (const c of ROOK_DEMO_DATA.clusters) {
        expect(c.monQuorum).toBeLessThanOrEqual(c.monExpected)
        expect(c.monExpected).toBeGreaterThan(0)
      }
    })

    it('capacity used does not exceed total', () => {
      for (const c of ROOK_DEMO_DATA.clusters) {
        expect(c.capacityUsedBytes).toBeLessThanOrEqual(c.capacityTotalBytes)
        expect(c.capacityTotalBytes).toBeGreaterThan(0)
      }
    })

    it('PG counts are consistent', () => {
      for (const c of ROOK_DEMO_DATA.clusters) {
        expect(c.pgActiveClean).toBeLessThanOrEqual(c.pgTotal)
        expect(c.pgTotal).toBeGreaterThan(0)
        expect(typeof c.pools).toBe('number')
        expect(c.pools).toBeGreaterThan(0)
      }
    })
  })

  describe('summary', () => {
    it('totalClusters matches clusters array', () => {
      expect(ROOK_DEMO_DATA.summary.totalClusters).toBe(
        ROOK_DEMO_DATA.clusters.length,
      )
    })

    it('healthy + degraded does not exceed total', () => {
      const { healthyClusters, degradedClusters, totalClusters } = ROOK_DEMO_DATA.summary
      expect(healthyClusters + degradedClusters).toBeLessThanOrEqual(totalClusters)
    })

    it('OSD aggregates are consistent', () => {
      expect(ROOK_DEMO_DATA.summary.totalOsdUp).toBeLessThanOrEqual(
        ROOK_DEMO_DATA.summary.totalOsdTotal,
      )
    })

    it('capacity used does not exceed total', () => {
      expect(ROOK_DEMO_DATA.summary.totalUsedBytes).toBeLessThanOrEqual(
        ROOK_DEMO_DATA.summary.totalCapacityBytes,
      )
      expect(ROOK_DEMO_DATA.summary.totalCapacityBytes).toBeGreaterThan(0)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(ROOK_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
