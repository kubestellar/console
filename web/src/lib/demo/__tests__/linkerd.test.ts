/**
 * Tests for lib/demo/linkerd.ts
 */
import { describe, it, expect } from 'vitest'
import { LINKERD_DEMO_DATA } from '../linkerd'

describe('LINKERD_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(LINKERD_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(LINKERD_DEMO_DATA.health)
  })

  it('has deployments array with required fields', () => {
    expect(Array.isArray(LINKERD_DEMO_DATA.deployments)).toBe(true)
    expect(LINKERD_DEMO_DATA.deployments.length).toBeGreaterThan(0)
    for (const d of LINKERD_DEMO_DATA.deployments) {
      expect(typeof d.namespace).toBe('string')
      expect(typeof d.deployment).toBe('string')
      expect(['meshed', 'partial', 'unmeshed']).toContain(d.status)
      expect(typeof d.meshedPods).toBe('number')
      expect(typeof d.totalPods).toBe('number')
      expect(d.meshedPods).toBeLessThanOrEqual(d.totalPods)
      expect(typeof d.successRatePct).toBe('number')
      expect(d.successRatePct).toBeGreaterThanOrEqual(0)
      expect(d.successRatePct).toBeLessThanOrEqual(100)
    }
  })

  it('has a lastCheckTime string', () => {
    expect(typeof LINKERD_DEMO_DATA.lastCheckTime).toBe('string')
  })

  it('has summary with deployment and pod counts', () => {
    const s = LINKERD_DEMO_DATA.summary
    expect(typeof s.totalDeployments).toBe('number')
    expect(typeof s.fullyMeshedDeployments).toBe('number')
    expect(typeof s.totalMeshedPods).toBe('number')
    expect(typeof s.totalPods).toBe('number')
    expect(s.fullyMeshedDeployments).toBeLessThanOrEqual(s.totalDeployments)
    expect(s.totalMeshedPods).toBeLessThanOrEqual(s.totalPods)
  })

  it('summary.totalDeployments matches deployments array length', () => {
    expect(LINKERD_DEMO_DATA.summary.totalDeployments).toBe(LINKERD_DEMO_DATA.deployments.length)
  })
})
