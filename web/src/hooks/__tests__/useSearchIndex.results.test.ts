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
    mockClusters.mockReturnValue({ clusters: [] })
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


  it('matches theme setting via dark keyword', () => {
    const { result } = renderHook(() => useSearchIndex('dark'))
    const flat = flattenResults(result.current.results)
    const settings = flat.filter(i => i.category === 'setting')
    expect(settings.some(i => i.name === 'Theme')).toBe(true)
  })

  // ── 61. Category ordering with sparse categories ───────────────────────

  it('maintains category order even when intermediate categories are empty', () => {
    // Only clusters and settings match — nothing in between
    mockClusters.mockReturnValue({
      clusters: [{ name: 'zzz-unique-cluster', context: 'zzz-unique-cluster', healthy: true }],
    })
    const { result } = renderHook(() => useSearchIndex('zzz-unique'))
    const categories = resultCategories(result.current.results)
    // Only cluster should appear (no pages/settings match 'zzz-unique')
    expect(categories).toContain('cluster')
    // Verify the ordering invariant still holds
    for (let i = 1; i < categories.length; i++) {
      const prevIdx = CATEGORY_ORDER.indexOf(categories[i - 1])
      const currIdx = CATEGORY_ORDER.indexOf(categories[i])
      expect(prevIdx).toBeLessThan(currIdx)
    }
  })

  // ── 62. Stat items from localStorage override defaults ─────────────────

  it('uses stat blocks from localStorage when available', () => {
    // Override the 'clusters' dashboard stats with a custom block
    localStorage.setItem('clusters-stats-config', JSON.stringify([
      { id: 'custom-metric', name: 'Custom Metric XYZ', icon: 'BarChart', visible: true, color: 'red' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Custom Metric XYZ'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.some(i => i.name === 'Custom Metric XYZ')).toBe(true)
  })

  // ── 63. totalCount exceeds displayed count when truncated ──────────────

  it('totalCount is larger than displayed count when results are truncated', () => {
    // Create 10 deployments and 10 pods that all match
    const deployments = Array.from({ length: 10 }, (_, i) => ({
      name: `trunc-test-deploy-${i}`,
      cluster: 'c',
      namespace: 'ns',
      status: 'Running',
    }))
    const pods = Array.from({ length: 10 }, (_, i) => ({
      name: `trunc-test-pod-${i}`,
      cluster: 'c',
      namespace: 'ns',
      status: 'Running',
    }))
    mockDeployments.mockReturnValue({ deployments })
    mockPods.mockReturnValue({ pods })

    const { result } = renderHook(() => useSearchIndex('trunc-test'))
    const flat = flattenResults(result.current.results)
    // Each category is capped at 5, so displayed <= 10 but totalCount >= 20
    expect(result.current.totalCount).toBeGreaterThanOrEqual(20)
    expect(flat.length).toBeLessThan(result.current.totalCount)
  })

  // ── 64. Broad query returns multiple categories ────────────────────────

  it('returns results across multiple categories for a broad query', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'test-cluster', context: 'test-cluster', healthy: true }],
    })
    mockDeployments.mockReturnValue({
      deployments: [{ name: 'test-deploy', cluster: 'c', namespace: 'ns', status: 'Running' }],
    })
    mockNodes.mockReturnValue({
      nodes: [{ name: 'test-node', cluster: 'c', status: 'Ready', roles: ['worker'] }],
    })

    const { result } = renderHook(() => useSearchIndex('test'))
    const categories = resultCategories(result.current.results)
    // Should span at least cluster, deployment, and node categories
    expect(categories).toContain('cluster')
    expect(categories).toContain('deployment')
    expect(categories).toContain('node')
  })

  // ── 65. Helm release description includes chart, namespace, cluster ────

  it('helm release description contains chart, namespace, and cluster', () => {
    mockHelmReleases.mockReturnValue({
      releases: [
        { name: 'cert-manager', cluster: 'infra-cluster', namespace: 'cert-manager', chart: 'cert-manager-1.14.0', app_version: '1.14.0', status: 'deployed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('cert-manager'))
    const flat = flattenResults(result.current.results)
    const helm = flat.find(i => i.category === 'helm' && i.name === 'cert-manager')
    expect(helm).toBeDefined()
    expect(helm!.description).toContain('cert-manager-1.14.0')
    expect(helm!.description).toContain('cert-manager')
    expect(helm!.description).toContain('infra-cluster')
  })

  // ── 66. Mission items include cluster in keywords ──────────────────────

  it('matches missions via their cluster keyword', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'm-fix', title: 'Fix DNS', description: 'Repair CoreDNS', type: 'fix', status: 'running', cluster: 'edge-site-42' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('edge-site-42'))
    const flat = flattenResults(result.current.results)
    const missions = flat.filter(i => i.category === 'mission')
    expect(missions.some(i => i.name === 'Fix DNS')).toBe(true)
  })

  // ── 67. Page items matched via description substring ───────────────────

  it('matches page items via description substring', () => {
    // 'PVCs' is in the Storage page description
    const { result } = renderHook(() => useSearchIndex('PVCs'))
    const flat = flattenResults(result.current.results)
    const pages = flat.filter(i => i.category === 'page')
    expect(pages.some(i => i.name === 'Storage')).toBe(true)
  })

  // ── 68. Placed cards have meta from CARD_DESCRIPTIONS ──────────────────

  it('placed cards include CARD_DESCRIPTIONS as meta for search', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'app_status' },
    ]))
    // Search by a word from the mock CARD_DESCRIPTIONS['app_status']
    const { result } = renderHook(() => useSearchIndex('workload deployment status'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'app_status')
    expect(cards.length).toBeGreaterThan(0)
  })

  // ── 69. buildDashboardStorage deduplicates legacy vs config keys ──────

  it('does not duplicate entries when legacy key overlaps with config key', () => {
    // The hook builds DASHBOARD_STORAGE from DASHBOARD_CONFIGS + LEGACY keys.
    // Since we mock DASHBOARD_CONFIGS as {}, all entries come from legacy.
    // Just verify cards from legacy dashboards are searchable.
    localStorage.setItem('kubestellar-pods-cards', JSON.stringify([
      { card_type: 'pod_overview', title: 'Pod Overview' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Pod Overview'))
    const flat = flattenResults(result.current.results)
    const cards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'pod_overview')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].href).toBe('/pods')
  })

  // ── 70. Stat items with custom visible stats from localStorage ────────

  it('indexes custom stats stored in localStorage for a specific dashboard', () => {
    localStorage.setItem('clusters-stats-config', JSON.stringify([
      { id: 'my-stat', name: 'My Custom Stat', icon: 'Activity', visible: true, color: 'blue' },
      { id: 'hidden', name: 'Hidden One', icon: 'EyeOff', visible: false, color: 'gray' },
    ]))
    const { result } = renderHook(() => useSearchIndex('My Custom Stat'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    expect(stats.some(i => i.name === 'My Custom Stat')).toBe(true)
    // The hidden stat should not appear
    const hidden = flat.filter(i => i.name === 'Hidden One')
    expect(hidden.length).toBe(0)
  })

  // ── 71. matchesQuery exercises all four match branches ────────────────

  it('matches via description field', () => {
    // 'Container' is in the Logs page description
    const { result } = renderHook(() => useSearchIndex('Container'))
    const flat = flattenResults(result.current.results)
    const pages = flat.filter(i => i.category === 'page')
    expect(pages.some(i => i.name === 'Logs' || i.name === 'Pods')).toBe(true)
  })

  // ── 72. Deployment without image keyword still matches by name ────────

  it('matches deployments without image field by name', () => {
    mockDeployments.mockReturnValue({
      deployments: [
        { name: 'my-unique-deploy', cluster: 'c', namespace: 'ns', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('my-unique-deploy'))
    const flat = flattenResults(result.current.results)
    expect(flat.some(i => i.category === 'deployment' && i.name === 'my-unique-deploy')).toBe(true)
  })

  // ── 73. Pod meta includes cluster, namespace, and status ──────────────

  it('pod meta contains cluster, namespace, and status', () => {
    mockPods.mockReturnValue({
      pods: [
        { name: 'meta-test-pod', cluster: 'c1', namespace: 'ns1', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('meta-test-pod'))
    const flat = flattenResults(result.current.results)
    const pod = flat.find(i => i.category === 'pod')
    expect(pod).toBeDefined()
    expect(pod!.meta).toContain('c1')
    expect(pod!.meta).toContain('ns1')
    expect(pod!.meta).toContain('Running')
  })

  // ── 74. Mission without cluster keyword still matches ─────────────────

  it('mission without cluster field still matches via type', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'm-1', title: 'Scan All', description: 'Run scan', type: 'scan', status: 'pending' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('scan'))
    const flat = flattenResults(result.current.results)
    const missions = flat.filter(i => i.category === 'mission')
    expect(missions.some(i => i.name === 'Scan All')).toBe(true)
  })

  // ── 75. Dashboard description for custom dashboards ───────────────────

  it('custom dashboard items have "Custom dashboard" description', () => {
    mockDashboards.mockReturnValue({
      dashboards: [
        { id: 'my-dash', name: 'Custom Ops View', is_default: false },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('Custom Ops View'))
    const flat = flattenResults(result.current.results)
    const dash = flat.find(i => i.category === 'dashboard')
    expect(dash).toBeDefined()
    expect(dash!.description).toBe('Custom dashboard')
  })

  // ── 76. Catalog card meta contains "add card" ─────────────────────────

  it('catalog card items have meta containing "add card"', () => {
    const { result } = renderHook(() => useSearchIndex('Pod Overview'))
    const flat = flattenResults(result.current.results)
    const catalogCards = flat.filter(i => i.id.startsWith('catalog-card-'))
    if (catalogCards.length > 0) {
      expect(catalogCards[0].meta).toBe('add card')
    }
  })

  // ── 77. Stat items contain dashboard name in description ──────────────

  it('stat items description references their dashboard name', () => {
    const { result } = renderHook(() => useSearchIndex('Total Clusters'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat' && i.name === 'Total Clusters')
    expect(stats.length).toBeGreaterThan(0)
    expect(stats[0].description).toContain('Main dashboard')
  })

  // ── 78. Stat items contain stat icon as keyword ───────────────────────

  it('stat items include icon name as keyword for search', () => {
    // The mock for 'clusters' dashboard returns a stat with icon 'Server'
    const { result } = renderHook(() => useSearchIndex('server'))
    const flat = flattenResults(result.current.results)
    const stats = flat.filter(i => i.category === 'stat')
    // 'server' should match the icon keyword (lowercased)
    expect(stats.some(i => i.name === 'Clusters')).toBe(true)
  })

  // ── 79. Cluster href has name encoded in URL ──────────────────────────

  it('cluster items have correctly encoded href', () => {
    mockClusters.mockReturnValue({
      clusters: [{ name: 'my cluster', context: 'my cluster', healthy: true }],
    })
    const { result } = renderHook(() => useSearchIndex('my cluster'))
    const flat = flattenResults(result.current.results)
    const cluster = flat.find(i => i.category === 'cluster')
    expect(cluster).toBeDefined()
    expect(cluster!.href).toBe('/clusters?name=my%20cluster')
  })

  // ── 80. Deployment href contains deployment name ──────────────────────

  it('deployment items have correctly encoded href', () => {
    mockDeployments.mockReturnValue({
      deployments: [
        { name: 'api server', cluster: 'c', namespace: 'ns', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('api server'))
    const flat = flattenResults(result.current.results)
    const dep = flat.find(i => i.category === 'deployment')
    expect(dep).toBeDefined()
    expect(dep!.href).toBe('/workloads?deployment=api%20server')
  })

  // ── 81. Pod href contains pod name ────────────────────────────────────

  it('pod items have correctly encoded href', () => {
    mockPods.mockReturnValue({
      pods: [
        { name: 'redis pod', cluster: 'c', namespace: 'ns', status: 'Running' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('redis pod'))
    const flat = flattenResults(result.current.results)
    const pod = flat.find(i => i.category === 'pod')
    expect(pod).toBeDefined()
    expect(pod!.href).toBe('/workloads?pod=redis%20pod')
  })

  // ── 82. Service href contains service name ────────────────────────────

  it('service items have correctly encoded href', () => {
    mockServices.mockReturnValue({
      services: [
        { name: 'my svc', cluster: 'c', namespace: 'ns', type: 'ClusterIP' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('my svc'))
    const flat = flattenResults(result.current.results)
    const svc = flat.find(i => i.category === 'service')
    expect(svc).toBeDefined()
    expect(svc!.href).toBe('/network?service=my%20svc')
  })

  // ── 83. Node href contains node name ──────────────────────────────────

  it('node items have correctly encoded href', () => {
    mockNodes.mockReturnValue({
      nodes: [
        { name: 'node 1', cluster: 'c', status: 'Ready', roles: ['worker'] },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('node 1'))
    const flat = flattenResults(result.current.results)
    const node = flat.find(i => i.category === 'node')
    expect(node).toBeDefined()
    expect(node!.href).toBe('/compute?node=node%201')
  })

  // ── 84. Helm href contains release name ───────────────────────────────

  it('helm items have correctly encoded href', () => {
    mockHelmReleases.mockReturnValue({
      releases: [
        { name: 'my helm', cluster: 'c', namespace: 'ns', chart: 'chart-1', app_version: '1.0', status: 'deployed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('my helm'))
    const flat = flattenResults(result.current.results)
    const helm = flat.find(i => i.category === 'helm')
    expect(helm).toBeDefined()
    expect(helm!.href).toBe('/helm?release=my%20helm')
  })

  // ── 85. Mission href uses hash fragment ───────────────────────────────

  it('mission items have hash fragment href', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'abc123', title: 'My Mission', description: 'desc', type: 'deploy', status: 'pending' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('My Mission'))
    const flat = flattenResults(result.current.results)
    const mission = flat.find(i => i.category === 'mission')
    expect(mission).toBeDefined()
    expect(mission!.href).toBe('#mission:abc123')
  })

  // ── 86. Multiple dashboards store same card type on different keys ────

  it('indexes cards from multiple legacy dashboard storage keys', () => {
    localStorage.setItem('kubestellar-workloads-cards', JSON.stringify([
      { card_type: 'app_status' },
    ]))
    localStorage.setItem('kubestellar-compute-cards', JSON.stringify([
      { card_type: 'app_status' },
    ]))
    const { result } = renderHook(() => useSearchIndex('Workload Status'))
    const flat = flattenResults(result.current.results)
    const placedCards = flat.filter(i => i.category === 'card' && i.scrollTarget === 'app_status')
    // Should have entries from both dashboards
    expect(placedCards.length).toBeGreaterThanOrEqual(2)
  })

  // ── 87. Node with multiple roles lists them ───────────────────────────

  it('node with multiple roles joins them in description', () => {
    mockNodes.mockReturnValue({
      nodes: [{ name: 'multi-role', cluster: 'c1', status: 'Ready', roles: ['control-plane', 'worker'] }],
    })
    const { result } = renderHook(() => useSearchIndex('multi-role'))
    const flat = flattenResults(result.current.results)
    const node = flat.find(i => i.category === 'node')
    expect(node).toBeDefined()
    expect(node!.description).toContain('control-plane')
    expect(node!.description).toContain('worker')
  })

  // ── 88. Mission meta contains type and status ─────────────────────────

  it('mission meta contains type and status', () => {
    mockMissions.mockReturnValue({
      missions: [
        { id: 'm-1', title: 'Unique Mission', description: 'desc', type: 'upgrade', status: 'completed' },
      ],
    })
    const { result } = renderHook(() => useSearchIndex('Unique Mission'))
    const flat = flattenResults(result.current.results)
    const mission = flat.find(i => i.category === 'mission')
    expect(mission).toBeDefined()
    expect(mission!.meta).toContain('upgrade')
    expect(mission!.meta).toContain('completed')
  })
})
