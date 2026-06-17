import { describe, expect, it } from 'vitest'

import {
  buildDashboardExportFilename,
  calculateClusterStats,
  createCardsFromSuggestions,
  createDashboardCard,
  createRestoredCard,
  createTemplateCards,
  isExpectedDashboardLoadFailure,
} from '../DashboardHelpers'

describe('DashboardHelpers', () => {
  it('aggregates cluster stats with shared health rules', () => {
    expect(calculateClusterStats([
      { name: 'healthy', healthy: true, nodeCount: 3, podCount: 10, namespaces: ['a', 'b'] },
      { name: 'unhealthy', healthy: false, nodeCount: 2, podCount: 5, namespaces: ['c'] },
    ])).toEqual({
      clusterCount: 2,
      healthyClusters: 1,
      unhealthyClusters: 1,
      healthyNodes: 3,
      totalPods: 15,
      totalNamespaces: 3,
      totalNodes: 5,
    })
  })

  it('creates cards for restored, suggested, and templated dashboards', () => {
    const restored = createRestoredCard({ cardType: 'pods', cardTitle: 'Pods' })
    expect(restored.card_type).toBe('pods')
    expect(restored.position).toMatchObject({ x: 0, y: 0 })

    const suggestions = createCardsFromSuggestions([
      { type: 'pods', title: 'Pods', visualization: 'table', config: { foo: 'bar' } },
    ])
    expect(suggestions[0]).toMatchObject({ title: 'Pods', config: { foo: 'bar' } })
    expect(suggestions[0].id).toMatch(/^new-/)

    const aiCard = createDashboardCard('nodes', { demo: true }, 'Nodes', 'ai')
    expect(aiCard).toMatchObject({ card_type: 'nodes', title: 'Nodes', config: { demo: true } })

    const templateCards = createTemplateCards({
      id: 'ops',
      name: 'Ops',
      description: 'Operations',
      icon: 'LayoutDashboard',
      category: 'cluster',
      cards: [{ card_type: 'alerts', title: 'Alerts', config: {}, position: { w: 6, h: 3 } }],
    })
    expect(templateCards[0]).toMatchObject({ card_type: 'alerts', title: 'Alerts', position: { x: 0, y: 0, w: 6, h: 3 } })
  })

  it('preserves expected load-failure detection and export file naming', () => {
    expect(isExpectedDashboardLoadFailure(new Error('Request timeout after 30s'))).toBe(true)
    expect(isExpectedDashboardLoadFailure(new Error('Something else'))).toBe(false)
    expect(buildDashboardExportFilename('My Dashboard')).toBe('my-dashboard.json')
  })
})
