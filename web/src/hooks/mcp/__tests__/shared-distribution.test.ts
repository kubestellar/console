import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
  isDemoToken: vi.fn().mockReturnValue(false),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterDiscovery: vi.fn(),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn(), isConnected: vi.fn().mockReturnValue(false) },
}))

vi.mock('../../../lib/api', () => ({
  fetchWithAuth: vi.fn(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(),
}))

vi.mock('../../../lib/cache', () => ({
  useCache: vi.fn().mockReturnValue({
    data: [], isLoading: false, isRefreshing: false,
    error: null, isFailed: false, consecutiveFailures: 0,
    lastRefresh: null, refetch: vi.fn(), clearAndRefetch: vi.fn(),
    isDemoFallback: false,
  }),
  REFRESH_RATES: { clusters: 60_000, default: 120_000 },
}))

vi.mock('../clusterCacheRef', () => ({
  clusterCacheRef: { current: new Map() },
  setClusterCacheRefClusters: vi.fn(),
}))

const mod = await import('../shared')
const {
  detectDistributionFromNamespaces,
  detectDistributionFromServer,
  updatesTouchData,
  updatesTouchUI,
} = mod.__testables

// ── detectDistributionFromNamespaces ──

describe('detectDistributionFromNamespaces', () => {
  it('detects OpenShift from openshift- prefix', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'openshift-monitoring', 'default'])).toBe('openshift')
  })

  it('detects OpenShift from bare openshift namespace', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'openshift'])).toBe('openshift')
  })

  it('detects GKE from gke- prefix', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'gke-managed-system'])).toBe('gke')
  })

  it('detects GKE from config-management-system', () => {
    expect(detectDistributionFromNamespaces(['config-management-system', 'kube-system'])).toBe('gke')
  })

  it('detects EKS from aws- prefix', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'aws-observability'])).toBe('eks')
  })

  it('detects EKS from amazon- prefix', () => {
    expect(detectDistributionFromNamespaces(['amazon-vpc-cni', 'kube-system'])).toBe('eks')
  })

  it('detects AKS from azure- prefix', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'azure-extensions'])).toBe('aks')
  })

  it('detects AKS from azure-arc namespace', () => {
    expect(detectDistributionFromNamespaces(['azure-arc', 'kube-system'])).toBe('aks')
  })

  it('detects Rancher from cattle-system', () => {
    expect(detectDistributionFromNamespaces(['cattle-system', 'kube-system'])).toBe('rancher')
  })

  it('detects Rancher from cattle- prefix', () => {
    expect(detectDistributionFromNamespaces(['cattle-fleet-system', 'kube-system'])).toBe('rancher')
  })

  it('returns undefined for vanilla K8s namespaces', () => {
    expect(detectDistributionFromNamespaces(['kube-system', 'default', 'kube-public'])).toBeUndefined()
  })

  it('returns undefined for empty array', () => {
    expect(detectDistributionFromNamespaces([])).toBeUndefined()
  })

  it('prioritizes OpenShift over other distributions', () => {
    expect(detectDistributionFromNamespaces(['openshift-monitoring', 'aws-observability'])).toBe('openshift')
  })
})

// ── detectDistributionFromServer ──

