import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock all hook dependencies so the module loads without React context
// ---------------------------------------------------------------------------

vi.mock('../../components/cards/cardMetadata', () => ({
  CARD_TITLES: { gpu_overview: 'GPU Overview', cluster_health: 'Cluster Health' },
  CARD_DESCRIPTIONS: { gpu_overview: 'GPU metrics' },
}))

vi.mock('../../components/ui/StatsBlockDefinitions', () => ({
  getDefaultStatBlocks: vi.fn(() => []),
}))

vi.mock('../mcp/clusters', () => ({ useClusters: vi.fn(() => ({ clusters: [], deduplicatedClusters: [] })) }))
vi.mock('../mcp/workloads', () => ({
  useDeployments: vi.fn(() => ({ deployments: [] })),
  usePods: vi.fn(() => ({ pods: [] })),
}))
vi.mock('../mcp/networking', () => ({ useServices: vi.fn(() => ({ services: [] })) }))
vi.mock('../mcp/compute', () => ({ useNodes: vi.fn(() => ({ nodes: [] })) }))
vi.mock('../mcp/helm', () => ({ useHelmReleases: vi.fn(() => ({ releases: [] })) }))
vi.mock('../useMissions', () => ({ useMissions: vi.fn(() => ({ missions: [] })) }))
vi.mock('../useDashboards', () => ({ useDashboards: vi.fn(() => ({ dashboards: [] })) }))
vi.mock('../../config/dashboards', () => ({
  DASHBOARD_CONFIGS: {
    main: { storageKey: 'kubestellar-main-dashboard-cards', route: '/', name: 'Main' },
    clusters: { storageKey: 'kubestellar-clusters-cards', route: '/clusters', name: 'Clusters' },
  },
}))

import { __testables } from '../useSearchIndex'
import type { SearchItem } from '../useSearchIndex'

const { matchesQuery, buildDashboardStorage, scanPlacedCards } = __testables

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// matchesQuery
// ---------------------------------------------------------------------------

describe('matchesQuery', () => {
  const item: SearchItem = {
    id: 'test-1',
    name: 'GPU Overview',
    description: 'Shows GPU metrics',
    category: 'card',
    keywords: ['gpu', 'nvidia'],
    meta: 'compute accelerator',
  }

  it('matches by name (case-insensitive)', () => {
    expect(matchesQuery(item, 'gpu')).toBe(true)
    expect(matchesQuery(item, 'GPU')).toBe(true)
  })

  it('matches by description', () => {
    expect(matchesQuery(item, 'metrics')).toBe(true)
  })

  it('matches by keyword', () => {
    expect(matchesQuery(item, 'nvidia')).toBe(true)
  })

  it('matches by meta', () => {
    expect(matchesQuery(item, 'accelerator')).toBe(true)
  })

  it('returns false for non-matching query', () => {
    expect(matchesQuery(item, 'kubernetes')).toBe(false)
  })

  it('handles item with no optional fields', () => {
    const minimal: SearchItem = { id: 'x', name: 'Test', category: 'page' }
    expect(matchesQuery(minimal, 'test')).toBe(true)
    expect(matchesQuery(minimal, 'xyz')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildDashboardStorage
// ---------------------------------------------------------------------------

describe('buildDashboardStorage', () => {
  it('returns entries from DASHBOARD_CONFIGS', () => {
    const entries = buildDashboardStorage()
    expect(entries.length).toBeGreaterThan(0)
    const main = entries.find(e => e.route === '/')
    expect(main).toBeDefined()
    expect(main!.name).toBe('Main')
  })

  it('does not duplicate keys', () => {
    const entries = buildDashboardStorage()
    const keys = entries.map(e => e.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// scanPlacedCards
// ---------------------------------------------------------------------------

describe('scanPlacedCards', () => {
  it('returns empty array when no cards in localStorage', () => {
    const result = scanPlacedCards([])
    expect(result).toEqual([])
  })

  it('finds cards placed on built-in dashboards', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { card_type: 'gpu_overview', title: 'GPU Overview' },
      { card_type: 'cluster_health' },
    ]))
    const result = scanPlacedCards([])
    expect(result.length).toBe(2)
    expect(result[0].name).toBe('GPU Overview')
    expect(result[0].category).toBe('card')
    expect(result[0].href).toBe('/')
  })

  it('finds cards on custom dashboards', () => {
    localStorage.setItem('kubestellar-custom-dashboard-abc-cards', JSON.stringify([
      { card_type: 'gpu_overview' },
    ]))
    const result = scanPlacedCards([{ id: 'abc', name: 'My Dashboard' }])
    expect(result.length).toBe(1)
    expect(result[0].description).toContain('My Dashboard')
    expect(result[0].href).toBe('/custom-dashboard/abc')
  })

  it('handles malformed JSON gracefully', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', 'not json')
    expect(() => scanPlacedCards([])).not.toThrow()
    expect(scanPlacedCards([])).toEqual([])
  })

  it('skips cards without card_type', () => {
    localStorage.setItem('kubestellar-main-dashboard-cards', JSON.stringify([
      { title: 'No Type' },
      { card_type: 'gpu_overview' },
    ]))
    const result = scanPlacedCards([])
    expect(result.length).toBe(1)
  })
})
