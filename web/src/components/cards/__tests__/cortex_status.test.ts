import { describe, it, expect } from 'vitest'
import {
  CORTEX_DEMO_DATA,
  type CortexHealth,
  type CortexPodStatus,
} from '../../../lib/demo/cortex'

describe('CORTEX_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: CortexHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(CORTEX_DEMO_DATA.health)
  })

  it('has a version string', () => {
    expect(typeof CORTEX_DEMO_DATA.version).toBe('string')
    expect(CORTEX_DEMO_DATA.version.length).toBeGreaterThan(0)
  })

  describe('components', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(CORTEX_DEMO_DATA.components)).toBe(true)
      expect(CORTEX_DEMO_DATA.components.length).toBeGreaterThan(0)
    })

    it('each component has required fields', () => {
      const validStatuses: CortexPodStatus[] = ['running', 'pending', 'failed', 'unknown']
      for (const c of CORTEX_DEMO_DATA.components) {
        expect(typeof c.name).toBe('string')
        expect(c.name.length).toBeGreaterThan(0)
        expect(typeof c.namespace).toBe('string')
        expect(validStatuses).toContain(c.status)
        expect(typeof c.replicasDesired).toBe('number')
        expect(typeof c.replicasReady).toBe('number')
        expect(c.replicasReady).toBeLessThanOrEqual(c.replicasDesired)
      }
    })

    it('covers core Cortex components', () => {
      const names = new Set(CORTEX_DEMO_DATA.components.map(c => c.name))
      expect(names.has('distributor')).toBe(true)
      expect(names.has('ingester')).toBe(true)
    })
  })

  describe('metrics', () => {
    it('has non-negative ingestion metrics', () => {
      const { metrics } = CORTEX_DEMO_DATA
      expect(typeof metrics.activeSeries).toBe('number')
      expect(metrics.activeSeries).toBeGreaterThanOrEqual(0)
      expect(typeof metrics.ingestionRatePerSec).toBe('number')
      expect(metrics.ingestionRatePerSec).toBeGreaterThanOrEqual(0)
      expect(typeof metrics.queryRatePerSec).toBe('number')
      expect(typeof metrics.tenantCount).toBe('number')
      expect(metrics.tenantCount).toBeGreaterThan(0)
    })
  })

  describe('summary', () => {
    it('has consistent pod counts', () => {
      const { summary } = CORTEX_DEMO_DATA
      expect(summary.runningPods).toBeLessThanOrEqual(summary.totalPods)
      expect(summary.totalComponents).toBeGreaterThan(0)
      expect(summary.runningComponents).toBeLessThanOrEqual(summary.totalComponents)
    })

    it('totalPods matches sum of replicasDesired', () => {
      const sum = CORTEX_DEMO_DATA.components.reduce((s, c) => s + c.replicasDesired, 0)
      expect(CORTEX_DEMO_DATA.summary.totalPods).toBe(sum)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(CORTEX_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
