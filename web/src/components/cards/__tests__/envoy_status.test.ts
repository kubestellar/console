import { describe, it, expect } from 'vitest'
import {
  ENVOY_DEMO_DATA,
  type EnvoyHealth,
  type EnvoyListenerStatus,
  type EnvoyClusterHealth,
} from '../envoy_status/demoData'

describe('ENVOY_DEMO_DATA', () => {
  it('is defined', () => {
    expect(ENVOY_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: EnvoyHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(ENVOY_DEMO_DATA.health)
  })

  it('has listeners array with entries', () => {
    expect(Array.isArray(ENVOY_DEMO_DATA.listeners)).toBe(true)
    expect(ENVOY_DEMO_DATA.listeners.length).toBeGreaterThan(0)
  })

  it('each listener has required fields', () => {
    const validStatus: EnvoyListenerStatus[] = ['active', 'draining', 'warming']
    for (const l of ENVOY_DEMO_DATA.listeners) {
      expect(typeof l.name).toBe('string')
      expect(typeof l.address).toBe('string')
      expect(typeof l.port).toBe('number')
      expect(validStatus).toContain(l.status)
      expect(typeof l.cluster).toBe('string')
    }
  })

  it('has clusters array with entries', () => {
    expect(Array.isArray(ENVOY_DEMO_DATA.clusters)).toBe(true)
    expect(ENVOY_DEMO_DATA.clusters.length).toBeGreaterThan(0)
  })

  it('each upstream cluster has required fields', () => {
    for (const c of ENVOY_DEMO_DATA.clusters) {
      expect(typeof c.name).toBe('string')
      expect(typeof c.upstream).toBe('string')
      expect(typeof c.endpointsTotal).toBe('number')
      expect(typeof c.endpointsHealthy).toBe('number')
      expect(c.endpointsHealthy).toBeLessThanOrEqual(c.endpointsTotal)
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof ENVOY_DEMO_DATA.stats.requestsPerSecond).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.stats.activeConnections).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.stats.totalRequests).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.stats.http5xxRate).toBe('number')
  })

  it('has summary with required counts', () => {
    expect(typeof ENVOY_DEMO_DATA.summary.totalListeners).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.summary.activeListeners).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.summary.totalClusters).toBe('number')
    expect(typeof ENVOY_DEMO_DATA.summary.healthyClusters).toBe('number')
  })

  it('activeListeners <= totalListeners', () => {
    expect(ENVOY_DEMO_DATA.summary.activeListeners).toBeLessThanOrEqual(ENVOY_DEMO_DATA.summary.totalListeners)
  })
})
