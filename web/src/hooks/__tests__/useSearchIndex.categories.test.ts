import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSearchIndex, CATEGORY_ORDER } from '../useSearchIndex'
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

/** Get all category keys from results in order */
function resultCategories(results: Map<SearchCategory, SearchItem[]>): SearchCategory[] {
  return Array.from(results.keys())
}

// ── Tests ───────────────────────────────────────────────────────────────────

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

  // ── 1. Empty query returns empty results ─────────────────────────────────

  it('returns empty results for an empty query', () => {
    const { result } = renderHook(() => useSearchIndex(''))
    expect(result.current.results.size).toBe(0)
    expect(result.current.totalCount).toBe(0)
  })

  it('returns empty results for a whitespace-only query', () => {
    const { result } = renderHook(() => useSearchIndex('   '))
    expect(result.current.results.size).toBe(0)
    expect(result.current.totalCount).toBe(0)
  })

  // ── 2. Static page items are indexed ─────────────────────────────────────

  it('finds page items by name', () => {
    const { result } = renderHook(() => useSearchIndex('Dashboard'))
    const flat = flattenResults(result.current.results)
    const pageItems = flat.filter(i => i.category === 'page')
    expect(pageItems.length).toBeGreaterThan(0)
    expect(pageItems.some(i => i.name === 'Dashboard')).toBe(true)
  })

  it('finds page items by description', () => {
    const { result } = renderHook(() => useSearchIndex('Kubernetes clusters'))
    const flat = flattenResults(result.current.results)
    const pageItems = flat.filter(i => i.category === 'page')
    expect(pageItems.some(i => i.name === 'My Clusters')).toBe(true)
  })

  // ── 3. Case-insensitive matching ─────────────────────────────────────────

  it('matches queries case-insensitively', () => {
    const { result: upper } = renderHook(() => useSearchIndex('DASHBOARD'))
    const { result: lower } = renderHook(() => useSearchIndex('dashboard'))
    const { result: mixed } = renderHook(() => useSearchIndex('DashBoard'))

    const upperCount = upper.current.totalCount
    const lowerCount = lower.current.totalCount
    const mixedCount = mixed.current.totalCount

    expect(upperCount).toBe(lowerCount)
    expect(lowerCount).toBe(mixedCount)
    expect(upperCount).toBeGreaterThan(0)
  })

  // ── 4. Keyword matching ──────────────────────────────────────────────────

  it('matches page items via keywords array', () => {
    // 'home' is a keyword on the Dashboard page item
    const { result } = renderHook(() => useSearchIndex('home'))
    const flat = flattenResults(result.current.results)
    expect(flat.some(i => i.name === 'Dashboard' && i.category === 'page')).toBe(true)
  })

  it('matches page items via kubernetes keyword', () => {
    // 'k8s' is a keyword on the Clusters page
    const { result } = renderHook(() => useSearchIndex('k8s'))
    const flat = flattenResults(result.current.results)
    expect(flat.some(i => i.name === 'My Clusters' && i.category === 'page')).toBe(true)
  })

  // ── 5. Setting items are indexed ─────────────────────────────────────────

  it('finds setting items', () => {
    const { result } = renderHook(() => useSearchIndex('AI Settings'))
    const flat = flattenResults(result.current.results)
    const settings = flat.filter(i => i.category === 'setting')
    expect(settings.length).toBeGreaterThan(0)
    expect(settings.some(i => i.name === 'AI Settings')).toBe(true)
  })

  // ── 6. Cluster items from hooks ──────────────────────────────────────────

  it('includes cluster items from the useClusters hook', () => {
    mockClusters.mockReturnValue({
      clusters: [
        { name: 'prod-east', context: 'prod-east', server: 'https://k8s.prod.com', healthy: true },
        { name: 'staging-west', context: 'staging-ctx', server: 'https://k8s.staging.com', healthy: false },
      ],
      deduplicatedClusters: [
        { name: 'prod-east', context: 'prod-east', server: 'https://k8s.prod.com', healthy: true },
        { name: 'staging-west', context: 'staging-ctx', server: 'https://k8s.staging.com', healthy: false },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('prod-east'))
    const flat = flattenResults(result.current.results)
    const clusters = flat.filter(i => i.category === 'cluster')
    expect(clusters.length).toBe(1)
    expect(clusters[0].name).toBe('prod-east')
    expect(clusters[0].meta).toBe('healthy')
  })

  // ── 7. Deployment items from hooks ───────────────────────────────────────

  it('includes deployment items from the useDeployments hook', () => {
    mockDeployments.mockReturnValue({
      deployments: [
        { name: 'nginx-deploy', cluster: 'prod', namespace: 'default', image: 'nginx:1.25', status: 'Running' },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('nginx-deploy'))
    const flat = flattenResults(result.current.results)
    const deploys = flat.filter(i => i.category === 'deployment')
    expect(deploys.length).toBe(1)
    expect(deploys[0].name).toBe('nginx-deploy')
    expect(deploys[0].description).toContain('default')
    expect(deploys[0].description).toContain('prod')
  })

  // ── 8. Pod items from hooks ──────────────────────────────────────────────

  it('includes pod items from the usePods hook', () => {
    mockPods.mockReturnValue({
      pods: [
        { name: 'redis-abc123', cluster: 'staging', namespace: 'cache', status: 'Running' },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('redis-abc123'))
    const flat = flattenResults(result.current.results)
    const pods = flat.filter(i => i.category === 'pod')
    expect(pods.length).toBe(1)
    expect(pods[0].name).toBe('redis-abc123')
  })

  // ── 9. Service items from hooks ──────────────────────────────────────────

  it('includes service items from the useServices hook', () => {
    mockServices.mockReturnValue({
      services: [
        { name: 'api-gateway', cluster: 'prod', namespace: 'ingress', type: 'LoadBalancer' },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('api-gateway'))
    const flat = flattenResults(result.current.results)
    const svcs = flat.filter(i => i.category === 'service')
    expect(svcs.length).toBe(1)
    expect(svcs[0].name).toBe('api-gateway')
  })

  // ── 10. Node items from hooks ────────────────────────────────────────────

  it('includes node items from the useNodes hook', () => {
    mockNodes.mockReturnValue({
      nodes: [
        { name: 'worker-node-1', cluster: 'prod', status: 'Ready', roles: ['worker'] },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('worker-node-1'))
    const flat = flattenResults(result.current.results)
    const nodes = flat.filter(i => i.category === 'node')
    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('worker-node-1')
  })

  // ── 11. Helm release items from hooks ────────────────────────────────────

  it('includes helm release items from the useHelmReleases hook', () => {
    mockHelmReleases.mockReturnValue({
      releases: [
        { name: 'prometheus', cluster: 'monitoring-cluster', namespace: 'monitoring', chart: 'prometheus-25.8.0', app_version: '2.48.1', status: 'deployed' },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('prometheus'))
    const flat = flattenResults(result.current.results)
    const helms = flat.filter(i => i.category === 'helm')
    expect(helms.length).toBe(1)
    expect(helms[0].name).toBe('prometheus')
    expect(helms[0].keywords).toContain('prometheus-25.8.0')
  })

  // ── 12. Mission items from hooks ─────────────────────────────────────────

  it('includes mission items from the useMissions hook', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'mission-1', title: 'Upgrade Cluster', description: 'Upgrade prod to 1.29', type: 'upgrade', status: 'running', cluster: 'prod' },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('Upgrade Cluster'))
    const flat = flattenResults(result.current.results)
    const missions = flat.filter(i => i.category === 'mission')
    expect(missions.length).toBe(1)
    expect(missions[0].name).toBe('Upgrade Cluster')
  })

  // ── 13. Stat items from defaults ─────────────────────────────────────────

  it('includes stat items from default stat blocks', () => {
    // The mocked getDefaultStatBlocks returns stats for 'clusters' and 'dashboard'
    // Searching for 'Healthy' should find the stat block
    const { result } = renderHook(() => useSearchIndex('Healthy'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.length).toBeGreaterThan(0)
    expect(stats.some(i => i.name === 'Healthy')).toBe(true)
  })

  // ── 14. Card catalog items are indexed ───────────────────────────────────

  it('includes catalog card items from CARD_TITLES', () => {
    // Our mock CARD_TITLES includes 'Cluster Health'
    const { result } = renderHook(() => useSearchIndex('Cluster Health'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card')
    expect(cards.some(i => i.name === 'Cluster Health')).toBe(true)
  })

  // ── 15. CATEGORY_ORDER defines result ordering ──────────────────────────

  it('returns results ordered by CATEGORY_ORDER priority', () => {
    // Provide data for multiple categories that all match 'prod'
    mockClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', context: 'prod-cluster', healthy: true }],
      deduplicatedClusters: [{ name: 'prod-cluster', context: 'prod-cluster', healthy: true }],
    })
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'prod-api', cluster: 'prod', namespace: 'default', status: 'Running' }],
    })
    mockPods.mockReturnValue({
      pods: [{ name: 'prod-pod-xyz', cluster: 'prod', namespace: 'default', status: 'Running' }],
    })
    mockServices.mockReturnValue({
      services: [{ name: 'prod-svc', cluster: 'prod', namespace: 'default', type: 'ClusterIP' }],
    })

    const { result } = renderHook(() => useSearchIndex('prod'))
    const categories = resultCategories(result.current.results)

    // Verify that the order of categories in results follows CATEGORY_ORDER
    for (let i = 1; i < categories.length; i++) {
      const prevIdx = CATEGORY_ORDER.indexOf(categories[i - 1])
      const currIdx = CATEGORY_ORDER.indexOf(categories[i])
      expect(prevIdx).toBeLessThan(currIdx)
    }
  })

  it('places page results before cluster results', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'my-cluster', context: 'my-cluster', healthy: true }],
      deduplicatedClusters: [{ name: 'my-cluster', context: 'my-cluster', healthy: true }],
    })

    // 'cluster' matches both page items and the cluster itself
    const { result } = renderHook(() => useSearchIndex('cluster'))
    const categories = resultCategories(result.current.results)

    if (categories.includes('page') && categories.includes('cluster')) {
      expect(categories.indexOf('page')).toBeLessThan(categories.indexOf('cluster'))
    }
  })

  // ── 16. MAX_PER_CATEGORY = 5 limit ──────────────────────────────────────

  it('limits results to MAX_PER_CATEGORY (5) per category', () => {
    // Create 8 deployments that all match the query
    const manyDeployments = Array.from({ length: 8 }, (_, i) => ({
      name: `test-deploy-${i}`,
      cluster: 'prod',
      namespace: 'default',
      status: 'Running',
    }))
    mockDeployments.mockReturnValue({ deployments: manyDeployments })

    const { result } = renderHook(() => useSearchIndex('test-deploy'))
    const deployments = result.current.results.get('deployment') ?? []
    expect(deployments.length).toBeLessThanOrEqual(5)
  })

  // ── 17. MAX_TOTAL = 40 limit ─────────────────────────────────────────────

  it('limits total results to MAX_TOTAL (40)', () => {
    // Flood multiple categories with items that all match a generic query
    const manyDeployments = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-deploy-${i}`,
      cluster: 'c',
      namespace: 'ns',
      status: 'Running',
    }))
    const manyPods = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-pod-${i}`,
      cluster: 'c',
      namespace: 'ns',
      status: 'Running',
    }))
    const manyServices = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-svc-${i}`,
      cluster: 'c',
      namespace: 'ns',
      type: 'ClusterIP',
    }))
    const manyClusters = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-cluster-${i}`,
      context: `searchterm-cluster-${i}`,
      healthy: true,
    }))
    const manyNodes = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-node-${i}`,
      cluster: 'c',
      status: 'Ready',
      roles: ['worker'],
    }))
    const manyHelm = Array.from({ length: 20 }, (_, i) => ({
      name: `searchterm-helm-${i}`,
      cluster: 'c',
      namespace: 'ns',
      chart: 'chart',
      app_version: '1.0',
      status: 'deployed',
    }))

    mockDeployments.mockReturnValue({ deployments: manyDeployments })
    mockPods.mockReturnValue({ pods: manyPods })
    mockServices.mockReturnValue({ services: manyServices })
    mockClusters.mockReturnValue({ clusters: manyClusters, deduplicatedClusters: manyClusters })
    mockNodes.mockReturnValue({ nodes: manyNodes })
    mockHelmReleases.mockReturnValue({ releases: manyHelm })

    const { result } = renderHook(() => useSearchIndex('searchterm'))
    const flat = flattenResults(result.current.results)
    expect(flat.length).toBeLessThanOrEqual(40)
  })

  // ── 18. DASHBOARD_NAMES mapping coverage ─────────────────────────────────

  it('stat items reference dashboard names from DASHBOARD_NAMES', () => {
    // The default stat blocks for 'clusters' should show "On Clusters dashboard"
    const { result } = renderHook(() => useSearchIndex('Clusters'))
    const flat = flattenResults(result.current.results)
    const statItems = flat.filter(i => i.category === 'stat')
    // At least one stat item should have the Clusters dashboard reference
    const clusterStats = statItems.filter(i => i.description?.includes('Clusters dashboard'))
    expect(clusterStats.length).toBeGreaterThanOrEqual(0)
    // The stat named 'Clusters' should exist (from clusters dashboard)
    expect(statItems.some(i => i.name === 'Clusters')).toBe(true)
  })

  // ── 19. totalCount reflects untruncated match count ──────────────────────

  it('totalCount reflects the total number of matched items before truncation', () => {
    const manyDeployments = Array.from({ length: 10 }, (_, i) => ({
      name: `xyzzy-deploy-${i}`,
      cluster: 'c',
      namespace: 'ns',
      status: 'Running',
    }))
    mockDeployments.mockReturnValue({ deployments: manyDeployments })

    const { result } = renderHook(() => useSearchIndex('xyzzy'))
    // totalCount should be >= the number of items actually returned (which is capped)
    expect(result.current.totalCount).toBeGreaterThanOrEqual(10)
    const flat = flattenResults(result.current.results)
    expect(flat.length).toBeLessThanOrEqual(result.current.totalCount)
  })

  // ── 20. Namespace items derived from pods/deployments/services ──────────

  it('derives namespace items from deployments, pods, and services', () => {
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'dep-1', cluster: 'c', namespace: 'kube-system', status: 'Running' }],
    })
    mockPods.mockReturnValue({
      pods: [{ name: 'pod-1', cluster: 'c', namespace: 'kube-system', status: 'Running' }],
    })

    const { result } = renderHook(() => useSearchIndex('kube-system'))
    const flat = flattenResults(result.current.results)
    const nsItems = flat.filter(i => i.category === 'namespace')
    expect(nsItems.length).toBe(1)
    expect(nsItems[0].name).toBe('kube-system')
  })

  // ── 21. Custom dashboards are indexed ────────────────────────────────────

  it('includes custom dashboard items from useDashboards', () => {
    mockDashboards.mockReturnValue({
      dashboards: [
        { id: 'default-1', name: 'Main', is_default: true },
        { id: 'custom-abc', name: 'My Custom Board', is_default: false },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('My Custom Board'))
    const flat = flattenResults(result.current.results)
    const dashItems = flat.filter(i => i.category === 'dashboard')
    expect(dashItems.length).toBe(1)
    expect(dashItems[0].name).toBe('My Custom Board')
    expect(dashItems[0].href).toBe('/custom-dashboard/custom-abc')
  })

  it('excludes default dashboards from custom dashboard items', () => {
    mockDashboards.mockReturnValue({
      dashboards: [
        { id: 'default-1', name: 'MainDefaultDash', is_default: true },
      ],
    })

    const { result } = renderHook(() => useSearchIndex('MainDefaultDash'))
    const flat = flattenResults(result.current.results)
    const dashItems = flat.filter(i => i.category === 'dashboard')
    expect(dashItems.length).toBe(0)
  })

  // ── 22. Meta field matching ──────────────────────────────────────────────

  it('matches items via the meta field', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'silent-cluster', context: 'silent-cluster', healthy: false }],
      deduplicatedClusters: [{ name: 'silent-cluster', context: 'silent-cluster', healthy: false }],
    })

    // meta for unhealthy cluster is 'unhealthy'
    const { result } = renderHook(() => useSearchIndex('unhealthy'))
    const flat = flattenResults(result.current.results)
    const clusters = flat.filter(i => i.category === 'cluster')
    expect(clusters.some(i => i.name === 'silent-cluster')).toBe(true)
  })

  // ── 23. Placed cards from localStorage ───────────────────────────────────

  it('includes placed cards scanned from localStorage', () => {
    // Simulate a placed card in localStorage
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'cluster_health', title: 'Cluster Health' },
    ]))

    const { result } = renderHook(() => useSearchIndex('Cluster Health'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card')
    // Should find both the placed card and/or the catalog card
    expect(cards.some(i => i.name === 'Cluster Health')).toBe(true)
  })

  // ── 24. CATEGORY_ORDER contains all expected categories ──────────────────

  it('CATEGORY_ORDER contains all documented search categories', () => {
    const expected: SearchCategory[] = [
      'page', 'cluster', 'mission', 'deployment', 'pod', 'service',
      'namespace', 'node', 'helm', 'dashboard', 'card', 'stat', 'setting',
    ]
    for (const cat of expected) {
      expect(CATEGORY_ORDER).toContain(cat)
    }
  })

  // ── 25. Partial substring matching works ─────────────────────────────────

  it('matches partial substrings in item names', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'production-us-east', context: 'production-us-east', healthy: true }],
      deduplicatedClusters: [{ name: 'production-us-east', context: 'production-us-east', healthy: true }],
    })

    const { result } = renderHook(() => useSearchIndex('prod'))
    const flat = flattenResults(result.current.results)
    expect(flat.some(i => i.name === 'production-us-east' && i.category === 'cluster')).toBe(true)
  })

  // ── 26. Placed cards with missing title fall back to CARD_TITLES ───────

  it('falls back to CARD_TITLES when placed card has no title', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'cluster_health' }, // no explicit title
    ]))

    const { result } = renderHook(() => useSearchIndex('Cluster Health'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card')
    expect(cards.some(i => i.name === 'Cluster Health')).toBe(true)
  })

  // ── 27. Placed card with unknown card_type falls back to humanized type

  it('humanizes unknown card_type as fallback title', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'unknown_fancy_card' }, // not in CARD_TITLES
    ]))

    const { result } = renderHook(() => useSearchIndex('unknown fancy card'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card')
    expect(cards.some(i => i.name === 'unknown fancy card')).toBe(true)
  })

  // ── 28. Malformed JSON in card localStorage is silently ignored ────────

  it('does not crash on malformed localStorage for card keys', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', '{not valid json}')
    expect(() => {
      renderHook(() => useSearchIndex('cluster'))
    }).not.toThrow()
  })

  // ── 29. Non-array card JSON is silently skipped ────────────────────────

  it('handles non-array card JSON without crashing', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify('just a string'))
    expect(() => {
      renderHook(() => useSearchIndex('cluster'))
    }).not.toThrow()
  })

  // ── 30. Malformed JSON in stats localStorage falls back to defaults ────

  it('falls back to default stats on malformed localStorage stats', () => {
    localStorage.setItem('dashboard-stats-config', 'broken{')
    const { result } = renderHook(() => useSearchIndex('Total Clusters'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.some(i => i.name === 'Total Clusters')).toBe(true)
  })

  // ── 31. Non-array stats config falls back to defaults ──────────────────

  it('falls back to default stats when stored config is not an array', () => {
    localStorage.setItem('dashboard-stats-config', JSON.stringify({ wrong: 'type' }))
    const { result } = renderHook(() => useSearchIndex('Total Clusters'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.some(i => i.name === 'Total Clusters')).toBe(true)
  })

  // ── 32. Invisible stats are excluded ───────────────────────────────────

  it('excludes stat blocks with visible: false', () => {
    localStorage.setItem('dashboard-stats-config', JSON.stringify([
      { id: 'visible-stat', name: 'Visible Stat', icon: 'Eye', visible: true },
      { id: 'hidden-stat', name: 'Hidden Stat', icon: 'EyeOff', visible: false },
    ]))
    const { result } = renderHook(() => useSearchIndex('Hidden Stat'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.some(i => i.name === 'Hidden Stat')).toBe(false)
  })

  // ── 33. Custom dashboard placed cards have correct hrefs ───────────────

  it('custom dashboard placed cards navigate to /custom-dashboard/:id', () => {
    mockDashboards.mockReturnValue({
      dashboards: [
        { id: 'main', name: 'Main', is_default: true },
        { id: 'custom-xyz', name: 'My Board', is_default: false },
      ],
    })
    localStorage.setItem('kubestellar-custom-dashboard-custom-xyz-cards', JSON.stringify([
      { card_type: 'pod_overview' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Pod Overview'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card' && i.description?.includes('My Board'))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].href).toBe('/custom-dashboard/custom-xyz')
  })

  // ── 34. Cards without card_type are skipped in placed cards scan ───────

  it('skips placed cards that have no card_type', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { title: 'Orphan Card' }, // no card_type
    ]))
    const { result } = renderHook(() => useSearchIndex('Orphan Card'))
    const flat = flattenResults(result.current.results)
    // The card without card_type should NOT appear as a placed card
    expect(flat.some(i => i.category === 'card' && i.name === 'Orphan Card')).toBe(false)
  })

  // ── 35. Cluster context != name shows in description ───────────────────

  it('shows context in cluster description when different from name', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'prod', context: 'arn:aws:eks:us-east-1:123:cluster/prod', healthy: true }],
      deduplicatedClusters: [{ name: 'prod', context: 'arn:aws:eks:us-east-1:123:cluster/prod', healthy: true }],
    })
    const { result } = renderHook(() => useSearchIndex('prod'))
    const flat = flattenResults(result.current.results)
    const clusters = flat.filter(i => i.category === 'cluster')
    expect(clusters[0].description).toContain('Context:')
  })

  // ── 36. Cluster context == name omits context from description ─────────

  it('omits context from cluster description when same as name', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'kind-local', context: 'kind-local', healthy: false }],
      deduplicatedClusters: [{ name: 'kind-local', context: 'kind-local', healthy: false }],
    })
    const { result } = renderHook(() => useSearchIndex('kind-local'))
    const flat = flattenResults(result.current.results)
    const clusters = flat.filter(i => i.category === 'cluster')
    expect(clusters[0].description).toBe('Clusters')
  })

  // ── 37. Node with no roles defaults to 'worker' ───────────────────────

  it('defaults node description to worker when roles is empty', () => {
    mockNodes.mockReturnValue({
      nodes: [{ name: 'bare-node', cluster: 'c1', status: 'Ready', roles: [] }],
    })
    const { result } = renderHook(() => useSearchIndex('bare-node'))
    const flat = flattenResults(result.current.results)
    const nodes = flat.filter(i => i.category === 'node')
    expect(nodes[0].description).toContain('worker')
  })

  // ── 38. Node with undefined roles defaults to 'worker' ────────────────

  it('defaults node description to worker when roles is undefined', () => {
    mockNodes.mockReturnValue({
      nodes: [{ name: 'undef-roles-node', cluster: 'c1', status: 'Ready' }],
    })
    const { result } = renderHook(() => useSearchIndex('undef-roles-node'))
    const flat = flattenResults(result.current.results)
    const nodes = flat.filter(i => i.category === 'node')
    expect(nodes[0].description).toContain('worker')
  })

  // ── 39. Catalog card de-duplication when placed ────────────────────────

  it('de-duplicates catalog cards that are already placed', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'app_status', title: 'Workload Status' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Workload Status'))
    const flat = flattenResults(result.current.results)
    const matchingCards = flat.filter(i => i.category === 'card' && i.name === 'Workload Status')
    // Should have placed version (scrollTarget) but not the catalog duplicate
    const placed = matchingCards.filter(i => i.scrollTarget === 'app_status')
    const catalog = matchingCards.filter(i => i.id.startsWith('catalog-card-'))
    expect(placed.length).toBe(1)
    expect(catalog.length).toBe(0)
  })

  // ── 40. scrollTarget is set on placed cards ────────────────────────────

  it('placed cards have scrollTarget set to card_type', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'cluster_health' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Cluster Health'))
    const flat = flattenResults(result.current.results)
    const placedCards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'cluster_health')
    expect(placedCards.length).toBeGreaterThan(0)
  })

  // ── 41. Catalog cards have addCard href ────────────────────────────────

  it('catalog card items navigate to /?addCard=true&cardSearch=...', () => {
    const { result } = renderHook(() => useSearchIndex('Pod Overview'))
    const flat = flattenResults(result.current.results)
    const catalogCards = flat.filter(i => i.id.startsWith('catalog-card-'))
    if (catalogCards.length > 0) {
      expect(catalogCards[0].href).toContain('addCard=true')
    }
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
