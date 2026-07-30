import { describe, it, expect } from 'vitest'
import { K3S_DEMO_DATA, type K3sStatusDemoData } from '../multi-tenancy/k3s-status/demoData'

describe('K3S_DEMO_DATA', () => {
  it('is defined', () => {
    expect(K3S_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(K3S_DEMO_DATA.health)
  })

  it('detected is a boolean', () => {
    expect(typeof K3S_DEMO_DATA.detected).toBe('boolean')
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(K3S_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('pod counts', () => {
    it('healthyPods + unhealthyPods equals podCount', () => {
      expect(K3S_DEMO_DATA.healthyPods + K3S_DEMO_DATA.unhealthyPods).toBe(K3S_DEMO_DATA.podCount)
    })

    it('all counts are positive', () => {
      expect(K3S_DEMO_DATA.podCount).toBeGreaterThan(0)
      expect(K3S_DEMO_DATA.healthyPods).toBeGreaterThanOrEqual(0)
      expect(K3S_DEMO_DATA.unhealthyPods).toBeGreaterThanOrEqual(0)
    })
  })

  describe('serverPods', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(K3S_DEMO_DATA.serverPods)).toBe(true)
      expect(K3S_DEMO_DATA.serverPods.length).toBeGreaterThan(0)
    })

    it('each server pod has required fields', () => {
      const validStatuses = ['running', 'pending', 'failed']
      for (const pod of K3S_DEMO_DATA.serverPods) {
        expect(typeof pod.name).toBe('string')
        expect(pod.name.length).toBeGreaterThan(0)
        expect(typeof pod.namespace).toBe('string')
        expect(typeof pod.version).toBe('string')
        expect(validStatuses).toContain(pod.status)
      }
    })

    it('server pod count is less than or equal to podCount', () => {
      expect(K3S_DEMO_DATA.serverPods.length).toBeLessThanOrEqual(K3S_DEMO_DATA.podCount)
    })
  })
})
