import { describe, it, expect } from 'vitest'
import {
  ORBIT_CLUSTER_SCOPED_KINDS,
  ORBIT_NAMESPACED_KINDS,
  DEFAULT_MONITOR_KINDS,
} from '../k8sResources'

describe('ORBIT_CLUSTER_SCOPED_KINDS', () => {
  it('contains only cluster-scoped entries', () => {
    for (const kind of ORBIT_CLUSTER_SCOPED_KINDS) {
      expect(kind.clusterScoped).toBe(true)
    }
  })

  it('includes expected kinds', () => {
    const kinds = ORBIT_CLUSTER_SCOPED_KINDS.map((k) => k.kind)
    expect(kinds).toContain('Node')
    expect(kinds).toContain('Namespace')
    expect(kinds).toContain('ClusterRole')
    expect(kinds).toContain('CustomResourceDefinition')
  })

  it('has valid group assignments', () => {
    const validGroups = new Set(['Infrastructure', 'Storage', 'RBAC', 'Extensions'])
    for (const kind of ORBIT_CLUSTER_SCOPED_KINDS) {
      expect(validGroups.has(kind.group)).toBe(true)
    }
  })

  it('every entry has a non-empty label', () => {
    for (const kind of ORBIT_CLUSTER_SCOPED_KINDS) {
      expect(kind.label.length).toBeGreaterThan(0)
    }
  })
})

describe('ORBIT_NAMESPACED_KINDS', () => {
  it('contains only namespaced entries', () => {
    for (const kind of ORBIT_NAMESPACED_KINDS) {
      expect(kind.clusterScoped).toBe(false)
    }
  })

  it('includes core workload kinds', () => {
    const kinds = ORBIT_NAMESPACED_KINDS.map((k) => k.kind)
    expect(kinds).toContain('Deployment')
    expect(kinds).toContain('Pod')
    expect(kinds).toContain('Service')
    expect(kinds).toContain('ConfigMap')
  })

  it('has unique kind names', () => {
    const kinds = ORBIT_NAMESPACED_KINDS.map((k) => k.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})

describe('DEFAULT_MONITOR_KINDS', () => {
  it('all defaults are namespaced (not cluster-scoped)', () => {
    for (const kind of DEFAULT_MONITOR_KINDS) {
      expect(kind.clusterScoped).toBe(false)
    }
  })

  it('defaults start with empty namespaces', () => {
    for (const kind of DEFAULT_MONITOR_KINDS) {
      expect(kind.namespaces).toEqual([])
    }
  })

  it('includes Deployment and Pod', () => {
    const kinds = DEFAULT_MONITOR_KINDS.map((k) => k.kind)
    expect(kinds).toContain('Deployment')
    expect(kinds).toContain('Pod')
  })
})
