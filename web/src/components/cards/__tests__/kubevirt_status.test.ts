import { describe, it, expect } from 'vitest'
import {
  KUBEVIRT_DEMO_DATA,
  type KubevirtStatusDemoData,
  type VmInfo,
} from '../multi-tenancy/kubevirt-status/demoData'

describe('KUBEVIRT_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KUBEVIRT_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(KUBEVIRT_DEMO_DATA.health)
  })

  it('detected is a boolean', () => {
    expect(typeof KUBEVIRT_DEMO_DATA.detected).toBe('boolean')
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(KUBEVIRT_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('pod counts', () => {
    it('healthyPods + unhealthyPods equals podCount', () => {
      const { podCount, healthyPods, unhealthyPods } = KUBEVIRT_DEMO_DATA
      expect(healthyPods + unhealthyPods).toBe(podCount)
    })

    it('all counts are non-negative', () => {
      expect(KUBEVIRT_DEMO_DATA.podCount).toBeGreaterThanOrEqual(0)
      expect(KUBEVIRT_DEMO_DATA.healthyPods).toBeGreaterThanOrEqual(0)
      expect(KUBEVIRT_DEMO_DATA.unhealthyPods).toBeGreaterThanOrEqual(0)
    })
  })

  describe('vms', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(KUBEVIRT_DEMO_DATA.vms)).toBe(true)
      expect(KUBEVIRT_DEMO_DATA.vms.length).toBeGreaterThan(0)
    })

    it('each VM has required fields', () => {
      const validStates = ['running', 'stopped', 'paused', 'migrating', 'pending', 'failed', 'unknown']
      for (const vm of KUBEVIRT_DEMO_DATA.vms) {
        expect(typeof vm.name).toBe('string')
        expect(vm.name.length).toBeGreaterThan(0)
        expect(typeof vm.namespace).toBe('string')
        expect(typeof vm.cluster).toBe('string')
        expect(validStates).toContain(vm.state)
      }
    })

    it('covers multiple VM states', () => {
      const states = new Set(KUBEVIRT_DEMO_DATA.vms.map(v => v.state))
      expect(states.size).toBeGreaterThan(1)
    })
  })

  describe('clusters', () => {
    it('is a non-empty array', () => {
      expect(KUBEVIRT_DEMO_DATA.clusters.length).toBeGreaterThan(0)
    })

    it('each cluster has valid fields', () => {
      const validHealth = ['healthy', 'degraded', 'not-installed', 'unknown']
      for (const cl of KUBEVIRT_DEMO_DATA.clusters) {
        expect(typeof cl.cluster).toBe('string')
        expect(typeof cl.installed).toBe('boolean')
        expect(cl.vmCount).toBeGreaterThanOrEqual(0)
        expect(cl.runningCount).toBeGreaterThanOrEqual(0)
        expect(cl.runningCount).toBeLessThanOrEqual(cl.vmCount)
        expect(cl.infraPods).toBeGreaterThanOrEqual(0)
        expect(validHealth).toContain(cl.health)
      }
    })

    it('sum of cluster vmCounts equals vm array length', () => {
      const sum = KUBEVIRT_DEMO_DATA.clusters.reduce((a, c) => a + c.vmCount, 0)
      expect(sum).toBe(KUBEVIRT_DEMO_DATA.vms.length)
    })
  })

  it('tenantCount matches unique tenant namespaces in vms', () => {
    const namespaces = new Set(KUBEVIRT_DEMO_DATA.vms.map(v => v.namespace))
    expect(KUBEVIRT_DEMO_DATA.tenantCount).toBe(namespaces.size)
  })
})
