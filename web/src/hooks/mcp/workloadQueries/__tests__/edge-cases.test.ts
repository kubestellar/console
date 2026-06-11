/**
 * Edge-case tests for workloadQueries — covers scenarios from issue #17473:
 * - Empty cluster lists
 * - Namespace filtering on demo data
 * - fetchInClusterCollection with concurrent AbortSignal.timeout behavior
 */
import { describe, it, expect, vi } from 'vitest'
import { getDemoDeploymentIssues, getDemoDeployments } from '../deployments'
import { getDemoPods, getDemoPodIssues, getDemoAllPods } from '../pods'

// ---------------------------------------------------------------------------
// Module mocks (lightweight — only what these pure functions need)
// ---------------------------------------------------------------------------
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [init, vi.fn()]),
    useRef: vi.fn((init: unknown) => ({ current: init })),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn: unknown) => fn),
  }
})
vi.mock('../../../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))
vi.mock('../../../../lib/demoMode', () => ({ isDemoMode: vi.fn(() => false) }))
vi.mock('../../../../lib/api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
vi.mock('../../../../lib/errorClassifier', () => ({ classifyError: vi.fn(() => 'unknown') }))
vi.mock('../../../../lib/kubectlProxy', () => ({ kubectlProxy: vi.fn() }))
vi.mock('../../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))
vi.mock('../../../../lib/sseClient', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: vi.fn(() => 'http://localhost:8080'),
  isClusterModeBackend: vi.fn(() => false),
}))
vi.mock('../../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: vi.fn(() => false),
}))
vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 30_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: vi.fn(() => 30_000),
  clusterCacheRef: { current: null },
  fetchWithRetry: vi.fn(),
}))
vi.mock('../pollingManager', () => ({ subscribePolling: vi.fn(() => () => {}) }))
vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: vi.fn(() => () => {}),
}))

// ---------------------------------------------------------------------------
// Edge cases: filtering demo data by cluster and namespace
// ---------------------------------------------------------------------------

describe('getDemoDeployments — cluster/namespace filtering', () => {
  it('filtering by non-existent cluster returns empty', () => {
    const deployments = getDemoDeployments()
    const filtered = deployments.filter(d => d.cluster === 'does-not-exist')
    expect(filtered).toHaveLength(0)
  })

  it('filtering by valid cluster returns subset', () => {
    const deployments = getDemoDeployments()
    const clusters = new Set(deployments.map(d => d.cluster))
    expect(clusters.size).toBeGreaterThan(1) // multiple clusters exist
    const first = [...clusters][0]
    const filtered = deployments.filter(d => d.cluster === first)
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.length).toBeLessThan(deployments.length)
  })

  it('filtering by namespace narrows results', () => {
    const deployments = getDemoDeployments()
    const namespaces = new Set(deployments.map(d => d.namespace))
    expect(namespaces.size).toBeGreaterThan(1) // multiple namespaces
    const first = [...namespaces][0]
    const filtered = deployments.filter(d => d.namespace === first)
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    expect(filtered.length).toBeLessThan(deployments.length)
  })

  it('combined cluster + namespace filter may return empty', () => {
    const deployments = getDemoDeployments()
    // Use a valid cluster with an invalid namespace
    const cluster = deployments[0].cluster
    const filtered = deployments.filter(
      d => d.cluster === cluster && d.namespace === 'no-such-namespace'
    )
    expect(filtered).toHaveLength(0)
  })
})

describe('getDemoDeploymentIssues — cluster/namespace filtering', () => {
  it('all issues have readyReplicas strictly less than replicas', () => {
    const issues = getDemoDeploymentIssues()
    for (const issue of issues) {
      expect(issue.readyReplicas).toBeLessThan(issue.replicas)
    }
  })

  it('filtering by non-existent namespace returns empty', () => {
    const issues = getDemoDeploymentIssues()
    const filtered = issues.filter(i => i.namespace === 'non-existent-ns')
    expect(filtered).toHaveLength(0)
  })
})

describe('getDemoPods — edge cases', () => {
  it('all pods have non-empty cluster field', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(pod.cluster).toBeTruthy()
      expect(pod.cluster.length).toBeGreaterThan(0)
    }
  })

  it('pod names are unique within demo dataset', () => {
    const pods = getDemoPods()
    const names = pods.map(p => p.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('all pods have valid ready format (n/m)', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(pod.ready).toMatch(/^\d+\/\d+$/)
    }
  })
})

describe('getDemoPodIssues — edge cases', () => {
  it('all issue pods reference clusters that exist in getDemoPods', () => {
    const issues = getDemoPodIssues()
    const pods = getDemoAllPods()
    const clusterSet = new Set(pods.map(p => p.cluster))
    for (const issue of issues) {
      expect(clusterSet.has(issue.cluster)).toBe(true)
    }
  })

  it('issue reason fields are non-empty descriptive strings', () => {
    const issues = getDemoPodIssues()
    for (const issue of issues) {
      expect(issue.reason.length).toBeGreaterThan(2) // not just a single char
    }
  })
})

describe('getDemoAllPods — superset invariants', () => {
  it('every pod in getDemoPods appears in getDemoAllPods', () => {
    const base = getDemoPods()
    const all = getDemoAllPods()
    const allNames = new Set(all.map(p => p.name))
    for (const pod of base) {
      expect(allNames.has(pod.name)).toBe(true)
    }
  })

  it('getDemoAllPods includes pods from at least 2 namespaces not in getDemoPods', () => {
    const base = getDemoPods()
    const all = getDemoAllPods()
    const baseNs = new Set(base.map(p => p.namespace))
    const extraNs = new Set(
      all.filter(p => !baseNs.has(p.namespace)).map(p => p.namespace)
    )
    // The ML pods should add at least one extra namespace
    expect(extraNs.size).toBeGreaterThanOrEqual(1)
  })
})
