/**
 * Tests for lib/demo/envoy.ts
 */
import { describe, it, expect } from 'vitest'
import { ENVOY_DEMO_DATA } from '../envoy'

describe('ENVOY_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(ENVOY_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(ENVOY_DEMO_DATA.health)
  })

  it('has listeners array with required fields', () => {
    expect(Array.isArray(ENVOY_DEMO_DATA.listeners)).toBe(true)
    expect(ENVOY_DEMO_DATA.listeners.length).toBeGreaterThan(0)
    for (const l of ENVOY_DEMO_DATA.listeners) {
      expect(typeof l.name).toBe('string')
      expect(typeof l.port).toBe('number')
      expect(['active', 'draining', 'warming']).toContain(l.status)
    }
  })

  it('has upstream clusters array', () => {
    expect(Array.isArray(ENVOY_DEMO_DATA.clusters)).toBe(true)
    expect(ENVOY_DEMO_DATA.clusters.length).toBeGreaterThan(0)
  })

  it('has summary with listener and cluster counts', () => {
    const s = ENVOY_DEMO_DATA.summary
    expect(typeof s.totalListeners).toBe('number')
    expect(typeof s.activeListeners).toBe('number')
    expect(typeof s.totalClusters).toBe('number')
    expect(typeof s.healthyClusters).toBe('number')
    expect(s.activeListeners).toBeLessThanOrEqual(s.totalListeners)
    expect(s.healthyClusters).toBeLessThanOrEqual(s.totalClusters)
  })
})
