import { describe, it, expect } from 'vitest'
import { OVN_DEMO_DATA, type OvnStatusDemoData } from '../multi-tenancy/ovn-status/demoData'

describe('OVN_DEMO_DATA', () => {
  it('is defined', () => {
    expect(OVN_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(OVN_DEMO_DATA.health)
  })

  it('detected is a boolean', () => {
    expect(typeof OVN_DEMO_DATA.detected).toBe('boolean')
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(OVN_DEMO_DATA.lastCheckTime).getTime()).toBeGreaterThan(0)
  })

  describe('pod counts', () => {
    it('healthyPods + unhealthyPods equals podCount', () => {
      expect(OVN_DEMO_DATA.healthyPods + OVN_DEMO_DATA.unhealthyPods).toBe(OVN_DEMO_DATA.podCount)
    })

    it('all counts are non-negative', () => {
      expect(OVN_DEMO_DATA.podCount).toBeGreaterThanOrEqual(0)
      expect(OVN_DEMO_DATA.healthyPods).toBeGreaterThanOrEqual(0)
      expect(OVN_DEMO_DATA.unhealthyPods).toBeGreaterThanOrEqual(0)
    })
  })

  describe('udns', () => {
    it('is an array', () => {
      expect(Array.isArray(OVN_DEMO_DATA.udns)).toBe(true)
    })

    it('each UDN has required fields', () => {
      const validNetworkTypes = ['layer2', 'layer3', 'localnet']
      const validRoles = ['primary', 'secondary']
      for (const udn of OVN_DEMO_DATA.udns) {
        expect(typeof udn.name).toBe('string')
        expect(udn.name.length).toBeGreaterThan(0)
        expect(validNetworkTypes).toContain(udn.networkType)
        expect(validRoles).toContain(udn.role)
      }
    })

    it('covers both primary and secondary roles', () => {
      const roles = new Set(OVN_DEMO_DATA.udns.map(u => u.role))
      expect(roles.has('primary')).toBe(true)
      expect(roles.has('secondary')).toBe(true)
    })
  })
})
