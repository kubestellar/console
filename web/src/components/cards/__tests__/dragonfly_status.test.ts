import { describe, it, expect } from 'vitest'
import {
  DRAGONFLY_DEMO_DATA,
  type DragonflyHealth,
  type DragonflyComponent,
} from '../../../lib/demo/dragonfly'

describe('DRAGONFLY_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: DragonflyHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(DRAGONFLY_DEMO_DATA.health)
  })

  it('has a clusterName string', () => {
    expect(typeof DRAGONFLY_DEMO_DATA.clusterName).toBe('string')
    expect(DRAGONFLY_DEMO_DATA.clusterName.length).toBeGreaterThan(0)
  })

  describe('components', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(DRAGONFLY_DEMO_DATA.components)).toBe(true)
      expect(DRAGONFLY_DEMO_DATA.components.length).toBeGreaterThan(0)
    })

    it('each row has required fields', () => {
      const validComponents: DragonflyComponent[] = [
        'manager', 'scheduler', 'seed-peer', 'dfdaemon',
      ]
      for (const row of DRAGONFLY_DEMO_DATA.components) {
        expect(validComponents).toContain(row.component)
        expect(typeof row.name).toBe('string')
        expect(typeof row.namespace).toBe('string')
        expect(typeof row.cluster).toBe('string')
        expect(typeof row.ready).toBe('number')
        expect(typeof row.desired).toBe('number')
        expect(row.ready).toBeLessThanOrEqual(row.desired)
        expect(typeof row.version).toBe('string')
      }
    })

    it('covers all four Dragonfly component types', () => {
      const types = new Set(DRAGONFLY_DEMO_DATA.components.map(c => c.component))
      expect(types.has('manager')).toBe(true)
      expect(types.has('scheduler')).toBe(true)
      expect(types.has('seed-peer')).toBe(true)
      expect(types.has('dfdaemon')).toBe(true)
    })
  })

  describe('summary', () => {
    it('has non-negative replica counts', () => {
      const { summary } = DRAGONFLY_DEMO_DATA
      expect(summary.managerReplicas).toBeGreaterThanOrEqual(0)
      expect(summary.schedulerReplicas).toBeGreaterThanOrEqual(0)
      expect(summary.seedPeers).toBeGreaterThanOrEqual(0)
    })

    it('dfdaemonNodesUp does not exceed dfdaemonNodesTotal', () => {
      expect(DRAGONFLY_DEMO_DATA.summary.dfdaemonNodesUp).toBeLessThanOrEqual(
        DRAGONFLY_DEMO_DATA.summary.dfdaemonNodesTotal,
      )
    })

    it('cacheHitPercent is between 0 and 100', () => {
      expect(DRAGONFLY_DEMO_DATA.summary.cacheHitPercent).toBeGreaterThanOrEqual(0)
      expect(DRAGONFLY_DEMO_DATA.summary.cacheHitPercent).toBeLessThanOrEqual(100)
    })

    it('p2pBytesServed and upstreamBytes are non-negative', () => {
      expect(DRAGONFLY_DEMO_DATA.summary.p2pBytesServed).toBeGreaterThanOrEqual(0)
      expect(DRAGONFLY_DEMO_DATA.summary.upstreamBytes).toBeGreaterThanOrEqual(0)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(DRAGONFLY_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
