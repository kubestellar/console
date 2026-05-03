import { describe, it, expect } from 'vitest'
import {
  GRPC_DEMO_DATA,
  type GrpcHealth,
  type GrpcServingStatus,
} from '../grpc_status/demoData'

describe('GRPC_DEMO_DATA', () => {
  it('is defined', () => {
    expect(GRPC_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: GrpcHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(GRPC_DEMO_DATA.health)
  })

  it('has services array with entries', () => {
    expect(Array.isArray(GRPC_DEMO_DATA.services)).toBe(true)
    expect(GRPC_DEMO_DATA.services.length).toBeGreaterThan(0)
  })

  it('each service has required fields', () => {
    const validStatus: GrpcServingStatus[] = ['serving', 'not-serving', 'unknown']
    for (const svc of GRPC_DEMO_DATA.services) {
      expect(typeof svc.name).toBe('string')
      expect(typeof svc.namespace).toBe('string')
      expect(typeof svc.endpoints).toBe('number')
      expect(typeof svc.rps).toBe('number')
      expect(typeof svc.latencyP99Ms).toBe('number')
      expect(typeof svc.errorRatePct).toBe('number')
      expect(validStatus).toContain(svc.status)
      expect(typeof svc.cluster).toBe('string')
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof GRPC_DEMO_DATA.stats.totalRps).toBe('number')
    expect(typeof GRPC_DEMO_DATA.stats.avgLatencyP99Ms).toBe('number')
    expect(typeof GRPC_DEMO_DATA.stats.avgErrorRatePct).toBe('number')
    expect(typeof GRPC_DEMO_DATA.stats.reflectionEnabled).toBe('number')
  })

  it('has summary with required counts', () => {
    expect(typeof GRPC_DEMO_DATA.summary.totalServices).toBe('number')
    expect(typeof GRPC_DEMO_DATA.summary.servingServices).toBe('number')
    expect(typeof GRPC_DEMO_DATA.summary.totalEndpoints).toBe('number')
  })

  it('servingServices <= totalServices', () => {
    expect(GRPC_DEMO_DATA.summary.servingServices).toBeLessThanOrEqual(GRPC_DEMO_DATA.summary.totalServices)
  })
})
