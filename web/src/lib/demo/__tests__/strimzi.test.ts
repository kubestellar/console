/**
 * Tests for lib/demo/strimzi.ts
 */
import { describe, it, expect } from 'vitest'
import { STRIMZI_DEMO_DATA } from '../strimzi'

describe('STRIMZI_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(STRIMZI_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(STRIMZI_DEMO_DATA.health)
  })

  it('has Kafka clusters array with required fields', () => {
    expect(Array.isArray(STRIMZI_DEMO_DATA.clusters)).toBe(true)
    expect(STRIMZI_DEMO_DATA.clusters.length).toBeGreaterThan(0)
    for (const c of STRIMZI_DEMO_DATA.clusters) {
      expect(typeof c.name).toBe('string')
      expect(typeof c.namespace).toBe('string')
      expect(['healthy', 'degraded', 'unavailable']).toContain(c.health)
      expect(typeof c.brokers.ready).toBe('number')
      expect(typeof c.brokers.total).toBe('number')
      expect(c.brokers.ready).toBeLessThanOrEqual(c.brokers.total)
      expect(c.brokers.total).toBeGreaterThan(0)
    }
  })

  it('has a lastCheckTime string', () => {
    expect(typeof STRIMZI_DEMO_DATA.lastCheckTime).toBe('string')
  })

  it('has summary with cluster and broker counts', () => {
    const s = STRIMZI_DEMO_DATA.summary
    expect(typeof s.totalClusters).toBe('number')
    expect(typeof s.healthyClusters).toBe('number')
    expect(typeof s.totalBrokers).toBe('number')
    expect(typeof s.readyBrokers).toBe('number')
    expect(s.healthyClusters).toBeLessThanOrEqual(s.totalClusters)
    expect(s.readyBrokers).toBeLessThanOrEqual(s.totalBrokers)
  })

  it('summary.totalClusters matches clusters array length', () => {
    expect(STRIMZI_DEMO_DATA.summary.totalClusters).toBe(STRIMZI_DEMO_DATA.clusters.length)
  })
})
