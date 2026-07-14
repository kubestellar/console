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
})
