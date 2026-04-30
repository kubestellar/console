import { describe, it, expect } from 'vitest'
import {
  KARMADA_DEMO_DATA,
  type KarmadaHealth,
  type KarmadaClusterStatus,
  type KarmadaBindingStatus,
} from '../karmada_status/demoData'

describe('KARMADA_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KARMADA_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: KarmadaHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(KARMADA_DEMO_DATA.health)
  })

  it('has memberClusters array with entries', () => {
    expect(Array.isArray(KARMADA_DEMO_DATA.memberClusters)).toBe(true)
    expect(KARMADA_DEMO_DATA.memberClusters.length).toBeGreaterThan(0)
  })

  it('each member cluster has required fields', () => {
    const validStatus: KarmadaClusterStatus[] = ['Ready', 'NotReady', 'Unknown']
    for (const cluster of KARMADA_DEMO_DATA.memberClusters) {
      expect(typeof cluster.name).toBe('string')
      expect(validStatus).toContain(cluster.status)
      expect(typeof cluster.nodeCount).toBe('number')
      expect(typeof cluster.kubernetesVersion).toBe('string')
    }
  })

  it('has propagationPolicies array', () => {
    expect(Array.isArray(KARMADA_DEMO_DATA.propagationPolicies)).toBe(true)
  })

  it('each propagation policy has required fields', () => {
    for (const policy of KARMADA_DEMO_DATA.propagationPolicies) {
      expect(typeof policy.name).toBe('string')
      expect(typeof policy.namespace).toBe('string')
    }
  })

  it('has controllerPods with ready/total counts', () => {
    expect(typeof KARMADA_DEMO_DATA.controllerPods.ready).toBe('number')
    expect(typeof KARMADA_DEMO_DATA.controllerPods.total).toBe('number')
    expect(KARMADA_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(KARMADA_DEMO_DATA.controllerPods.total)
  })

  it('has clusterPoliciesCount and overridePoliciesCount', () => {
    expect(typeof KARMADA_DEMO_DATA.clusterPoliciesCount).toBe('number')
    expect(typeof KARMADA_DEMO_DATA.overridePoliciesCount).toBe('number')
  })

  it('has resourceBindings array', () => {
    expect(Array.isArray(KARMADA_DEMO_DATA.resourceBindings)).toBe(true)
  })
})
