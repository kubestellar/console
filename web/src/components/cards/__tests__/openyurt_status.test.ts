import { describe, it, expect } from 'vitest'
import {
  OPENYURT_DEMO_DATA,
  type OpenYurtDemoData,
  type NodePoolType,
  type NodePoolStatus,
  type GatewayStatus,
} from '../openyurt_status/demoData'

describe('OPENYURT_DEMO_DATA', () => {
  it('is defined', () => {
    expect(OPENYURT_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: OpenYurtDemoData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(OPENYURT_DEMO_DATA.health)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(OPENYURT_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('controllerPods', () => {
    it('has ready and total', () => {
      expect(typeof OPENYURT_DEMO_DATA.controllerPods.ready).toBe('number')
      expect(typeof OPENYURT_DEMO_DATA.controllerPods.total).toBe('number')
    })

    it('ready does not exceed total', () => {
      expect(OPENYURT_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(
        OPENYURT_DEMO_DATA.controllerPods.total,
      )
    })
  })

  describe('nodePools', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(OPENYURT_DEMO_DATA.nodePools)).toBe(true)
      expect(OPENYURT_DEMO_DATA.nodePools.length).toBeGreaterThan(0)
    })

    it('each pool has valid type', () => {
      const validTypes: NodePoolType[] = ['edge', 'cloud']
      for (const pool of OPENYURT_DEMO_DATA.nodePools) {
        expect(validTypes).toContain(pool.type)
      }
    })

    it('each pool has valid status', () => {
      const validStatuses: NodePoolStatus[] = ['ready', 'degraded', 'not-ready']
      for (const pool of OPENYURT_DEMO_DATA.nodePools) {
        expect(validStatuses).toContain(pool.status)
      }
    })

    it('each pool has valid node counts', () => {
      for (const pool of OPENYURT_DEMO_DATA.nodePools) {
        expect(pool.nodeCount).toBeGreaterThan(0)
        expect(pool.readyNodes).toBeGreaterThanOrEqual(0)
        expect(pool.readyNodes).toBeLessThanOrEqual(pool.nodeCount)
        expect(typeof pool.autonomyEnabled).toBe('boolean')
      }
    })

    it('covers edge and cloud types', () => {
      const types = new Set(OPENYURT_DEMO_DATA.nodePools.map(p => p.type))
      expect(types.has('edge')).toBe(true)
      expect(types.has('cloud')).toBe(true)
    })

    it('covers multiple status variants', () => {
      const statuses = new Set(OPENYURT_DEMO_DATA.nodePools.map(p => p.status))
      expect(statuses.size).toBeGreaterThan(1)
    })
  })

  describe('gateways', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(OPENYURT_DEMO_DATA.gateways)).toBe(true)
      expect(OPENYURT_DEMO_DATA.gateways.length).toBeGreaterThan(0)
    })

    it('each gateway has valid status', () => {
      const valid: GatewayStatus[] = ['connected', 'disconnected', 'pending']
      for (const gw of OPENYURT_DEMO_DATA.gateways) {
        expect(valid).toContain(gw.status)
        expect(typeof gw.name).toBe('string')
        expect(typeof gw.nodePool).toBe('string')
        expect(typeof gw.endpoint).toBe('string')
      }
    })

    it('covers connected and disconnected states', () => {
      const statuses = new Set(OPENYURT_DEMO_DATA.gateways.map(g => g.status))
      expect(statuses.has('connected')).toBe(true)
      expect(statuses.has('disconnected')).toBe(true)
    })
  })

  describe('node totals', () => {
    it('totalNodes is positive', () => {
      expect(OPENYURT_DEMO_DATA.totalNodes).toBeGreaterThan(0)
    })

    it('autonomousNodes does not exceed totalNodes', () => {
      expect(OPENYURT_DEMO_DATA.autonomousNodes).toBeLessThanOrEqual(
        OPENYURT_DEMO_DATA.totalNodes,
      )
    })
  })
})
