import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSearchIndex } from '../useSearchIndex'
import type { SearchCategory, SearchItem } from '../useSearchIndex'

// ── Mock all data hooks used inside useSearchIndex ──────────────────────────

const mockClusters = vi.fn(() => ({ clusters: [] as Array<{ name: string; context: string; server?: string; healthy?: boolean }> }))
const mockDeployments = vi.fn(() => ({ deployments: [] as Array<{ name: string; cluster: string; namespace: string; image?: string; status?: string }> }))
const mockPods = vi.fn(() => ({ pods: [] as Array<{ name: string; cluster: string; namespace: string; status?: string }> }))
const mockServices = vi.fn(() => ({ services: [] as Array<{ name: string; cluster: string; namespace: string; type: string }> }))
const mockNodes = vi.fn(() => ({ nodes: [] as Array<{ name: string; cluster: string; status?: string; roles?: string[] }> }))
const mockHelmReleases = vi.fn(() => ({ releases: [] as Array<{ name: string; cluster: string; namespace: string; chart: string; app_version: string; status?: string }> }))
const mockMissions = vi.fn(() => ({ missions: [] as Array<{ id: string; title: string; description: string; type: string; status: string; cluster?: string }> }))
const mockDashboards = vi.fn(() => ({ dashboards: [] as Array<{ id: string; name: string; is_default?: boolean }> }))

vi.mock('../mcp/clusters', () => ({
  useClusters: () => mockClusters(),
}))

vi.mock('../mcp/workloads', () => ({
  useDeployments: () => mockDeployments(),
  usePods: () => mockPods(),
}))

vi.mock('../mcp/networking', () => ({
  useServices: () => mockServices(),
}))

vi.mock('../mcp/compute', () => ({
  useNodes: () => mockNodes(),
}))

vi.mock('../mcp/helm', () => ({
  useHelmReleases: () => mockHelmReleases(),
}))

vi.mock('../useMissions', () => ({
  useMissions: () => mockMissions(),
}))

vi.mock('../useDashboards', () => ({
  useDashboards: () => mockDashboards(),
}))

// Mock DASHBOARD_CONFIGS (imported by useSearchIndex to build storage keys)
vi.mock('../../config/dashboards', () => ({
  DASHBOARD_CONFIGS: {},
}))

// Mock card metadata with a small set for testing
vi.mock('../../components/cards/cardMetadata', () => ({
  CARD_TITLES: {
    cluster_health: 'Cluster Health',
    app_status: 'Workload Status',
    pod_overview: 'Pod Overview',
  } as Record<string, string>,
  CARD_DESCRIPTIONS: {
    cluster_health: 'Shows cluster health overview',
    app_status: 'Shows workload deployment status',
    pod_overview: 'Shows pod overview',
  } as Record<string, string>,
}))

