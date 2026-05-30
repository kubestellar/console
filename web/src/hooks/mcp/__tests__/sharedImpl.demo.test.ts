import { describe, expect, it } from 'vitest'

import { getDemoClusters } from '../sharedImpl.demo'

describe('getDemoClusters', () => {
  it('returns demo clusters with stable metadata for every provider sample', () => {
    const clusters = getDemoClusters()

    expect(clusters.length).toBeGreaterThan(10)
    expect(new Set(clusters.map(cluster => cluster.name)).size).toBe(clusters.length)
    expect(new Set(clusters.map(cluster => cluster.distribution))).toEqual(new Set([
      'kind',
      'minikube',
      'k3s',
      'eks',
      'gke',
      'aks',
      'openshift',
      'oci',
      'alibaba',
      'digitalocean',
      'rancher',
      'kubernetes',
    ]))
  })

  it('marks every demo cluster as kubeconfig-backed demo data with capacity fields', () => {
    const clusters = getDemoClusters()

    clusters.forEach(cluster => {
      expect(cluster.isDemo).toBe(true)
      expect(cluster.source).toBe('kubeconfig')
      expect(cluster.nodeCount).toBeGreaterThan(0)
      expect(cluster.podCount).toBeGreaterThan(0)
      expect(cluster.cpuCores).toBeGreaterThan(0)
      expect(cluster.memoryGB).toBeGreaterThan(0)
      expect(cluster.storageGB).toBeGreaterThan(0)
    })
  })

  it('includes platform-specific fields for representative clusters', () => {
    const clusters = getDemoClusters()

    const openshift = clusters.find(cluster => cluster.distribution === 'openshift')
    expect(openshift?.namespaces).toEqual(['openshift-operators', 'openshift-monitoring'])

    const managedClusterNames = clusters
      .filter(cluster => typeof cluster.server === 'string' && cluster.server.length > 0)
      .map(cluster => cluster.name)

    expect(managedClusterNames).toContain('eks-prod-us-east-1')
    expect(managedClusterNames).toContain('aks-dev-westeu')
    expect(managedClusterNames).toContain('oci-oke-phoenix')
  })
})
