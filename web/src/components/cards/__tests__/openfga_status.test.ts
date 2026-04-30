import { describe, it, expect } from 'vitest'
import {
  OPENFGA_DEMO_DATA,
  type OpenfgaHealth,
  type OpenfgaStoreStatus,
} from '../openfga_status/demoData'

describe('OPENFGA_DEMO_DATA', () => {
  it('is defined', () => {
    expect(OPENFGA_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: OpenfgaHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(OPENFGA_DEMO_DATA.health)
  })

  it('has stores array with entries', () => {
    expect(Array.isArray(OPENFGA_DEMO_DATA.stores)).toBe(true)
    expect(OPENFGA_DEMO_DATA.stores.length).toBeGreaterThan(0)
  })

  it('each store has required fields', () => {
    const validStatus: OpenfgaStoreStatus[] = ['active', 'paused', 'draining']
    for (const store of OPENFGA_DEMO_DATA.stores) {
      expect(typeof store.id).toBe('string')
      expect(typeof store.name).toBe('string')
      expect(typeof store.tupleCount).toBe('number')
      expect(typeof store.modelCount).toBe('number')
      expect(validStatus).toContain(store.status)
    }
  })

  it('has models array with entries', () => {
    expect(Array.isArray(OPENFGA_DEMO_DATA.models)).toBe(true)
    expect(OPENFGA_DEMO_DATA.models.length).toBeGreaterThan(0)
  })

  it('each model has required fields', () => {
    for (const model of OPENFGA_DEMO_DATA.models) {
      expect(typeof model.id).toBe('string')
      expect(typeof model.storeName).toBe('string')
      expect(typeof model.schemaVersion).toBe('string')
      expect(typeof model.typeCount).toBe('number')
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof OPENFGA_DEMO_DATA.stats.totalTuples).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.stats.totalStores).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.stats.totalModels).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.stats.serverVersion).toBe('string')
  })

  it('has stats.rps with api rates', () => {
    expect(typeof OPENFGA_DEMO_DATA.stats.rps.check).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.stats.rps.expand).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.stats.rps.listObjects).toBe('number')
  })

  it('has stats.latency with percentiles', () => {
    const { p50, p95, p99 } = OPENFGA_DEMO_DATA.stats.latency
    expect(typeof p50).toBe('number')
    expect(typeof p95).toBe('number')
    expect(typeof p99).toBe('number')
    expect(p50).toBeLessThanOrEqual(p95)
    expect(p95).toBeLessThanOrEqual(p99)
  })

  it('has summary with required fields', () => {
    expect(typeof OPENFGA_DEMO_DATA.summary.endpoint).toBe('string')
    expect(typeof OPENFGA_DEMO_DATA.summary.totalTuples).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.summary.totalStores).toBe('number')
    expect(typeof OPENFGA_DEMO_DATA.summary.totalModels).toBe('number')
  })
})
