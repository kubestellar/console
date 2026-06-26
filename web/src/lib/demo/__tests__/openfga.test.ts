/**
 * Tests for lib/demo/openfga.ts
 */
import { describe, it, expect } from 'vitest'
import { OPENFGA_DEMO_DATA } from '../openfga'

describe('OPENFGA_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(OPENFGA_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(OPENFGA_DEMO_DATA.health)
  })

  it('has stores array', () => {
    expect(Array.isArray(OPENFGA_DEMO_DATA.stores)).toBe(true)
    expect(OPENFGA_DEMO_DATA.stores.length).toBeGreaterThan(0)
    for (const s of OPENFGA_DEMO_DATA.stores) {
      expect(typeof s.name).toBe('string')
      expect(['active', 'paused', 'draining']).toContain(s.status)
    }
  })

  it('has authorization models array', () => {
    expect(Array.isArray(OPENFGA_DEMO_DATA.models)).toBe(true)
    expect(OPENFGA_DEMO_DATA.models.length).toBeGreaterThan(0)
  })

  it('has a lastCheckTime string', () => {
    expect(typeof OPENFGA_DEMO_DATA.lastCheckTime).toBe('string')
  })

  it('has summary with store and model counts', () => {
    const s = OPENFGA_DEMO_DATA.summary
    expect(typeof s.totalStores).toBe('number')
    expect(typeof s.totalModels).toBe('number')
    expect(typeof s.totalTuples).toBe('number')
    expect(typeof s.endpoint).toBe('string')
    expect(s.totalStores).toBeGreaterThan(0)
  })

  it('summary.totalStores matches stores array length', () => {
    expect(OPENFGA_DEMO_DATA.summary.totalStores).toBe(OPENFGA_DEMO_DATA.stores.length)
  })
})
