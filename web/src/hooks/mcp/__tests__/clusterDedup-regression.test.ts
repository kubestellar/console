/**
 * Regression test: Cluster deduplication (#8502)
 *
 * Verifies that when two kubeconfig contexts point to the same physical cluster
 * (same server URL), deduplication produces exactly one entry with the alias
 * tracked. This is the end-to-end dedup pipeline: shareMetrics → deduplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClusterInfo } from '../types'

// ---------------------------------------------------------------------------
// Hoisted mocks (same set as shared.test.ts)
// ---------------------------------------------------------------------------
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockIsDemoToken = vi.hoisted(() => vi.fn(() => false))
const mockIsNetlifyDeployment = vi.hoisted(() => ({ value: false }))
const mockSubscribeDemoMode = vi.hoisted(() => vi.fn())
const mockIsBackendUnavailable = vi.hoisted(() => vi.fn(() => false))
const mockReportAgentDataError = vi.hoisted(() => vi.fn())
const mockReportAgentDataSuccess = vi.hoisted(() => vi.fn())
const mockIsAgentUnavailable = vi.hoisted(() => vi.fn(() => true))
const mockRegisterCacheReset = vi.hoisted(() => vi.fn())
const mockTriggerAllRefetches = vi.hoisted(() => vi.fn())
const mockResetFailuresForCluster = vi.hoisted(() => vi.fn())
const mockResetAllCacheFailures = vi.hoisted(() => vi.fn())
const mockKubectlProxyExec = vi.hoisted(() => vi.fn())
const mockApiGet = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/api', () => ({
  api: { get: mockApiGet },
  isBackendUnavailable: mockIsBackendUnavailable,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
  isDemoToken: mockIsDemoToken,
  get isNetlifyDeployment() { return mockIsNetlifyDeployment.value },
  subscribeDemoMode: mockSubscribeDemoMode,
}))

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataError: mockReportAgentDataError,
  reportAgentDataSuccess: mockReportAgentDataSuccess,
  isAgentUnavailable: mockIsAgentUnavailable,
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: mockRegisterCacheReset,
  triggerAllRefetches: mockTriggerAllRefetches,
}))

vi.mock('../../../lib/cache', () => ({
  resetFailuresForCluster: mockResetFailuresForCluster,
  resetAllCacheFailures: mockResetAllCacheFailures,
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: mockKubectlProxyExec },
}))

vi.mock('../../../lib/constants', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants')>('../../../lib/constants')
  return { ...actual }
})

vi.mock('../../../lib/constants/network', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants/network')>('../../../lib/constants/network')
  return { ...actual }
})

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import {
  deduplicateClustersByServer,
  shareMetricsBetweenSameServerClusters,
} from '../shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ClusterInfo with sensible defaults. */
function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com:6443',
    healthy: true,
    source: 'kubeconfig',
    nodeCount: 3,
    podCount: 20,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Regression: two kubeconfig contexts → same physical cluster (#8502)
// ---------------------------------------------------------------------------

describe('Cluster deduplication regression (#8502)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('two contexts with identical server URL produce exactly one deduplicated entry', () => {
    const SHARED_SERVER = 'https://api.prod.example.com:6443'

    const contextA = makeCluster({
      name: 'prod-admin',
      context: 'prod-admin',
      server: SHARED_SERVER,
      cpuCores: 16,
      memoryGB: 64,
      nodeCount: 5,
      podCount: 80,
    })

    const contextB = makeCluster({
      name: 'prod-developer',
      context: 'prod-developer',
      server: SHARED_SERVER,
      cpuCores: undefined,
      memoryGB: undefined,
      nodeCount: undefined,
      podCount: undefined,
    })

    // Run the full pipeline: share metrics, then deduplicate
    const withSharedMetrics = shareMetricsBetweenSameServerClusters([contextA, contextB])
    const deduplicated = deduplicateClustersByServer(withSharedMetrics)

    // Only one entry should remain
    expect(deduplicated).toHaveLength(1)

    const result = deduplicated[0]

    // The shorter/friendlier name should be primary
    expect(result.name).toBe('prod-admin')

    // The other context should appear as an alias
    expect(result.aliases).toContain('prod-developer')

    // Metrics should come from the context that had them
    expect(result.cpuCores).toBe(16)
    expect(result.memoryGB).toBe(64)
    expect(result.nodeCount).toBe(5)
    expect(result.podCount).toBe(80)
  })

  it('three contexts pointing to the same server produce one entry with two aliases', () => {
    const SHARED_SERVER = 'https://api.staging.example.com:6443'

    const clusters = [
      makeCluster({ name: 'staging', context: 'staging', server: SHARED_SERVER, cpuCores: 8 }),
      makeCluster({ name: 'staging-readonly', context: 'staging-readonly', server: SHARED_SERVER, cpuCores: undefined }),
      makeCluster({ name: 'staging-ci', context: 'staging-ci', server: SHARED_SERVER, cpuCores: undefined }),
    ]

    const deduplicated = deduplicateClustersByServer(
      shareMetricsBetweenSameServerClusters(clusters)
    )

    expect(deduplicated).toHaveLength(1)
    const EXPECTED_ALIAS_COUNT = 2
    expect(deduplicated[0].aliases).toHaveLength(EXPECTED_ALIAS_COUNT)
    expect(deduplicated[0].name).toBe('staging')
  })

  it('contexts pointing to different servers remain separate', () => {
    const clusterA = makeCluster({ name: 'prod', server: 'https://api.prod.example.com:6443' })
    const clusterB = makeCluster({ name: 'staging', server: 'https://api.staging.example.com:6443' })

    const deduplicated = deduplicateClustersByServer(
      shareMetricsBetweenSameServerClusters([clusterA, clusterB])
    )

    expect(deduplicated).toHaveLength(2)
    expect(deduplicated[0].aliases).toEqual([])
    expect(deduplicated[1].aliases).toEqual([])
  })

  it('mixed scenario: two pairs of duplicates plus one unique cluster', () => {
    const SERVER_A = 'https://api.prod.example.com:6443'
    const SERVER_B = 'https://api.dev.example.com:6443'
    const SERVER_C = 'https://api.test.example.com:6443'

    const clusters = [
      makeCluster({ name: 'prod', server: SERVER_A }),
      makeCluster({ name: 'prod-alt', server: SERVER_A }),
      makeCluster({ name: 'dev', server: SERVER_B }),
      makeCluster({ name: 'dev-alt', server: SERVER_B }),
      makeCluster({ name: 'test', server: SERVER_C }),
    ]

    const deduplicated = deduplicateClustersByServer(
      shareMetricsBetweenSameServerClusters(clusters)
    )

    const EXPECTED_UNIQUE_CLUSTERS = 3
    expect(deduplicated).toHaveLength(EXPECTED_UNIQUE_CLUSTERS)

    const names = deduplicated.map(c => c.name).sort()
    expect(names).toEqual(['dev', 'prod', 'test'])
  })

  it('prefers user-friendly name over OpenShift auto-generated context', () => {
    const SHARED_SERVER = 'https://api.pok-prod.openshiftapps.com:6443'

    const friendlyCtx = makeCluster({
      name: 'pok-prod',
      context: 'pok-prod',
      server: SHARED_SERVER,
      cpuCores: undefined,
      memoryGB: undefined,
      storageGB: undefined,
      nodeCount: undefined,
      podCount: undefined,
    })

    const autoCtx = makeCluster({
      name: 'default/api-pokprod001.openshiftapps.com:6443/kube:admin',
      context: 'default/api-pokprod001.openshiftapps.com:6443/kube:admin',
      server: SHARED_SERVER,
      cpuCores: 96,
      memoryGB: 384,
    })

    const deduplicated = deduplicateClustersByServer(
      shareMetricsBetweenSameServerClusters([friendlyCtx, autoCtx])
    )

    expect(deduplicated).toHaveLength(1)
    // Friendly name wins even though auto-generated has metrics
    expect(deduplicated[0].name).toBe('pok-prod')
    // Metrics are merged from the auto-generated context
    expect(deduplicated[0].cpuCores).toBe(96)
    expect(deduplicated[0].memoryGB).toBe(384)
  })

  it('health is true if ANY duplicate context reports healthy', () => {
    const SHARED_SERVER = 'https://api.cluster.example.com:6443'

    const unhealthy = makeCluster({
      name: 'ctx-a',
      server: SHARED_SERVER,
      healthy: false,
      reachable: false,
    })
    const healthy = makeCluster({
      name: 'ctx-b',
      server: SHARED_SERVER,
      healthy: true,
      reachable: true,
    })

    const deduplicated = deduplicateClustersByServer([unhealthy, healthy])

    expect(deduplicated).toHaveLength(1)
    expect(deduplicated[0].healthy).toBe(true)
    expect(deduplicated[0].reachable).toBe(true)
  })
})