describe('detectDistributionFromServer', () => {
  it('returns undefined for undefined server', () => {
    expect(detectDistributionFromServer(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(detectDistributionFromServer('')).toBeUndefined()
  })

  it('detects OpenShift from openshiftapps.com', () => {
    expect(detectDistributionFromServer('https://api.cluster1.openshiftapps.com:6443')).toBe('openshift')
  })

  it('detects OpenShift from openshift.com', () => {
    expect(detectDistributionFromServer('https://api.cluster.openshift.com:6443')).toBe('openshift')
  })

  it('detects OpenShift from fmaas pattern', () => {
    expect(detectDistributionFromServer('https://api.fmaas-prod.fmaas.res.ibm.com:6443')).toBe('openshift')
  })

  it('detects OpenShift from generic api:6443 pattern', () => {
    expect(detectDistributionFromServer('https://api.mycluster.example.com:6443')).toBe('openshift')
  })

  it('does not detect OpenShift for EKS on port 6443', () => {
    expect(detectDistributionFromServer('https://api.cluster.eks.amazonaws.com:6443')).not.toBe('openshift')
  })

  it('does not detect OpenShift for AKS on port 6443', () => {
    expect(detectDistributionFromServer('https://api.cluster.azmk8s.io:6443')).not.toBe('openshift')
  })

  it('detects EKS from eks.amazonaws.com', () => {
    expect(detectDistributionFromServer('https://ABCDEF.eks.amazonaws.com')).toBe('eks')
  })

  it('detects GKE from container.googleapis.com', () => {
    expect(detectDistributionFromServer('https://34.1.2.3/apis/container.googleapis.com')).toBeUndefined()
    expect(detectDistributionFromServer('https://cluster.container.googleapis.com')).toBe('gke')
  })

  it('detects AKS from azmk8s.io', () => {
    expect(detectDistributionFromServer('https://mycluster.azmk8s.io')).toBe('aks')
  })

  it('detects OCI from oraclecloud.com', () => {
    expect(detectDistributionFromServer('https://cluster.oraclecloud.com')).toBe('oci')
  })

  it('detects DigitalOcean from k8s.ondigitalocean.com', () => {
    expect(detectDistributionFromServer('https://cluster.k8s.ondigitalocean.com')).toBe('digitalocean')
  })

  it('detects DigitalOcean from digitalocean.com', () => {
    expect(detectDistributionFromServer('https://api.digitalocean.com/v2/clusters')).toBe('digitalocean')
  })

  it('returns undefined for localhost', () => {
    expect(detectDistributionFromServer('https://localhost:6443')).toBeUndefined()
  })

  it('returns undefined for plain IP', () => {
    expect(detectDistributionFromServer('https://192.168.1.1:6443')).toBeUndefined()
  })
})

// ── updatesTouchData / updatesTouchUI ──

describe('updatesTouchData', () => {
  it('returns true for clusters field', () => {
    expect(updatesTouchData({ clusters: [] } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for lastUpdated', () => {
    expect(updatesTouchData({ lastUpdated: Date.now() } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for consecutiveFailures', () => {
    expect(updatesTouchData({ consecutiveFailures: 3 } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for isFailed', () => {
    expect(updatesTouchData({ isFailed: true } as Record<string, unknown>)).toBe(true)
  })

  it('returns false for UI-only fields', () => {
    expect(updatesTouchData({ isLoading: true } as Record<string, unknown>)).toBe(false)
  })

  it('returns false for empty updates', () => {
    expect(updatesTouchData({} as Record<string, unknown>)).toBe(false)
  })

  it('returns false for unrelated fields', () => {
    expect(updatesTouchData({ someRandom: 'value' } as Record<string, unknown>)).toBe(false)
  })
})

describe('updatesTouchUI', () => {
  it('returns true for isLoading', () => {
    expect(updatesTouchUI({ isLoading: true } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for isRefreshing', () => {
    expect(updatesTouchUI({ isRefreshing: false } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for error', () => {
    expect(updatesTouchUI({ error: 'timeout' } as Record<string, unknown>)).toBe(true)
  })

  it('returns true for lastRefresh', () => {
    expect(updatesTouchUI({ lastRefresh: Date.now() } as Record<string, unknown>)).toBe(true)
  })

  it('returns false for data-only fields', () => {
    expect(updatesTouchUI({ clusters: [] } as Record<string, unknown>)).toBe(false)
  })

  it('returns false for empty updates', () => {
    expect(updatesTouchUI({} as Record<string, unknown>)).toBe(false)
  })
})

// ── clusterDisplayName ──

describe('clusterDisplayName', () => {
  it('returns base name for simple names', () => {
    expect(mod.clusterDisplayName('my-cluster')).toBe('my-cluster')
  })

  it('strips context prefix', () => {
    expect(mod.clusterDisplayName('ctx/my-cluster')).toBe('my-cluster')
  })

  it('truncates long names with segments', () => {
    const long = 'very-long-cluster-name-that-exceeds-limit'
    const result = mod.clusterDisplayName(long)
    expect(result.length).toBeLessThanOrEqual(25)
  })

  it('truncates long names without enough segments', () => {
    const long = 'a'.repeat(30)
    const result = mod.clusterDisplayName(long)
    expect(result).toBe(long.slice(0, 22) + '…')
  })

  it('handles names exactly at 24 chars', () => {
    const exact = 'a'.repeat(24)
    expect(mod.clusterDisplayName(exact)).toBe(exact)
  })

  it('handles empty string', () => {
    expect(mod.clusterDisplayName('')).toBe('')
  })

  it('handles names with dots', () => {
    const long = 'api.cluster.prod.region.cloud.example.com'
    const result = mod.clusterDisplayName(long)
    expect(result.length).toBeLessThanOrEqual(25)
  })
})

// ── getEffectiveInterval ──

describe('getEffectiveInterval', () => {
  it('returns base interval unchanged', () => {
    expect(mod.getEffectiveInterval(60_000)).toBe(60_000)
  })
})

// ── shouldMarkOffline ──

describe('shouldMarkOffline', () => {
  it('returns false for unknown cluster', () => {
    expect(mod.shouldMarkOffline('nonexistent-cluster')).toBe(false)
  })
})
