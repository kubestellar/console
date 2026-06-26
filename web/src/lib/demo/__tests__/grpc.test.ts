/**
 * Tests for lib/demo/grpc.ts
 */
import { describe, it, expect } from 'vitest'
import { GRPC_DEMO_DATA } from '../grpc'

describe('GRPC_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(GRPC_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(GRPC_DEMO_DATA.health)
  })

  it('has services array with required fields', () => {
    expect(Array.isArray(GRPC_DEMO_DATA.services)).toBe(true)
    expect(GRPC_DEMO_DATA.services.length).toBeGreaterThan(0)
    for (const svc of GRPC_DEMO_DATA.services) {
      expect(typeof svc.name).toBe('string')
      expect(typeof svc.namespace).toBe('string')
      expect(['serving', 'not-serving', 'unknown']).toContain(svc.status)
      expect(typeof svc.rps).toBe('number')
      expect(typeof svc.latencyP99Ms).toBe('number')
    }
  })

  it('has a lastCheckTime string', () => {
    expect(typeof GRPC_DEMO_DATA.lastCheckTime).toBe('string')
  })

  it('has summary with service and endpoint counts', () => {
    const s = GRPC_DEMO_DATA.summary
    expect(typeof s.totalServices).toBe('number')
    expect(typeof s.servingServices).toBe('number')
    expect(typeof s.totalEndpoints).toBe('number')
    expect(s.servingServices).toBeLessThanOrEqual(s.totalServices)
  })

  it('summary.totalServices matches services array length', () => {
    expect(GRPC_DEMO_DATA.summary.totalServices).toBe(GRPC_DEMO_DATA.services.length)
  })
})
