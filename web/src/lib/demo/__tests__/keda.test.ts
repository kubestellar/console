/**
 * Tests for lib/demo/keda.ts
 */
import { describe, it, expect } from 'vitest'
import { KEDA_DEMO_DATA } from '../keda'

describe('KEDA_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(KEDA_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(KEDA_DEMO_DATA.health)
  })

  it('has operatorPods with ready/total counts', () => {
    const { operatorPods } = KEDA_DEMO_DATA
    expect(typeof operatorPods.ready).toBe('number')
    expect(typeof operatorPods.total).toBe('number')
    expect(operatorPods.ready).toBeLessThanOrEqual(operatorPods.total)
  })

  it('has scaledObjects array with required fields', () => {
    expect(Array.isArray(KEDA_DEMO_DATA.scaledObjects)).toBe(true)
    expect(KEDA_DEMO_DATA.scaledObjects.length).toBeGreaterThan(0)
    for (const so of KEDA_DEMO_DATA.scaledObjects) {
      expect(typeof so.name).toBe('string')
      expect(typeof so.namespace).toBe('string')
      expect(['ready', 'degraded', 'paused', 'error']).toContain(so.status)
      expect(typeof so.currentReplicas).toBe('number')
      expect(typeof so.desiredReplicas).toBe('number')
      expect(so.maxReplicas).toBeGreaterThanOrEqual(so.minReplicas)
    }
  })

  it('each scaledObject has triggers array', () => {
    for (const so of KEDA_DEMO_DATA.scaledObjects) {
      expect(Array.isArray(so.triggers)).toBe(true)
      for (const t of so.triggers) {
        expect(typeof t.type).toBe('string')
        expect(typeof t.currentValue).toBe('number')
        expect(typeof t.targetValue).toBe('number')
      }
    }
  })

  it('has totalScaledJobs as a non-negative number', () => {
    expect(typeof KEDA_DEMO_DATA.totalScaledJobs).toBe('number')
    expect(KEDA_DEMO_DATA.totalScaledJobs).toBeGreaterThanOrEqual(0)
  })

  it('has a lastCheckTime string', () => {
    expect(typeof KEDA_DEMO_DATA.lastCheckTime).toBe('string')
  })
})