// Mock stat block definitions — return a small list for predictable tests
vi.mock('../../components/ui/StatsBlockDefinitions', () => ({
  getDefaultStatBlocks: (dashType: string) => {
    if (dashType === 'clusters') {
      return [
        { id: 'clusters', name: 'Clusters', icon: 'Server', visible: true, color: 'purple' },
        { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
      ]
    }
    if (dashType === 'dashboard') {
      return [
        { id: 'total-clusters', name: 'Total Clusters', icon: 'Server', visible: true, color: 'blue' },
      ]
    }
    return []
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten all results from the grouped Map into a single array, preserving order */
function flattenResults(results: Map<SearchCategory, SearchItem[]>): SearchItem[] {
  const flat: SearchItem[] = []
  for (const items of results.values()) {
    flat.push(...items)
  }
  return flat
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSearchIndex', () => {
  beforeEach(() => {
    // Reset all hook mocks to empty data
    mockClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [] })
    mockDeployments.mockReturnValue({ deployments: [] })
    mockPods.mockReturnValue({ pods: [] })
    mockServices.mockReturnValue({ services: [] })
    mockNodes.mockReturnValue({ nodes: [] })
    mockHelmReleases.mockReturnValue({ releases: [] })
    mockMissions.mockReturnValue({ missions: [] })
    mockDashboards.mockReturnValue({ dashboards: [] })

    // Clear localStorage between tests (setup.ts provides the mock)
    localStorage.clear()
  })

  // ── 42. Empty null/undefined hook data doesn't crash ───────────────────

  it('handles null-ish hook data without crashing', () => {
    mockClusters.mockReturnValue({ clusters: undefined, deduplicatedClusters: undefined })
    mockDeployments.mockReturnValue({ deployments: null })
    mockPods.mockReturnValue({ pods: undefined })
    mockServices.mockReturnValue({ services: null })
    mockNodes.mockReturnValue({ nodes: undefined })
    mockHelmReleases.mockReturnValue({ releases: null })
    mockMissions.mockReturnValue({ missions: undefined })
    mockDashboards.mockReturnValue({ dashboards: [] })
    expect(() => {
      renderHook(() => useSearchIndex('test'))
    }).not.toThrow()
  })

  // ── 43. Special characters in queries don't crash ───────────────────────

  it('handles regex special characters in query without crashing', () => {
    // matchesQuery uses .includes(), not regex, but we verify no edge-case
    // exceptions from characters like ( ) [ ] * + ? . ^ $ { } | \
    const specialChars = ['(', ')', '[', ']', '*', '+', '?', '.', '^', '$', '{', '}', '|', '\\']
    for (const ch of specialChars) {
      expect(() => {
        renderHook(() => useSearchIndex(ch))
      }).not.toThrow()
    }
  })

  it('handles unicode characters in query', () => {
    expect(() => {
      const { result } = renderHook(() => useSearchIndex('日本語'))
      // No crash, returns results (likely empty since no items match)
      expect(result.current.totalCount).toBeGreaterThanOrEqual(0)
    }).not.toThrow()
  })

  it('handles emoji characters in query', () => {
    expect(() => {
      const { result } = renderHook(() => useSearchIndex('🚀'))
      expect(result.current.totalCount).toBeGreaterThanOrEqual(0)
    }).not.toThrow()
  })

  // ── 44. Single-character query still matches ────────────────────────────

  it('returns results for a single-character query', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'a-cluster', context: 'a-cluster', healthy: true }],
      deduplicatedClusters: [{ name: 'a-cluster', context: 'a-cluster', healthy: true }],
    })
    const { result } = renderHook(() => useSearchIndex('a'))
    // 'a' appears in many page names/descriptions, and in 'a-cluster'
    expect(result.current.totalCount).toBeGreaterThan(0)
  })

  // ── 45. Very long query that matches nothing ────────────────────────────

  it('returns empty results for a long query matching nothing', () => {
    const longQuery = 'xyznonexistentquerythatshouldnotmatchanything12345'
    const { result } = renderHook(() => useSearchIndex(longQuery))
    expect(result.current.totalCount).toBe(0)
    expect(result.current.results.size).toBe(0)
  })

  // ── 46. Deployment matched via image keyword ───────────────────────────

  it('matches deployments via their image keyword', () => {
    mockDeployments.mockReturnValue({
      deployments: [
        { name: 'web-app', cluster: 'prod', namespace: 'default', image: 'myregistry/custom-app:v2.1', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('myregistry'))
    const flat = flattenResults(result.current.results)
    const deploys = flat.filter(i => i.category === 'deployment')
    expect(deploys.some(i => i.name === 'web-app')).toBe(true)
  })

  // ── 47. Helm release matched via chart keyword ─────────────────────────

  it('matches helm releases via chart name in keywords', () => {
    mockHelmReleases.mockReturnValue({
      releases: [
        { name: 'my-grafana', cluster: 'monitoring', namespace: 'obs', chart: 'grafana-7.0.0', app_version: '10.2.3', status: 'deployed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('grafana-7.0.0'))
    const flat = flattenResults(result.current.results)
    const helms = flat.filter(i => i.category === 'helm')
    expect(helms.some(i => i.name === 'my-grafana')).toBe(true)
  })

  it('matches helm releases via app_version in keywords', () => {
    mockHelmReleases.mockReturnValue({
      releases: [
        { name: 'my-prom', cluster: 'mon', namespace: 'obs', chart: 'prometheus-25.0', app_version: '2.48.1', status: 'deployed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('2.48.1'))
    const flat = flattenResults(result.current.results)
    const helms = flat.filter(i => i.category === 'helm')
    expect(helms.some(i => i.name === 'my-prom')).toBe(true)
  })

  // ── 48. Namespace dedup: same namespace from pods + deployments + services ─

  it('deduplicates namespaces across deployments, pods, and services', () => {
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'dep-a', cluster: 'c', namespace: 'shared-ns', status: 'Running' }],
    })
    mockPods.mockReturnValue({
      pods: [{ name: 'pod-a', cluster: 'c', namespace: 'shared-ns', status: 'Running' }],
    })
    mockServices.mockReturnValue({
      services: [{ name: 'svc-a', cluster: 'c', namespace: 'shared-ns', type: 'ClusterIP' }],
    })

    const { result } = renderHook(() => useSearchIndex('shared-ns'))
    const flat = flattenResults(result.current.results)
    const nsItems = flat.filter(i => i.category === 'namespace')
    // Only 1 namespace item even though 3 sources contribute the same namespace
    expect(nsItems.length).toBe(1)
    expect(nsItems[0].name).toBe('shared-ns')
  })

  // ── 49. Multiple unique namespaces from different sources ──────────────

  it('creates separate namespace items from different namespace names', () => {
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'dep-a', cluster: 'c', namespace: 'alpha-ns', status: 'Running' }],
    })
    mockPods.mockReturnValue({
      pods: [{ name: 'pod-a', cluster: 'c', namespace: 'beta-ns', status: 'Running' }],
    })
    mockServices.mockReturnValue({
      services: [{ name: 'svc-a', cluster: 'c', namespace: 'gamma-ns', type: 'ClusterIP' }],
    })

    // Use a query broad enough to match all three namespace names
    const { result: alphaResult } = renderHook(() => useSearchIndex('alpha-ns'))
    const { result: betaResult } = renderHook(() => useSearchIndex('beta-ns'))
    const { result: gammaResult } = renderHook(() => useSearchIndex('gamma-ns'))

    const alphaNs = flattenResults(alphaResult.current.results).filter(i => i.category === 'namespace')
    const betaNs = flattenResults(betaResult.current.results).filter(i => i.category === 'namespace')
    const gammaNs = flattenResults(gammaResult.current.results).filter(i => i.category === 'namespace')

    expect(alphaNs.length).toBe(1)
    expect(betaNs.length).toBe(1)
    expect(gammaNs.length).toBe(1)
  })

  // ── 50. Service type appears in description and meta ───────────────────

  it('includes service type in description and meta', () => {
    mockServices.mockReturnValue({
      services: [{ name: 'my-lb-svc', cluster: 'prod', namespace: 'web', type: 'LoadBalancer' }],
    })
    const { result } = renderHook(() => useSearchIndex('my-lb-svc'))
    const flat = flattenResults(result.current.results)
    const svcs = flat.filter(i => i.category === 'service')
    expect(svcs.length).toBe(1)
    expect(svcs[0].description).toContain('LoadBalancer')
    expect(svcs[0].meta).toContain('LoadBalancer')
  })

  // ── 51. Service matched via type in meta ───────────────────────────────

  it('matches services via their type in the meta field', () => {
    mockServices.mockReturnValue({
      services: [{ name: 'internal-api', cluster: 'prod', namespace: 'core', type: 'ClusterIP' }],
    })
    const { result } = renderHook(() => useSearchIndex('ClusterIP'))
    const flat = flattenResults(result.current.results)
    const svcs = flat.filter(i => i.category === 'service')
    expect(svcs.some(i => i.name === 'internal-api')).toBe(true)
  })

  // ── 52. Node roles included in description and meta ────────────────────

  it('includes node roles in description and meta', () => {
    mockNodes.mockReturnValue({
      nodes: [{ name: 'cp-node-1', cluster: 'prod', status: 'Ready', roles: ['control-plane', 'master'] }],
    })
    const { result } = renderHook(() => useSearchIndex('cp-node-1'))
    const flat = flattenResults(result.current.results)
    const nodes = flat.filter(i => i.category === 'node')
    expect(nodes.length).toBe(1)
    expect(nodes[0].description).toContain('control-plane')
    expect(nodes[0].meta).toContain('control-plane')
    expect(nodes[0].meta).toContain('master')
  })

  // ── 53. Mission matched via type/status keywords ───────────────────────

  it('matches missions via their type keyword', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'm-scan', title: 'Security Scan', description: 'Run trivy scan', type: 'security-audit', status: 'pending', cluster: 'prod' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('security-audit'))
    const flat = flattenResults(result.current.results)
    const missions = flat.filter(i => i.category === 'mission')
    expect(missions.some(i => i.name === 'Security Scan')).toBe(true)
  })

  it('matches missions via their status keyword', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'm-run', title: 'Deploy Monitoring', description: 'Deploy stack', type: 'deploy', status: 'completed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('completed'))
    const flat = flattenResults(result.current.results)
    const missions = flat.filter(i => i.category === 'mission')
    expect(missions.some(i => i.name === 'Deploy Monitoring')).toBe(true)
  })

  // ── 54. Cluster server URL is searchable via keywords ──────────────────

  it('matches clusters via server URL keyword', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'eks-prod', context: 'eks-prod', server: 'https://ABCDEF.gr7.us-east-1.eks.amazonaws.com', healthy: true }],
      deduplicatedClusters: [{ name: 'eks-prod', context: 'eks-prod', server: 'https://ABCDEF.gr7.us-east-1.eks.amazonaws.com', healthy: true }],
    })
    const { result } = renderHook(() => useSearchIndex('ABCDEF'))
    const flat = flattenResults(result.current.results)
    const clusters = flat.filter(i => i.category === 'cluster')
    expect(clusters.some(i => i.name === 'eks-prod')).toBe(true)
  })

  // ── 55. Placed cards on multiple dashboards appear as separate items ───

  it('creates separate items when same card is placed on multiple dashboards', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'cluster_health', title: 'Cluster Health' },
    ]))
    localStorage.setItem('kubestellar-clusters-cards', JSON.stringify([
      { card_type: 'cluster_health', title: 'Cluster Health' },
    ]))

    const { result } = renderHook(() => useSearchIndex('Cluster Health'))
    const flat = flattenResults(result.current.results)
    const placedCards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'cluster_health')
    // Should have two placed-card entries (one per dashboard) but no catalog dupe
    expect(placedCards.length).toBe(2)
    // Verify they have different IDs
    const ids = placedCards.map(c => c.id)
    expect(new Set(ids).size).toBe(2)
  })

  // ── 56. Placed card keywords include raw and humanized card_type ───────

  it('placed card keywords include raw card_type and humanized form', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'pod_overview' },
    ]))
    // Search by the humanized form 'pod overview' (spaces instead of underscores)
    const { result } = renderHook(() => useSearchIndex('pod overview'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'pod_overview')
    expect(cards.length).toBeGreaterThan(0)
  })

  // ── 57. Empty string localStorage value is handled gracefully ──────────

  it('handles empty string localStorage value for card keys', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', '')
    expect(() => {
      renderHook(() => useSearchIndex('anything'))
    }).not.toThrow()
  })

  // ── 58. Namespace href is correctly encoded ────────────────────────────

  it('namespace items have correctly encoded hrefs', () => {
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'dep-1', cluster: 'c', namespace: 'my namespace', status: 'Running' }],
    })
    const { result } = renderHook(() => useSearchIndex('my namespace'))
    const flat = flattenResults(result.current.results)
    const nsItems = flat.filter(i => i.category === 'namespace')
    expect(nsItems.length).toBe(1)
    expect(nsItems[0].href).toBe('/namespaces?ns=my%20namespace')
  })

  // ── 59. Deployment meta combines cluster, namespace, and status ────────

  it('deployment meta field contains cluster, namespace, and status', () => {
    mockDeployments.mockReturnValue({
      deployments: [
        { name: 'api-server', cluster: 'prod-east', namespace: 'backend', image: 'api:v1', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('api-server'))
    const flat = flattenResults(result.current.results)
    const dep = flat.find(i => i.category === 'deployment')
    expect(dep).toBeDefined()
    expect(dep!.meta).toContain('prod-east')
    expect(dep!.meta).toContain('backend')
    expect(dep!.meta).toContain('Running')
  })

  // ── 60. Setting items matched via their keywords ───────────────────────

  it('matches setting items via keyword search', () => {
    // 'anthropic' is a keyword on the API Keys setting
    const { result } = renderHook(() => useSearchIndex('anthropic'))
    const flat = flattenResults(result.current.results)
    const settings = flat.filter(i => i.category === 'setting')
    expect(settings.some(i => i.name === 'API Keys')).toBe(true)
  })
})
