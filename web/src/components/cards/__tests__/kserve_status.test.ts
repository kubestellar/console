import { describe, it, expect } from 'vitest'
import {
  KSERVE_DEMO_DATA,
  type KServeHealth,
  type KServeServiceStatus,
} from '../../../lib/demo/kserve'

describe('KSERVE_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: KServeHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(KSERVE_DEMO_DATA.health)
  })

  describe('controllerPods', () => {
    it('ready does not exceed total', () => {
      expect(KSERVE_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(
        KSERVE_DEMO_DATA.controllerPods.total,
      )
      expect(KSERVE_DEMO_DATA.controllerPods.total).toBeGreaterThan(0)
    })
  })

  describe('services', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(KSERVE_DEMO_DATA.services)).toBe(true)
      expect(KSERVE_DEMO_DATA.services.length).toBeGreaterThan(0)
    })

    it('each service has required fields', () => {
      const validStatuses: KServeServiceStatus[] = ['ready', 'not-ready', 'unknown']
      for (const s of KSERVE_DEMO_DATA.services) {
        expect(typeof s.id).toBe('string')
        expect(typeof s.name).toBe('string')
        expect(s.name.length).toBeGreaterThan(0)
        expect(typeof s.namespace).toBe('string')
        expect(typeof s.cluster).toBe('string')
        expect(validStatuses).toContain(s.status)
        expect(typeof s.modelName).toBe('string')
        expect(typeof s.runtime).toBe('string')
        expect(typeof s.url).toBe('string')
        expect(typeof s.trafficPercent).toBe('number')
        expect(s.trafficPercent).toBeGreaterThanOrEqual(0)
        expect(s.trafficPercent).toBeLessThanOrEqual(100)
      }
    })

    it('readyReplicas does not exceed desiredReplicas', () => {
      for (const s of KSERVE_DEMO_DATA.services) {
        expect(s.readyReplicas).toBeLessThanOrEqual(s.desiredReplicas)
      }
    })

    it('has non-negative performance metrics', () => {
      for (const s of KSERVE_DEMO_DATA.services) {
        expect(s.requestsPerSecond).toBeGreaterThanOrEqual(0)
        expect(s.p95LatencyMs).toBeGreaterThanOrEqual(0)
      }
    })

    it('each service has valid updatedAt ISO string', () => {
      for (const s of KSERVE_DEMO_DATA.services) {
        expect(new Date(s.updatedAt).getTime()).not.toBeNaN()
      }
    })
  })

  describe('summary', () => {
    it('totalServices matches services array', () => {
      expect(KSERVE_DEMO_DATA.summary.totalServices).toBe(
        KSERVE_DEMO_DATA.services.length,
      )
    })

    it('ready + notReady equals totalServices', () => {
      const { readyServices, notReadyServices, totalServices } = KSERVE_DEMO_DATA.summary
      expect(readyServices + notReadyServices).toBe(totalServices)
    })

    it('has non-negative aggregated metrics', () => {
      expect(KSERVE_DEMO_DATA.summary.totalRequestsPerSecond).toBeGreaterThanOrEqual(0)
      expect(KSERVE_DEMO_DATA.summary.avgP95LatencyMs).toBeGreaterThanOrEqual(0)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(KSERVE_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
