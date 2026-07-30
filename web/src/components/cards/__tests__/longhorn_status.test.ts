import { describe, it, expect } from 'vitest'
import {
  LONGHORN_DEMO_DATA,
  type LonghornInstallHealth,
  type LonghornVolumeState,
  type LonghornVolumeRobustness,
} from '../../../lib/demo/longhorn'

describe('LONGHORN_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: LonghornInstallHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(LONGHORN_DEMO_DATA.health)
  })

  describe('volumes', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(LONGHORN_DEMO_DATA.volumes)).toBe(true)
      expect(LONGHORN_DEMO_DATA.volumes.length).toBeGreaterThan(0)
    })

    it('each volume has required fields with valid state and robustness', () => {
      const validStates: LonghornVolumeState[] = [
        'attached', 'detached', 'attaching', 'detaching', 'creating', 'deleting',
      ]
      const validRobustness: LonghornVolumeRobustness[] = [
        'healthy', 'degraded', 'faulted', 'unknown',
      ]
      for (const v of LONGHORN_DEMO_DATA.volumes) {
        expect(typeof v.name).toBe('string')
        expect(v.name.length).toBeGreaterThan(0)
        expect(typeof v.namespace).toBe('string')
        expect(validStates).toContain(v.state)
        expect(validRobustness).toContain(v.robustness)
        expect(typeof v.replicasDesired).toBe('number')
        expect(typeof v.replicasHealthy).toBe('number')
        expect(v.replicasHealthy).toBeLessThanOrEqual(v.replicasDesired)
        expect(typeof v.sizeBytes).toBe('number')
        expect(v.sizeBytes).toBeGreaterThan(0)
        expect(typeof v.actualSizeBytes).toBe('number')
      }
    })
  })

  describe('nodes', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(LONGHORN_DEMO_DATA.nodes)).toBe(true)
      expect(LONGHORN_DEMO_DATA.nodes.length).toBeGreaterThan(0)
    })

    it('each node has required fields', () => {
      for (const n of LONGHORN_DEMO_DATA.nodes) {
        expect(typeof n.name).toBe('string')
        expect(n.name.length).toBeGreaterThan(0)
        expect(typeof n.cluster).toBe('string')
        expect(typeof n.ready).toBe('boolean')
        expect(typeof n.schedulable).toBe('boolean')
        expect(typeof n.storageTotalBytes).toBe('number')
        expect(n.storageTotalBytes).toBeGreaterThan(0)
        expect(typeof n.storageUsedBytes).toBe('number')
        expect(n.storageUsedBytes).toBeLessThanOrEqual(n.storageTotalBytes)
        expect(typeof n.replicaCount).toBe('number')
      }
    })
  })

  describe('summary', () => {
    it('totalVolumes matches volumes array', () => {
      expect(LONGHORN_DEMO_DATA.summary.totalVolumes).toBe(
        LONGHORN_DEMO_DATA.volumes.length,
      )
    })

    it('totalNodes matches nodes array', () => {
      expect(LONGHORN_DEMO_DATA.summary.totalNodes).toBe(
        LONGHORN_DEMO_DATA.nodes.length,
      )
    })

    it('volume status counts do not exceed total', () => {
      const { healthyVolumes, degradedVolumes, faultedVolumes, totalVolumes } =
        LONGHORN_DEMO_DATA.summary
      expect(healthyVolumes + degradedVolumes + faultedVolumes).toBeLessThanOrEqual(totalVolumes)
    })

    it('node counts do not exceed total', () => {
      const { readyNodes, schedulableNodes, totalNodes } = LONGHORN_DEMO_DATA.summary
      expect(readyNodes).toBeLessThanOrEqual(totalNodes)
      expect(schedulableNodes).toBeLessThanOrEqual(totalNodes)
    })

    it('capacity and usage are positive', () => {
      expect(LONGHORN_DEMO_DATA.summary.totalCapacityBytes).toBeGreaterThan(0)
      expect(LONGHORN_DEMO_DATA.summary.totalUsedBytes).toBeGreaterThanOrEqual(0)
      expect(LONGHORN_DEMO_DATA.summary.totalUsedBytes).toBeLessThanOrEqual(
        LONGHORN_DEMO_DATA.summary.totalCapacityBytes,
      )
    })
  })

  it('has valid lastCheckTime ISO string', () => {
    expect(new Date(LONGHORN_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
