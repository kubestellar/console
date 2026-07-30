import { describe, it, expect } from 'vitest'
import {
  TRINO_GATEWAY_DEMO_DATA,
  type TrinoGatewayData,
  type TrinoGatewayStatus,
} from '../trino_gateway/demoData'

describe('TRINO_GATEWAY_DEMO_DATA', () => {
  it('is defined', () => {
    expect(TRINO_GATEWAY_DEMO_DATA).toBeDefined()
  })

  it('detected is boolean', () => {
    expect(typeof TRINO_GATEWAY_DEMO_DATA.detected).toBe('boolean')
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(TRINO_GATEWAY_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  it('totalWorkers is positive', () => {
    expect(TRINO_GATEWAY_DEMO_DATA.totalWorkers).toBeGreaterThan(0)
  })

  it('totalActiveQueries is non-negative', () => {
    expect(TRINO_GATEWAY_DEMO_DATA.totalActiveQueries).toBeGreaterThanOrEqual(0)
  })

  describe('trinoClusters', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(TRINO_GATEWAY_DEMO_DATA.trinoClusters)).toBe(true)
      expect(TRINO_GATEWAY_DEMO_DATA.trinoClusters.length).toBeGreaterThan(0)
    })

    it('each cluster has required fields', () => {
      for (const cluster of TRINO_GATEWAY_DEMO_DATA.trinoClusters) {
        expect(typeof cluster.name).toBe('string')
        expect(cluster.name.length).toBeGreaterThan(0)
        expect(typeof cluster.cluster).toBe('string')
        expect(typeof cluster.namespace).toBe('string')
        expect(typeof cluster.coordinatorReady).toBe('boolean')
        expect(cluster.workerCount).toBeGreaterThanOrEqual(0)
        expect(cluster.activeQueries).toBeGreaterThanOrEqual(0)
        expect(cluster.queuedQueries).toBeGreaterThanOrEqual(0)
      }
    })

    it('totalWorkers matches sum of cluster workerCounts', () => {
      const sum = TRINO_GATEWAY_DEMO_DATA.trinoClusters.reduce(
        (acc, c) => acc + c.workerCount,
        0,
      )
      expect(TRINO_GATEWAY_DEMO_DATA.totalWorkers).toBe(sum)
    })

    it('totalActiveQueries matches sum of cluster activeQueries', () => {
      const sum = TRINO_GATEWAY_DEMO_DATA.trinoClusters.reduce(
        (acc, c) => acc + c.activeQueries,
        0,
      )
      expect(TRINO_GATEWAY_DEMO_DATA.totalActiveQueries).toBe(sum)
    })
  })

  describe('gateways', () => {
    it('is an array', () => {
      expect(Array.isArray(TRINO_GATEWAY_DEMO_DATA.gateways)).toBe(true)
    })

    it('each gateway has valid status', () => {
      const valid: TrinoGatewayStatus[] = ['healthy', 'degraded', 'down']
      for (const gw of TRINO_GATEWAY_DEMO_DATA.gateways) {
        expect(valid).toContain(gw.status)
        expect(typeof gw.name).toBe('string')
        expect(typeof gw.cluster).toBe('string')
        expect(typeof gw.namespace).toBe('string')
        expect(Array.isArray(gw.backends)).toBe(true)
      }
    })

    it('each backend has required fields', () => {
      for (const gw of TRINO_GATEWAY_DEMO_DATA.gateways) {
        for (const be of gw.backends) {
          expect(typeof be.name).toBe('string')
          expect(typeof be.cluster).toBe('string')
          expect(typeof be.active).toBe('boolean')
          expect(typeof be.draining).toBe('boolean')
        }
      }
    })
  })
})
