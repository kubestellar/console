/**
 * Unit tests for sharedImpl.persistence.ts
 *
 * Covers:
 * - looksLikePersistedDemoClusterCache: all-demo, mixed, live-only, empty
 * - getLiveClustersForFallback: returns empty for demo cache, filters live-only
 * - loadDistributionCache / saveDistributionCache: localStorage round-trip
 * - applyDistributionCache: uses cached, new, URL-detected, and identity paths
 * - updateDistributionCache: only writes on change
 * - saveClusterCacheToStorage: filters slash-names, serializes fields
 * - loadClusterCacheFromStorage: happy path, empty, bad JSON, demo eviction
 * - mergeWithStoredClusters: prefer new value; fall back to cached for undefined
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockIsDemoMode = false

vi.mock('../../../lib/demoMode', () => ({
  get isDemoMode() { return () => mockIsDemoMode },
  isDemoMode: () => mockIsDemoMode,
}))

vi.mock('../clusterUtils', () => ({
  detectDistributionFromServer: (server?: string) => {
    if (server?.includes('openshift')) return 'OpenShift'
    return undefined
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

type ClusterStub = {
  name: string
  context: string
  server?: string
  isDemo?: boolean
  distribution?: string
  namespaces?: string[]
  healthy?: boolean
  nodeCount?: number
  podCount?: number
  cpuCores?: number
  memoryGB?: number
  storageGB?: number
}

function makeCluster(overrides: Partial<ClusterStub> = {}): ClusterStub {
  return {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://example.com:6443',
    ...overrides,
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockIsDemoMode = false
  localStorage.clear()
  vi.resetModules()
})

// ── looksLikePersistedDemoClusterCache ─────────────────────────────────────

describe('looksLikePersistedDemoClusterCache', () => {
  it('returns false for empty array', async () => {
    const { looksLikePersistedDemoClusterCache } = await import('../sharedImpl.persistence')
    expect(looksLikePersistedDemoClusterCache([])).toBe(false)
  })

  it('returns true when all clusters are demo-flagged', async () => {
    const { looksLikePersistedDemoClusterCache } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'kind-local', isDemo: true }),
      makeCluster({ name: 'minikube', isDemo: true }),
    ]
    expect(looksLikePersistedDemoClusterCache(clusters as never)).toBe(true)
  })

  it('returns true when distinctive demo name present and all are known demo names', async () => {
    const { looksLikePersistedDemoClusterCache } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'eks-prod-us-east-1' }),
      makeCluster({ name: 'gke-staging' }),
      makeCluster({ name: 'kind-local' }),
    ]
    expect(looksLikePersistedDemoClusterCache(clusters as never)).toBe(true)
  })

  it('returns false when live cluster mixed with demo name', async () => {
    const { looksLikePersistedDemoClusterCache } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'eks-prod-us-east-1' }),
      makeCluster({ name: 'my-real-cluster' }),
    ]
    // 'my-real-cluster' is not in KNOWN_DEMO_CLUSTER_NAMES so every() fails
    expect(looksLikePersistedDemoClusterCache(clusters as never)).toBe(false)
  })

  it('returns false for fully live clusters with no demo markers', async () => {
    const { looksLikePersistedDemoClusterCache } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'prod-cluster-1' }),
      makeCluster({ name: 'staging-cluster-2' }),
    ]
    expect(looksLikePersistedDemoClusterCache(clusters as never)).toBe(false)
  })
})

// ── getLiveClustersForFallback ─────────────────────────────────────────────

describe('getLiveClustersForFallback', () => {
  it('returns empty array when cache looks like demo data', async () => {
    const { getLiveClustersForFallback } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'eks-prod-us-east-1' }),
      makeCluster({ name: 'gke-staging' }),
    ]
    expect(getLiveClustersForFallback(clusters as never)).toEqual([])
  })

  it('filters out demo clusters when cache has live clusters', async () => {
    const { getLiveClustersForFallback } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'prod-cluster', isDemo: false }),
      makeCluster({ name: 'demo-node', isDemo: true }),
    ]
    const result = getLiveClustersForFallback(clusters as never)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-cluster')
  })

  it('returns all clusters when none are demo', async () => {
    const { getLiveClustersForFallback } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'cluster-a' }),
      makeCluster({ name: 'cluster-b' }),
    ]
    const result = getLiveClustersForFallback(clusters as never)
    expect(result).toHaveLength(2)
  })
})

// ── loadDistributionCache / saveDistributionCache ──────────────────────────

describe('distribution cache localStorage round-trip', () => {
  it('returns empty object when storage is empty', async () => {
    const { loadDistributionCache } = await import('../sharedImpl.persistence')
    expect(loadDistributionCache()).toEqual({})
  })

  it('round-trips distribution data correctly', async () => {
    const { loadDistributionCache, saveDistributionCache } = await import('../sharedImpl.persistence')
    const cache = { 'cluster-a': { distribution: 'OpenShift' } }
    saveDistributionCache(cache)
    expect(loadDistributionCache()).toEqual(cache)
  })

  it('returns empty object on invalid JSON', async () => {
    const { loadDistributionCache, CLUSTER_DIST_CACHE_KEY } = await import('../sharedImpl.persistence')
    localStorage.setItem(CLUSTER_DIST_CACHE_KEY, 'not-valid-json{{{')
    expect(loadDistributionCache()).toEqual({})
  })
})

// ── applyDistributionCache ─────────────────────────────────────────────────

describe('applyDistributionCache', () => {
  it('preserves existing distribution on cluster', async () => {
    const { applyDistributionCache } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'c1', distribution: 'Kubernetes' })]
    const result = applyDistributionCache(clusters as never)
    expect(result[0].distribution).toBe('Kubernetes')
  })

  it('applies cached distribution when cluster has none', async () => {
    const { applyDistributionCache, saveDistributionCache } = await import('../sharedImpl.persistence')
    saveDistributionCache({ 'c1': { distribution: 'OpenShift', namespaces: ['default'] } })
    const clusters = [makeCluster({ name: 'c1' })]
    const result = applyDistributionCache(clusters as never)
    expect(result[0].distribution).toBe('OpenShift')
    expect(result[0].namespaces).toEqual(['default'])
  })

  it('detects distribution from server URL when no cache', async () => {
    const { applyDistributionCache } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'c2', server: 'https://api.openshift.example.com:6443' })]
    const result = applyDistributionCache(clusters as never)
    expect(result[0].distribution).toBe('OpenShift')
  })

  it('returns cluster unchanged when no distribution sources available', async () => {
    const { applyDistributionCache } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'c3', server: 'https://plain-k8s.example.com' })]
    const result = applyDistributionCache(clusters as never)
    expect(result[0].distribution).toBeUndefined()
  })
})

// ── updateDistributionCache ────────────────────────────────────────────────

describe('updateDistributionCache', () => {
  it('writes new distribution to storage', async () => {
    const { updateDistributionCache, loadDistributionCache } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'c1', distribution: 'Kubernetes' })]
    updateDistributionCache(clusters as never)
    const cache = loadDistributionCache()
    expect(cache['c1'].distribution).toBe('Kubernetes')
  })

  it('does not write when distribution already matches', async () => {
    const { updateDistributionCache, saveDistributionCache, CLUSTER_DIST_CACHE_KEY } = await import('../sharedImpl.persistence')
    saveDistributionCache({ 'c1': { distribution: 'OpenShift' } })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const clusters = [makeCluster({ name: 'c1', distribution: 'OpenShift' })]
    updateDistributionCache(clusters as never)
    // setItem should NOT be called again since nothing changed
    expect(setItemSpy).not.toHaveBeenCalledWith(CLUSTER_DIST_CACHE_KEY, expect.any(String))
  })

  it('skips clusters without distribution', async () => {
    const { updateDistributionCache, loadDistributionCache } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'c1' })]
    updateDistributionCache(clusters as never)
    expect(loadDistributionCache()).toEqual({})
  })
})

// ── saveClusterCacheToStorage ──────────────────────────────────────────────

describe('saveClusterCacheToStorage', () => {
  it('stores clusters to localStorage', async () => {
    const { saveClusterCacheToStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    const clusters = [makeCluster({ name: 'prod-cluster', healthy: true, nodeCount: 3 })]
    saveClusterCacheToStorage(clusters as never)
    const stored = JSON.parse(localStorage.getItem(CLUSTER_CACHE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('prod-cluster')
    expect(stored[0].nodeCount).toBe(3)
  })

  it('filters out clusters whose name contains a slash', async () => {
    const { saveClusterCacheToStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: 'valid-cluster' }),
      makeCluster({ name: 'default/api-server:6443/kube:admin' }),
    ]
    saveClusterCacheToStorage(clusters as never)
    const stored = JSON.parse(localStorage.getItem(CLUSTER_CACHE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('valid-cluster')
  })

  it('filters out clusters without a name', async () => {
    const { saveClusterCacheToStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    const clusters = [
      makeCluster({ name: '' }),
      makeCluster({ name: 'good' }),
    ]
    saveClusterCacheToStorage(clusters as never)
    const stored = JSON.parse(localStorage.getItem(CLUSTER_CACHE_KEY)!)
    expect(stored).toHaveLength(1)
  })
})

// ── loadClusterCacheFromStorage ────────────────────────────────────────────

describe('loadClusterCacheFromStorage', () => {
  it('returns empty array when storage is empty', async () => {
    const { loadClusterCacheFromStorage } = await import('../sharedImpl.persistence')
    expect(loadClusterCacheFromStorage()).toEqual([])
  })

  it('returns clusters from storage', async () => {
    const { loadClusterCacheFromStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    const clusters = [{ name: 'prod-cluster', context: 'prod', server: 'https://prod.example.com' }]
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(clusters))
    const result = loadClusterCacheFromStorage()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-cluster')
  })

  it('returns empty array on invalid JSON', async () => {
    const { loadClusterCacheFromStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    localStorage.setItem(CLUSTER_CACHE_KEY, 'bad{json')
    expect(loadClusterCacheFromStorage()).toEqual([])
  })

  it('evicts demo cache when not in demo mode', async () => {
    mockIsDemoMode = false
    const { loadClusterCacheFromStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    // Store clusters that look like demo data
    const demoClusters = [
      { name: 'eks-prod-us-east-1', context: 'eks', server: 'https://eks.example.com' },
      { name: 'gke-staging', context: 'gke', server: 'https://gke.example.com' },
    ]
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(demoClusters))
    const result = loadClusterCacheFromStorage()
    expect(result).toEqual([])
    expect(localStorage.getItem(CLUSTER_CACHE_KEY)).toBeNull()
  })

  it('preserves demo cache when in demo mode', async () => {
    mockIsDemoMode = true
    const { loadClusterCacheFromStorage, CLUSTER_CACHE_KEY } = await import('../sharedImpl.persistence')
    const demoClusters = [
      { name: 'eks-prod-us-east-1', context: 'eks', server: 'https://eks.example.com' },
    ]
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(demoClusters))
    const result = loadClusterCacheFromStorage()
    expect(result).toHaveLength(1)
  })
})

// ── mergeWithStoredClusters ────────────────────────────────────────────────

describe('mergeWithStoredClusters', () => {
  it('returns new clusters unchanged when no stored data', async () => {
    const { mergeWithStoredClusters } = await import('../sharedImpl.persistence')
    const newClusters = [makeCluster({ name: 'c1', nodeCount: 5 })]
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].nodeCount).toBe(5)
  })

  it('preserves cached metric when new value is undefined', async () => {
    const { mergeWithStoredClusters, saveClusterCacheToStorage } = await import('../sharedImpl.persistence')
    const stored = [makeCluster({ name: 'c1', nodeCount: 7, cpuCores: 16, memoryGB: 64 })]
    saveClusterCacheToStorage(stored as never)
    const newClusters = [makeCluster({ name: 'c1' })] // no metrics
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].nodeCount).toBe(7)
    expect(result[0].cpuCores).toBe(16)
    expect(result[0].memoryGB).toBe(64)
  })

  it('uses new value even when zero (not treated as missing)', async () => {
    const { mergeWithStoredClusters, saveClusterCacheToStorage } = await import('../sharedImpl.persistence')
    const stored = [makeCluster({ name: 'c1', nodeCount: 5 })]
    saveClusterCacheToStorage(stored as never)
    const newClusters = [makeCluster({ name: 'c1', nodeCount: 0 })]
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].nodeCount).toBe(0)
  })

  it('returns new cluster as-is when name not found in stored', async () => {
    const { mergeWithStoredClusters, saveClusterCacheToStorage } = await import('../sharedImpl.persistence')
    const stored = [makeCluster({ name: 'other', nodeCount: 3 })]
    saveClusterCacheToStorage(stored as never)
    const newClusters = [makeCluster({ name: 'new-cluster', nodeCount: 2 })]
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].nodeCount).toBe(2)
  })

  it('prefers new distribution when provided', async () => {
    const { mergeWithStoredClusters, saveClusterCacheToStorage } = await import('../sharedImpl.persistence')
    const stored = [makeCluster({ name: 'c1', distribution: 'OpenShift' })]
    saveClusterCacheToStorage(stored as never)
    const newClusters = [makeCluster({ name: 'c1', distribution: 'Kubernetes' })]
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].distribution).toBe('Kubernetes')
  })

  it('falls back to cached distribution when new one is absent', async () => {
    const { mergeWithStoredClusters, saveClusterCacheToStorage } = await import('../sharedImpl.persistence')
    const stored = [makeCluster({ name: 'c1', distribution: 'OpenShift' })]
    saveClusterCacheToStorage(stored as never)
    const newClusters = [makeCluster({ name: 'c1' })]
    const result = mergeWithStoredClusters(newClusters as never)
    expect(result[0].distribution).toBe('OpenShift')
  })
})
