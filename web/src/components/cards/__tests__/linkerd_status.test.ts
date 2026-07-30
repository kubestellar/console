import { describe, it, expect } from 'vitest'
import {
  LINKERD_DEMO_DATA,
  type LinkerdHealth,
  type LinkerdPodStatus,
} from '../linkerd_status/demoData'

describe('LINKERD_DEMO_DATA', () => {
  it('is defined', () => {
    expect(LINKERD_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: LinkerdHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(LINKERD_DEMO_DATA.health)
  })

  it('has deployments array with entries', () => {
    expect(Array.isArray(LINKERD_DEMO_DATA.deployments)).toBe(true)
    expect(LINKERD_DEMO_DATA.deployments.length).toBeGreaterThan(0)
  })

  it('each deployment has required fields', () => {
    const validStatus: LinkerdPodStatus[] = ['meshed', 'partial', 'unmeshed']
    for (const dep of LINKERD_DEMO_DATA.deployments) {
      expect(typeof dep.namespace).toBe('string')
      expect(typeof dep.deployment).toBe('string')
      expect(typeof dep.meshedPods).toBe('number')
      expect(typeof dep.totalPods).toBe('number')
      expect(typeof dep.successRatePct).toBe('number')
      expect(typeof dep.requestsPerSecond).toBe('number')
      expect(typeof dep.p99LatencyMs).toBe('number')
      expect(validStatus).toContain(dep.status)
      expect(typeof dep.cluster).toBe('string')
    }
  })

  it('meshedPods <= totalPods per deployment', () => {
    for (const dep of LINKERD_DEMO_DATA.deployments) {
      expect(dep.meshedPods).toBeLessThanOrEqual(dep.totalPods)
    }
  })

  it('has stats with required fields', () => {
    expect(typeof LINKERD_DEMO_DATA.stats.totalRps).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.stats.avgSuccessRatePct).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.stats.avgP99LatencyMs).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.stats.controlPlaneVersion).toBe('string')
  })

  it('has summary with required fields', () => {
    expect(typeof LINKERD_DEMO_DATA.summary.totalDeployments).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.summary.fullyMeshedDeployments).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.summary.totalMeshedPods).toBe('number')
    expect(typeof LINKERD_DEMO_DATA.summary.totalPods).toBe('number')
  })
})
