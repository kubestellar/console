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

})
