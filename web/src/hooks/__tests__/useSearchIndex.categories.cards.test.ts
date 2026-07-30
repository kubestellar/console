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
})
