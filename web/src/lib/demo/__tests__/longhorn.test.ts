import { describe, it, expect } from 'vitest'
import { LONGHORN_DEMO_DATA } from '../longhorn'

describe('longhorn demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(LONGHORN_DEMO_DATA.health)
  })

  it('has volumes array with required fields', () => {
    expect(LONGHORN_DEMO_DATA.volumes.length).toBeGreaterThan(0)
    for (const v of LONGHORN_DEMO_DATA.volumes) {
      expect(v.name).toBeTruthy()
      expect(v.state).toBeTruthy()
      expect(v.robustness).toBeTruthy()
      expect(typeof v.replicasDesired).toBe('number')
      expect(typeof v.sizeBytes).toBe('number')
    }
  })

  it('has nodes array with required fields', () => {
    expect(LONGHORN_DEMO_DATA.nodes.length).toBeGreaterThan(0)
    for (const n of LONGHORN_DEMO_DATA.nodes) {
      expect(n.name).toBeTruthy()
      expect(typeof n.ready).toBe('boolean')
      expect(typeof n.schedulable).toBe('boolean')
      expect(typeof n.storageTotalBytes).toBe('number')
      expect(typeof n.storageUsedBytes).toBe('number')
    }
  })

  it('has consistent summary counts', () => {
    const { summary, volumes, nodes } = LONGHORN_DEMO_DATA
    expect(summary.totalVolumes).toBe(volumes.length)
    expect(summary.totalNodes).toBe(nodes.length)
    expect(summary.healthyVolumes + summary.degradedVolumes + summary.faultedVolumes)
      .toBeLessThanOrEqual(summary.totalVolumes)
    expect(summary.totalCapacityBytes).toBeGreaterThan(0)
    expect(summary.totalUsedBytes).toBeGreaterThanOrEqual(0)
  })

  it('has a lastCheckTime ISO string', () => {
    expect(LONGHORN_DEMO_DATA.lastCheckTime).toBeTruthy()
    expect(new Date(LONGHORN_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
