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
})
