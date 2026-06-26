import { describe, expect, it } from 'vitest'

import { getDemoClusters } from '../sharedImpl.demo'

const DEMO_CLUSTER_COUNT = 12

describe('getDemoClusters', () => {
  it('returns a stable provider matrix for demo mode', () => {
    const clusters = getDemoClusters()

    expect(clusters).toHaveLength(DEMO_CLUSTER_COUNT)
    expect(clusters.every(cluster => cluster.isDemo)).toBe(true)
    expect(
      clusters.map(({ name, distribution, healthy }) => ({ name, distribution, healthy })),
    ).toMatchInlineSnapshot(`
      [
        {
          "distribution": "kind",
          "healthy": true,
          "name": "kind-local",
        },
        {
          "distribution": "minikube",
          "healthy": true,
          "name": "minikube",
        },
        {
          "distribution": "k3s",
          "healthy": true,
          "name": "k3s-edge",
        },
        {
          "distribution": "eks",
          "healthy": true,
          "name": "eks-prod-us-east-1",
        },
        {
          "distribution": "gke",
          "healthy": true,
          "name": "gke-staging",
        },
        {
          "distribution": "aks",
          "healthy": true,
          "name": "aks-dev-westeu",
        },
        {
          "distribution": "openshift",
          "healthy": true,
          "name": "openshift-prod",
        },
        {
          "distribution": "oci",
          "healthy": true,
          "name": "oci-oke-phoenix",
        },
        {
          "distribution": "alibaba",
          "healthy": false,
          "name": "alibaba-ack-shanghai",
        },
        {
          "distribution": "digitalocean",
          "healthy": true,
          "name": "do-nyc1-prod",
        },
        {
          "distribution": "rancher",
          "healthy": true,
          "name": "rancher-mgmt",
        },
        {
          "distribution": "kubernetes",
          "healthy": true,
          "name": "vllm-gpu-cluster",
        },
      ]
    `)
  })

  it('preserves provider-specific metadata used by cluster UIs', () => {
    const clusters = getDemoClusters()

    expect(clusters.filter(cluster => cluster.healthy === false).map(cluster => cluster.name)).toEqual([
      'alibaba-ack-shanghai',
    ])
    expect(clusters.find(cluster => cluster.distribution === 'openshift')?.namespaces).toEqual([
      'openshift-operators',
      'openshift-monitoring',
    ])
    expect(clusters.find(cluster => cluster.distribution === 'eks')?.server).toContain('eks.amazonaws.com')
    expect(clusters.find(cluster => cluster.distribution === 'aks')?.server).toContain('azmk8s.io')
  })
})
